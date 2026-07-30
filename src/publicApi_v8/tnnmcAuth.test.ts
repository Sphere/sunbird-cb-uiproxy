/**
 * PHASE 1 — tnnmcAuth.ts (the OLDER v1 sibling of tnnmcAuthV2.ts). One route
 * (`/login`): validate a TNNMC token, check whether the user already exists
 * by EITHER email or mobile (two separate Kong "exists" lookups — unlike v2,
 * which only checks by email and additionally cross-checks a learner-service
 * org), register a new user inline if neither exists, then exchange
 * credentials for a Keycloak token.
 *
 * Real bug found while reading this file (documented for
 * docs/PROD-VERIFICATION.md, NOT reproduced live — same double-send family
 * already documented for tnnmcAuthV2.ts):
 *
 *   if (authTokenResponse.data) {
 *     ...
 *   } else {
 *     res.status(302).json({ msg: AUTH_FAIL, status: 'error' })
 *   }
 *   } catch (err) { ... }
 *   res.status(200).json({ message: 'success' })   // unconditional, outside try/catch!
 *
 * When the token exchange succeeds but returns a falsy `data`, the handler
 * sends a 302 and then falls through (no exception was thrown, so the
 * catch block is skipped) straight into the unconditional 200 send at the
 * very end of the handler — two responses for one request. Not reproduced
 * live because it triggers Express's "Cannot set headers after they are
 * sent" crash / hangs the supertest client.
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
    SB_API_KEY: 'sb-api-key',
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
import { tnnmcAuth } from './tnnmcAuth'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const mockJwtDecode = jwtDecode as jest.Mock
const mockGetCurrentUserRoles = getCurrentUserRoles as jest.Mock

const agent = () => mountRouter(tnnmcAuth, { session: {} })

const tnnmcUser = {
  category: 'RNM',
  email: 'nurse@tnnmc.test',
  mobile: '9876543210',
  name: 'Jane Doe',
  tnncno: 123456,
}

/** Default dispatcher: nobody exists yet, everything downstream succeeds. */
function mockNoExistingUser() {
  mockAxios.post.mockResolvedValue(upstreamOk({ data: tnnmcUser, success: true }))
  mockAxiosCallable.mockImplementation((config: { url: string }) => {
    if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
    if (config.url.includes('exists/phone')) return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
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
  it('registers a brand-new user (found by neither email nor phone) and completes login', async () => {
    mockNoExistingUser()
    const response = await agent().post('/login').send({ token: encodeURIComponent('tnnmc-token') })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ message: 'success' })
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('user/v3/create') })
    )
    expect(mockGetCurrentUserRoles).toHaveBeenCalled()
  })

  it('logs in an existing user found by email without creating an account', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ data: tnnmcUser, success: true }))
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('exists/phone')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })

    const response = await agent().post('/login').send({ token: encodeURIComponent('tnnmc-token') })
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('user/v3/create') })
    )
  })

  it('logs in an existing user found only by phone (not email) without creating an account', async () => {
    const phoneOnlyUser = { ...tnnmcUser, email: '' }
    mockAxios.post.mockResolvedValue(upstreamOk({ data: phoneOnlyUser, success: true }))
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      if (config.url.includes('exists/phone')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-2' })

    const response = await agent().post('/login').send({ token: encodeURIComponent('tnnmc-token') })
    expect(response.status).toBe(200)
    // username used for the Keycloak exchange must fall back to the phone number
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('openid-connect/token'),
        data: expect.stringContaining(`username=${phoneOnlyUser.mobile}`),
      })
    )
  })

  it('treats a failed existence lookup (network error) as "user not found" and still registers them', async () => {
    // fetchUserBymobileorEmail has its own try/catch and swallows failures,
    // returning undefined rather than throwing — safe to reproduce live.
    mockAxios.post.mockResolvedValue(upstreamOk({ data: tnnmcUser, success: true }))
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email')) return Promise.reject(networkError())
      if (config.url.includes('exists/phone')) return Promise.reject(networkError())
      if (config.url.includes('user/v3/create')) return Promise.resolve(upstreamOk({ result: { userId: 'new-1' } }))
      if (config.url.includes('assign/role')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-3' })

    const response = await agent().post('/login').send({ token: encodeURIComponent('tnnmc-token') })
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('user/v3/create') })
    )
  })

  it('returns 400 when the TNNMC token is invalid (success != true)', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ success: false }))
    const response = await agent().post('/login').send({ token: encodeURIComponent('bad-token') })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      msg: 'Token invalid or User not present in TNNMC',
      status: 'error',
      status_code: 400,
    })
  })

  it('returns 400 when fetching user details from TNNMC throws', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/login').send({ token: encodeURIComponent('tnnmc-token') })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      msg: 'Issued occured while fetching user details from TNNMC',
      status: 'error',
      status_code: 400,
    })
  })

  it('returns 400 when the Keycloak token exchange throws', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ data: tnnmcUser, success: true }))
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('exists/phone')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('openid-connect/token')) return Promise.reject(networkError())
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    const response = await agent().post('/login').send({ token: encodeURIComponent('tnnmc-token') })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ msg: expect.stringContaining('Authentication failed'), message: 'error' })
  })

  it('returns 400 when new-user creation throws (e.g. create-user call fails)', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ data: tnnmcUser, success: true }))
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      if (config.url.includes('exists/phone')) return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      if (config.url.includes('user/v3/create')) return Promise.reject(networkError())
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    const response = await agent().post('/login').send({ token: encodeURIComponent('tnnmc-token') })
    expect(response.status).toBe(400)
  })

  // NOTE: authTokenResponse.data being falsy (else branch, sends 302) is a
  // documented double-send bug (see file header) — deliberately not
  // reproduced live, since the handler still falls through afterwards to an
  // unconditional res.status(200).json(...) call outside the try/catch.
})
