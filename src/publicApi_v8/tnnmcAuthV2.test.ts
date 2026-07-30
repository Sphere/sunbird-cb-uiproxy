/**
 * PHASE 1 — tnnmcAuthV2.ts. One route (`/login`) with a long chain of
 * helpers: validate a TNNMC token, check whether the user exists (two
 * different, inconsistent ways — a Kong "exists" check AND a separate
 * learner-service search), register-or-migrate accordingly, then exchange
 * credentials for a Keycloak token.
 *
 * Real bug found while reading this file (documented in
 * docs/PROD-VERIFICATION.md, NOT reproduced live — same double-send family
 * as changes G/Q/R/S):
 *
 *   if (authTokenResponse.data) {
 *     ...
 *   } else {
 *     res.status(302).json({ msg: AUTH_FAIL, status: 'error' })
 *   }
 *   res.status(200).json({ message: 'success' })   // unconditional!
 *
 * The final 200 is NOT inside the `if` — so when the token exchange
 * succeeds but returns no `data` (the `else` branch), both a 302 AND a 200
 * are sent for the same request.
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
    KEYCLOAK_CLIENT_SECRET_TNNMC: 'tnnmc-secret',
    KONG_API_BASE: 'https://kong.test',
    LEARNER_SERVICE_API_BASE: 'https://learner.test',
    SB_API_KEY: 'sb-api-key',
    SB_EXT_API_BASE_2: 'https://ext2.test',
    SUNBIRD_PROXY_API_BASE: 'https://proxy.test',
    TNNMC_API_KEY: 'tnnmc-api-key',
    TNNMC_API_SECRET: 'tnnmc-api-secret',
    TNNMC_USER_DETAILS_URL: 'https://tnnmc.test/IsValidUser',
  },
}))

import axios from 'axios'
import jwtDecode from 'jwt-decode'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { getCurrentUserRoles } from './rolePermission'
import { tnnmcAuth } from './tnnmcAuthV2'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const mockJwtDecode = jwtDecode as jest.Mock
const mockGetCurrentUserRoles = getCurrentUserRoles as jest.Mock

const agent = () => mountRouter(tnnmcAuth, { session: {} })

const tnnmcUser = {
  category: 'RNM',
  dob: '01/01/1990',
  email: 'nurse@tnnmc.test',
  mobile: '9876543210',
  name: 'Jane Doe',
  tnncno: 123456,
}

function mockNoExistingUser() {
  mockAxios.post.mockResolvedValue(upstreamOk({ data: tnnmcUser, success: true }))
  mockAxiosCallable.mockImplementation((config: { url: string }) => {
    if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
    if (config.url.includes('private/user/v1/search')) {
      return Promise.resolve(upstreamOk({ result: { response: { content: [] } } }))
    }
    if (config.url.includes('user/v3/create')) return Promise.resolve(upstreamOk({ result: { userId: 'new-1' } }))
    if (config.url.includes('assign/role')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
    if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
    if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
    return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
  })
  mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })
}

beforeEach(() => {
  mockAxios.post.mockReset()
  mockAxiosCallable.mockReset()
  mockJwtDecode.mockReset()
  mockGetCurrentUserRoles.mockReset().mockResolvedValue(undefined)
})

describe('POST /login', () => {
  it('registers a brand-new user and completes login', async () => {
    mockNoExistingUser()
    const response = await agent().post('/login').send({ token: encodeURIComponent('tnnmc-token') })
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('user/v3/create') })
    )
  })

  it('migrates an existing aastrika-org user and completes login', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ data: tnnmcUser, success: true }))
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(
          upstreamOk({
            result: { response: { content: [{ id: 'u1', rootOrgName: 'aastrika', userId: 'u1' }] } },
          })
        )
      }
      if (config.url.includes('user/v1/migrate')) return Promise.resolve(upstreamOk({ result: { response: 'success' } }))
      if (config.url.includes('assign/role')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })

    const response = await agent().post('/login').send({ token: encodeURIComponent('tnnmc-token') })
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('user/v1/migrate') })
    )
  })

  it('returns 400 when the TNNMC token itself is invalid', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ success: false }))
    const response = await agent().post('/login').send({ token: encodeURIComponent('bad-token') })
    expect(response.status).toBe(400)
  })

  it('returns 400 when the TNNMC user has no email', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ data: { ...tnnmcUser, email: '' }, success: true }))
    const response = await agent().post('/login').send({ token: encodeURIComponent('tnnmc-token') })
    expect(response.status).toBe(400)
  })

  it('returns 400 when an existing user belongs to a disallowed org', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ data: tnnmcUser, success: true }))
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(
          upstreamOk({ result: { response: { content: [{ id: 'u1', rootOrgName: 'SomeOtherOrg' }] } } })
        )
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    const response = await agent().post('/login').send({ token: encodeURIComponent('tnnmc-token') })
    expect(response.status).toBe(400)
  })

  it('returns 400 when the Keycloak token exchange throws', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ data: tnnmcUser, success: true }))
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(upstreamOk({ result: { response: { content: [] } } }))
      }
      if (config.url.includes('user/v3/create')) return Promise.resolve(upstreamOk({ result: { userId: 'new-1' } }))
      if (config.url.includes('assign/role')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('openid-connect/token')) return Promise.reject(networkError())
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    const response = await agent().post('/login').send({ token: encodeURIComponent('tnnmc-token') })
    expect(response.status).toBe(400)
  })

  // NOTE: authTokenResponse.data being falsy (else branch) is a documented
  // double-send bug above — not reproduced live.
})
