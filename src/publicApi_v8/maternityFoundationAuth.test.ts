/**
 * PHASE 2 — maternityFoundationAuth.ts. One route with the same overall
 * shape as sashaktAuth.ts/tnnmcAuth(V2).ts: validate an external token,
 * create-or-recognize a Sunbird user, exchange for a Keycloak token.
 *
 * Real bugs found (documented in docs/PROD-VERIFICATION.md, NOT reproduced
 * live where dangerous):
 *  - The `authTokenResponse.data` falsy branch does `res.status(400).json(...)`
 *    with no `return`, falling through to an UNCONDITIONAL trailing
 *    `res.status(200).json({ message: 'success' })` — a double-send.
 *  - The outer `catch (err) { logError(...) }` has no response of its own,
 *    and also falls through to that same unconditional 200 — so ANY
 *    unhandled internal error (e.g. a TypeError) still reports `200
 *    { message: 'success' }` to the client. This IS safe to test live
 *    (single response either way), and reveals the route claims success
 *    even when something inside genuinely failed.
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
    KEYCLOAK_CLIENT_SECRET_MATERNITY_FOUNDATION: 'mf-secret',
    KONG_API_BASE: 'https://kong.test',
    MATERNITY_FOUNDATION_ACCESS_KEY: 'mf-access-key',
    MATERNITY_FOUNDATION_USER_DETAILS_URL: 'https://mf.test/userDetails',
    SB_API_KEY: 'sb-api-key',
    SUNBIRD_PROXY_API_BASE: 'https://proxy.test',
  },
}))

import axios from 'axios'
import jwtDecode from 'jwt-decode'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { getCurrentUserRoles } from './rolePermission'
import { maternityFoundationAuth } from './maternityFoundationAuth'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockJwtDecode = jwtDecode as jest.Mock
const mockGetCurrentUserRoles = getCurrentUserRoles as jest.Mock

const agent = () => mountRouter(maternityFoundationAuth, { session: {} })

const mfUser = { email: 'nurse@mf.test', firstName: 'A', lastName: 'B', phone: '' }

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockJwtDecode.mockReset()
  mockGetCurrentUserRoles.mockReset().mockResolvedValue(undefined)
})

function mockExistingUser() {
  mockAxiosCallable.mockImplementation((config: { url: string }) => {
    if (config.url.includes('mf.test/userDetails')) return Promise.resolve(upstreamOk(mfUser))
    if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
    if (config.url.includes('exists/phone')) return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
    if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
    return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
  })
  mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })
}

describe('POST /login', () => {
  it('recognizes an existing user and completes login', async () => {
    mockExistingUser()
    const response = await agent().post('/login').send({ token: encodeURIComponent('mf-token') })
    expect(response.status).toBe(200)
    expect(response.body.message).toBe('success')
    expect(mockGetCurrentUserRoles).toHaveBeenCalledWith(expect.anything(), 'tok-1')
  })

  it('creates a brand-new user, then completes login', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('mf.test/userDetails')) return Promise.resolve(upstreamOk(mfUser))
      if (config.url.includes('exists/email') || config.url.includes('exists/phone')) {
        return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      }
      if (config.url.includes('user/v3/create')) return Promise.resolve(upstreamOk({ result: { userId: 'new-1' } }))
      if (config.url.includes('assign/role') || config.url.includes('private/v1/update')) {
        return Promise.resolve(upstreamOk({}))
      }
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })

    const response = await agent().post('/login').send({ token: encodeURIComponent('mf-token') })
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('user/v3/create') }))
  })

  it('returns 400 when the external token is invalid', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().post('/login').send({ token: encodeURIComponent('bad-token') })
    expect(response.status).toBe(400)
  })

  it('reports 200 "success" even when the Keycloak token exchange throws (documented: outer catch swallows the failure)', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('mf.test/userDetails')) return Promise.resolve(upstreamOk(mfUser))
      if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('exists/phone')) return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      if (config.url.includes('openid-connect/token')) return Promise.reject(networkError())
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    const response = await agent().post('/login').send({ token: encodeURIComponent('mf-token') })
    expect(response.status).toBe(200)
    expect(response.body.message).toBe('success')
  })

  // NOTE: authTokenResponse.data resolving falsy is a documented double-send
  // bug (400 then an unconditional trailing 200) — not reproduced live.
})
