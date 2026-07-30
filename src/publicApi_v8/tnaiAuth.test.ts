/**
 * tnaiAuth.ts. One route (`/login`): validate a TNAI (Trained Nurses'
 * Association of India) token against an external TNAI endpoint,
 * check whether the user already exists in Sunbird (by email OR by
 * phone — both lookups always run, regardless of which one has a
 * value), create-and-provision the user if neither lookup finds one,
 * then exchange credentials for a Keycloak token via the callable
 * `axios({...})` form throughout (no `axios.get`/`.post`).
 *
 * `getCurrentUserRoles` (./rolePermission) is mocked out entirely —
 * same as tnnmcAuthV2.test.ts / sashaktAuth.test.ts — since it performs
 * its own axios call + `req.session.save()` callback nesting that is
 * out of scope for this route's own test coverage.
 *
 * Real bug found while reading this file (documented in
 * docs/PROD-VERIFICATION.md by the caller, NOT reproduced live — same
 * double-send family as tnnmcAuthV2.ts / sashaktAuth.ts):
 *
 *   if (authTokenResponse.data) {
 *     ...
 *   } else {
 *     res.status(302).json({ msg: AUTH_FAIL, status: 'error' })
 *   }
 *   // (end of try block; unconditional, outside try/catch:)
 *   res.status(200).json({ message: 'success', resRedirectUrl })
 *
 * When the Keycloak token exchange resolves with a falsy `data`, a 302
 * is sent, then execution falls through to the unconditional 200 —
 * a double response-send. Not exercised live here.
 */

jest.mock('axios')
jest.mock('jwt-decode', () => jest.fn())
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('./rolePermission', () => ({
  getCurrentUserRoles: jest.fn(async () => undefined),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    HTTPS_HOST: 'https://kc.test',
    KEYCLOAK_CLIENT_SECRET_TNAI: 'tnai-secret',
    KONG_API_BASE: 'https://kong.test',
    SB_API_KEY: 'sb-api-key',
    SUNBIRD_PROXY_API_BASE: 'https://proxy.test',
    TNAI_ACCESS_KEY: 'tnai-access-key',
    TNAI_USER_DETAILS_URL: 'https://tnai.test/userDetails',
  },
}))

import axios from 'axios'
import jwtDecode from 'jwt-decode'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { getCurrentUserRoles } from './rolePermission'
import { tnaiAuth } from './tnaiAuth'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockJwtDecode = jwtDecode as jest.Mock
const mockGetCurrentUserRoles = getCurrentUserRoles as jest.Mock

const agent = () => mountRouter(tnaiAuth, { session: {} })

const orgRedirect =
  "https://kc.test/app/org-details?orgId=TRAINED NURSES' ASSOCIATION OF INDIA (TNAI)"
const publicHomeRedirect = 'https://kc.test/public/home'

const tnaiUser = {
  email: 'nurse@tnai.test',
  firstname: 'Jane',
  gender: null,
  lastname: 'Doe',
  middlename: null,
  phone: '9876543210',
}

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockJwtDecode.mockReset()
  mockGetCurrentUserRoles.mockReset().mockResolvedValue(undefined)
})

describe('POST /login', () => {
  it('returns 400 when the TNAI token/user-details lookup fails', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('tnai.test/userDetails')) {
        return Promise.reject(networkError())
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent()
      .post('/login')
      .send({ token: encodeURIComponent('bad-token') })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      msg: 'Token invalid or User not present in TNAI',
      status: 'error',
      status_code: 400,
    })
  })

  it('recognizes an existing user (found by email) and completes login', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('tnai.test/userDetails')) {
        return Promise.resolve(
          upstreamOk({ message: 'ok', status: 'success', userDetails: [tnaiUser], userId: 1 })
        )
      }
      if (config.url.includes('exists/email')) {
        return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      }
      if (config.url.includes('exists/phone')) {
        return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      }
      if (config.url.includes('openid-connect/token')) {
        return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })

    const response = await agent()
      .post('/login')
      .send({ token: encodeURIComponent('tnai-token') })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ message: 'success', resRedirectUrl: orgRedirect })
    expect(mockGetCurrentUserRoles).toHaveBeenCalledWith(expect.anything(), 'tok-1')
    // No user-creation calls should fire for a recognized user.
    expect(mockAxiosCallable).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('user/v3/create') })
    )
  })

  it('recognizes an existing user (found by phone only) and completes login', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('tnai.test/userDetails')) {
        return Promise.resolve(
          upstreamOk({ message: 'ok', status: 'success', userDetails: [tnaiUser], userId: 1 })
        )
      }
      if (config.url.includes('exists/email')) {
        return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      }
      if (config.url.includes('exists/phone')) {
        return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      }
      if (config.url.includes('openid-connect/token')) {
        return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })

    const response = await agent()
      .post('/login')
      .send({ token: encodeURIComponent('tnai-token') })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ message: 'success', resRedirectUrl: orgRedirect })
  })

  it('creates a brand-new user, assigns a role, updates the profile, then completes login', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('tnai.test/userDetails')) {
        return Promise.resolve(
          upstreamOk({ message: 'ok', status: 'success', userDetails: [tnaiUser], userId: 1 })
        )
      }
      if (config.url.includes('exists/email') || config.url.includes('exists/phone')) {
        return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      }
      if (config.url.includes('user/v3/create')) {
        return Promise.resolve(upstreamOk({ result: { userId: 'new-1' } }))
      }
      if (config.url.includes('assign/role')) {
        return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      }
      if (config.url.includes('private/v1/update')) {
        return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      }
      if (config.url.includes('openid-connect/token')) {
        return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })

    const response = await agent()
      .post('/login')
      .send({ token: encodeURIComponent('tnai-token') })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ message: 'success', resRedirectUrl: orgRedirect })
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('user/v3/create') })
    )
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('assign/role') })
    )
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('private/v1/update'), method: 'PATCH' })
    )
  })

  it('falls back to the public-home redirect when TNAI returns no userDetails entries', async () => {
    // tnaiUserData = userDetailResponseFromTnai.data.userDetails[0] is
    // `undefined` here, so the very next line's `.email` access throws
    // synchronously. That throw is still inside the route's outer
    // try/catch (lines 49-214), so it is caught safely and produces a
    // single fallback response — not a hang or double-send.
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('tnai.test/userDetails')) {
        return Promise.resolve(
          upstreamOk({ message: 'ok', status: 'success', userDetails: [], userId: 1 })
        )
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent()
      .post('/login')
      .send({ token: encodeURIComponent('tnai-token') })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ message: 'success', resRedirectUrl: publicHomeRedirect })
  })

  it('falls back to the public-home redirect when the Keycloak token exchange throws', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('tnai.test/userDetails')) {
        return Promise.resolve(
          upstreamOk({ message: 'ok', status: 'success', userDetails: [tnaiUser], userId: 1 })
        )
      }
      if (config.url.includes('exists/email') || config.url.includes('exists/phone')) {
        return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      }
      if (config.url.includes('openid-connect/token')) {
        return Promise.reject(networkError())
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent()
      .post('/login')
      .send({ token: encodeURIComponent('tnai-token') })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ message: 'success', resRedirectUrl: publicHomeRedirect })
  })

  it('treats a failed email/phone existence lookup as "not found" and still completes login', async () => {
    // fetchUserBymobileorEmail's own try/catch (tnaiAuth.ts lines 226-250) is
    // a safe, log-only catch with no response side effects, so it's fine to
    // exercise its rejection path live: make the email lookup reject outright
    // (network error) while the phone lookup resolves with a non-OK
    // responseCode. Both cases fall through to "user not found", triggering
    // the creation flow.
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('tnai.test/userDetails')) {
        return Promise.resolve(
          upstreamOk({ message: 'ok', status: 'success', userDetails: [tnaiUser], userId: 1 })
        )
      }
      if (config.url.includes('exists/email')) {
        return Promise.reject(networkError())
      }
      if (config.url.includes('exists/phone')) {
        return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      }
      if (config.url.includes('user/v3/create')) {
        return Promise.resolve(upstreamOk({ result: { userId: 'new-1' } }))
      }
      if (config.url.includes('assign/role')) {
        return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      }
      if (config.url.includes('private/v1/update')) {
        return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      }
      if (config.url.includes('openid-connect/token')) {
        return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })

    const response = await agent()
      .post('/login')
      .send({ token: encodeURIComponent('tnai-token') })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ message: 'success', resRedirectUrl: orgRedirect })
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('user/v3/create') })
    )
  })

  // NOTE: authTokenResponse.data resolving falsy (the `else` branch at
  // tnaiAuth.ts's res.status(302) call, with no `return`) is a documented
  // double-send bug — same family as tnnmcAuthV2.ts / sashaktAuth.ts. The
  // 302 is followed unconditionally by the route's final res.status(200)
  // call, which would throw/reject against a live server. Not reproduced
  // live; see docs/PROD-VERIFICATION.md.
})
