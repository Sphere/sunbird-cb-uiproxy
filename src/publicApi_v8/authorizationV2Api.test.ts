/**
 * authorizationV2Api.ts — NOT an Express router. It exports a single plain
 * async function `authorizationV2Api(username, password, request)` that is
 * not called anywhere else in src/ (confirmed via grep) — likely superseded
 * by ssoLogin.ts's `/login` route, which does the same
 * generate-token -> jwt_decode -> verify-token -> getCurrentUserRoles
 * sequence inline. There is no router to mount here, so this suite calls the
 * exported function directly with a hand-built request-like object, the
 * same way rolePermission.test.ts calls its plain helpers.
 *
 * The entire body (both axios calls, the jwt_decode call, the
 * decodedToken.sub.split(':'), and the awaited getCurrentUserRoles call) is
 * wrapped in ONE try/catch that only logs on error and unconditionally
 * `return`s `true` afterwards, success or failure. There is no res.send
 * anywhere (this isn't a route handler), so the Pattern A/B double-send /
 * zero-response families don't apply, and every failure mode here resolves
 * safely rather than hanging or crashing:
 *  - `getCurrentUserRoles(request, accessToken)` IS awaited, inside this
 *    try/catch (line: `await getCurrentUserRoles(request, accessToken)`),
 *    unlike the fire-and-forget `setRolesData(...)` call *inside*
 *    getCurrentUserRoles itself (documented in rolePermission.test.ts).
 *    Because it's mocked out wholesale here, that inner real-implementation
 *    risk is out of scope for this file; what matters for THIS file is that
 *    a rejection from the mock is safely caught by the outer try/catch --
 *    exercised live below.
 *  - synchronous throws (bad jwt_decode input, missing `.sub`, missing
 *    `request.session`) are also caught by the same try/catch, since JS
 *    try/catch catches synchronous exceptions the same as awaited
 *    rejections.
 * No real bugs found in this file; nothing skipped.
 */

jest.mock('axios')
jest.mock('jwt-decode', () => jest.fn())
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('./rolePermission', () => ({
  getCurrentUserRoles: jest.fn(),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    HTTPS_HOST: 'https://kc.test',
    TIMEOUT: 10000,
  },
}))

import axios from 'axios'
import jwtDecode from 'jwt-decode'
import { authorizationV2Api } from './authorizationV2Api'
import { getCurrentUserRoles } from './rolePermission'
import { networkError, upstreamOk } from '../test-support/mockAxios'

const mockAxios = axios as unknown as jest.Mock
const mockJwtDecode = jwtDecode as jest.Mock
const mockGetCurrentUserRoles = getCurrentUserRoles as jest.Mock

// tslint:disable-next-line: no-any
const makeRequest = (): any => ({ session: {} })

beforeEach(() => {
  mockAxios.mockReset()
  mockJwtDecode.mockReset()
  mockGetCurrentUserRoles.mockReset()
})

/**
 * @description Verifies the authorizationV2Api helper exchanges credentials
 * for a token, decodes/verifies it, and fetches roles on success, while
 * every failure mode along the way (token exchange, verify-token,
 * jwt_decode, missing sub/session, getCurrentUserRoles) is safely caught and
 * still resolves to true without throwing.
 */
describe('authorizationV2Api', () => {
  it('should exchange credentials, decode the token, verify it, and fetch roles on full success', async () => {
    mockAxios.mockImplementation((config: { url: string }) => {
      if (config.url.includes('userinfo')) {
        return Promise.resolve(upstreamOk({ name: 'Jane Doe' }))
      }
      return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })
    mockGetCurrentUserRoles.mockResolvedValue(undefined)

    const request = makeRequest()
    const result = await authorizationV2Api('jane', 'secret', request)

    expect(result).toBe(true)
    expect(request.session.userId).toBe('user-1')
    expect(request.kauth).toEqual({ grant: { access_token: 'tok-1' } })
    expect(request.session.grant).toEqual({ access_token: 'tok-1' })
    expect(mockGetCurrentUserRoles).toHaveBeenCalledWith(request, 'tok-1')

    expect(mockAxios).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: 'client_id=portal&grant_type=password&password=secret&username=jane',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        url: 'https://kc.test/auth/realms/sunbird/protocol/openid-connect/token',
      })
    )
    expect(mockAxios).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        headers: { Authorization: 'Bearer tok-1' },
        method: 'GET',
        url: 'https://kc.test/auth/realms/sunbird/protocol/openid-connect/userinfo',
      })
    )
  })

  it('should skip getCurrentUserRoles when the verify-token response has no name', async () => {
    mockAxios.mockImplementation((config: { url: string }) => {
      if (config.url.includes('userinfo')) {
        return Promise.resolve(upstreamOk({}))
      }
      return Promise.resolve(upstreamOk({ access_token: 'tok-2' }))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-2' })

    const request = makeRequest()
    const result = await authorizationV2Api('jane', 'secret', request)

    expect(result).toBe(true)
    expect(request.session.userId).toBe('user-2')
    expect(mockGetCurrentUserRoles).not.toHaveBeenCalled()
  })

  it('should skip the verify-token call and getCurrentUserRoles when no access_token comes back', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-3' })

    const request = makeRequest()
    const result = await authorizationV2Api('jane', 'secret', request)

    expect(result).toBe(true)
    expect(request.session.userId).toBe('user-3')
    expect(mockAxios).toHaveBeenCalledTimes(1)
    expect(mockGetCurrentUserRoles).not.toHaveBeenCalled()
  })

  it('should return true and leave the session untouched when the generate-token call fails', async () => {
    mockAxios.mockRejectedValue(networkError())

    const request = makeRequest()
    const result = await authorizationV2Api('jane', 'secret', request)

    expect(result).toBe(true)
    expect(request.session.userId).toBeUndefined()
    expect(mockJwtDecode).not.toHaveBeenCalled()
    expect(mockGetCurrentUserRoles).not.toHaveBeenCalled()
  })

  it('should return true when the verify-token call fails, after already having set the session from the first call', async () => {
    mockAxios.mockImplementation((config: { url: string }) => {
      if (config.url.includes('userinfo')) {
        return Promise.reject(networkError())
      }
      return Promise.resolve(upstreamOk({ access_token: 'tok-4' }))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-4' })

    const request = makeRequest()
    const result = await authorizationV2Api('jane', 'secret', request)

    expect(result).toBe(true)
    expect(request.session.userId).toBe('user-4')
    expect(mockGetCurrentUserRoles).not.toHaveBeenCalled()
  })

  it('should return true (own failure path caught) when getCurrentUserRoles rejects', async () => {
    mockAxios.mockImplementation((config: { url: string }) => {
      if (config.url.includes('userinfo')) {
        return Promise.resolve(upstreamOk({ name: 'Jane Doe' }))
      }
      return Promise.resolve(upstreamOk({ access_token: 'tok-5' }))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-5' })
    mockGetCurrentUserRoles.mockRejectedValue(new Error('roles lookup failed'))

    const request = makeRequest()
    const result = await authorizationV2Api('jane', 'secret', request)

    expect(result).toBe(true)
    expect(mockGetCurrentUserRoles).toHaveBeenCalledWith(request, 'tok-5')
  })

  it('should return true when jwt_decode throws on a malformed token', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ access_token: 'tok-6' }))
    mockJwtDecode.mockImplementation(() => {
      throw new Error('malformed token')
    })

    const request = makeRequest()
    const result = await authorizationV2Api('jane', 'secret', request)

    expect(result).toBe(true)
    expect(request.session.userId).toBeUndefined()
    expect(mockAxios).toHaveBeenCalledTimes(1)
  })

  it('should return true when the decoded token has no sub claim to split', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ access_token: 'tok-7' }))
    mockJwtDecode.mockReturnValue({})

    const request = makeRequest()
    const result = await authorizationV2Api('jane', 'secret', request)

    expect(result).toBe(true)
    expect(request.session.userId).toBeUndefined()
  })

  it('should return true without throwing when request.session is absent', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ access_token: 'tok-8' }))
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-8' })

    // tslint:disable-next-line: no-any
    const request: any = {}
    const result = await authorizationV2Api('jane', 'secret', request)

    expect(result).toBe(true)
    expect(request).toEqual({})
  })
})
