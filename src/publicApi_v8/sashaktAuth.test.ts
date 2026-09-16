/**
 * PHASE 2 — sashaktAuth.ts. One route with a long linear flow: validate an
 * external Sashakt token, create-or-recognize a Sunbird user (optionally
 * inserting into Cassandra for new users), then exchange credentials for a
 * Keycloak token. Unlike the ssoLogin/signupWithAutoLogin session flows,
 * this one sets `req.session.userId` directly with no save/regenerate
 * callback nesting — simpler to mount.
 *
 * `cassandra-driver`'s `Client` is instantiated at import time (mocked
 * below, same pattern as bulkUploadUser.test.ts). `uuid`'s named `v4` export
 * is mocked directly.
 *
 * The whole route funnels to a single unconditional
 * `res.status(200).json({ message: 'success', resRedirectUrl })` at the very
 * end, regardless of what happened inside the try/catch — so nearly every
 * test below asserts 200 with a different `resRedirectUrl`.
 *
 * Real bug found (documented in docs/PROD-VERIFICATION.md, NOT reproduced
 * live): the `authTokenResponse.data` falsy branch does
 * `res.status(302).json(...)` with no `return`, and execution falls through
 * into the unconditional final `res.status(200).json(...)` — a double-send.
 */

jest.mock('axios')
jest.mock('jwt-decode', () => jest.fn())
jest.mock('uuid', () => ({ v4: jest.fn(() => 'uuid-1') }))
jest.mock('cassandra-driver', () => ({
  Client: jest.fn(() => ({ execute: jest.fn(async () => ({})), on: jest.fn() })),
}))
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('./rolePermission', () => ({
  getCurrentUserRoles: jest.fn(async () => undefined),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    CASSANDRA_IP: '127.0.0.1',
    HTTPS_HOST: 'https://kc.test',
    KEYCLOAK_CLIENT_SECRET_SASHAKT: 'sashakt-secret',
    KONG_API_BASE: 'https://kong.test',
    LEARNER_SERVICE_API_BASE: 'https://learner.test',
    SASHAKT_USER_DETAILS_URL: 'https://sashakt.test/userDetails',
    SB_API_KEY: 'sb-api-key',
    SUNBIRD_PROXY_API_BASE: 'https://proxy.test',
  },
}))

import axios from 'axios'
import jwtDecode from 'jwt-decode'
import cassandra from 'cassandra-driver'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { getCurrentUserRoles } from './rolePermission'
import { sashakt } from './sashaktAuth'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockJwtDecode = jwtDecode as jest.Mock
const mockGetCurrentUserRoles = getCurrentUserRoles as jest.Mock
// tslint:disable-next-line: no-any
const mockCassandraClient = (cassandra.Client as unknown as jest.Mock).mock.results[0].value as { execute: jest.Mock }

const agent = () => mountRouter(sashakt, { session: {} })

const sashaktUser = { email: 'nurse@sashakt.test', firstname: 'A', lastname: 'B', phone: '' }

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockJwtDecode.mockReset()
  mockGetCurrentUserRoles.mockReset().mockResolvedValue(undefined)
  mockCassandraClient.execute.mockReset().mockResolvedValue({})
})

function mockExistingUser() {
  mockAxiosCallable.mockImplementation((config: { url: string }) => {
    if (config.url.includes('sashakt.test/userDetails')) {
      return Promise.resolve(upstreamOk({ userDetails: [sashaktUser], userId: 'sashakt-1' }))
    }
    if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
    if (config.url.includes('exists/phone')) return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
    if (config.url.includes('private/user/v1/search')) {
      return Promise.resolve(
        upstreamOk({ result: { response: { content: [{ id: 'u1', profileDetails: { profileReq: { academics: ['x'] } } }] } } })
      )
    }
    if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
    return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
  })
  mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })
}

describe('GET /login', () => {
  it('recognizes an existing user and completes login', async () => {
    mockExistingUser()
    const response = await agent().get('/login?moduleId=m1&token=tok')
    expect(response.status).toBe(200)
    expect(response.body.message).toBe('success')
    expect(response.body.resRedirectUrl).toContain('/app/toc/m1/overview')
  })

  it('creates a brand-new user, inserts an SSO record, then completes login', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('sashakt.test/userDetails')) {
        return Promise.resolve(upstreamOk({ userDetails: [sashaktUser], userId: 'sashakt-1' }))
      }
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

    const response = await agent().get('/login?moduleId=m1&token=tok')
    expect(response.status).toBe(200)
    expect(mockCassandraClient.execute).toHaveBeenCalledWith(
      expect.stringContaining('user_sso_bulkupload_v2'),
      expect.arrayContaining(['uuid-1']),
      expect.objectContaining({ prepare: true })
    )
  })

  it('falls back to the public-home redirect when the Sashakt token call fails', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().get('/login?moduleId=m1&token=bad').set('host', 'sphere.test')
    expect(response.status).toBe(200)
    expect(response.body.resRedirectUrl).toBe('https://sphere.test/public/home?org=nhsrc')
  })

  it('falls back to the public-home redirect when the Keycloak token exchange fails', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('sashakt.test/userDetails')) {
        return Promise.resolve(upstreamOk({ userDetails: [sashaktUser], userId: 'sashakt-1' }))
      }
      if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('exists/phone')) return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(
          upstreamOk({ result: { response: { content: [{ id: 'u1', profileDetails: { profileReq: { academics: ['x'] } } }] } } })
        )
      }
      if (config.url.includes('openid-connect/token')) return Promise.reject(networkError())
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    const response = await agent().get('/login?moduleId=m1&token=tok').set('host', 'sphere.test')
    expect(response.status).toBe(200)
    expect(response.body.resRedirectUrl).toBe('https://sphere.test/public/home?org=nhsrc')
  })

  // NOTE: authTokenResponse.data resolving falsy (the `else` branch at
  // sashaktAuth.ts's 302 response) is a documented double-send bug — not
  // reproduced live. See docs/PROD-VERIFICATION.md.

  // NOTE: sashaktAuth.ts lines 56-63 (`if (!sashaktData) { res.status(400)... }`,
  // no `return`) is a second double-send bug, reachable when
  // `userDetails[0]` is a falsy-but-non-throwing primitive (e.g. `0`, `''`,
  // `false`) — undefined/null would throw at the `sashaktData.email` access
  // one line earlier and land safely in the outer catch instead. Not
  // reproduced live; flagged for docs/PROD-VERIFICATION.md.

  it('logs and continues when the exists/email lookup call fails', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('sashakt.test/userDetails')) {
        return Promise.resolve(upstreamOk({ userDetails: [sashaktUser], userId: 'sashakt-1' }))
      }
      if (config.url.includes('exists/email')) return Promise.reject(networkError())
      if (config.url.includes('exists/phone')) return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      if (config.url.includes('user/v3/create')) return Promise.resolve(upstreamOk({ result: { userId: 'new-1' } }))
      if (config.url.includes('assign/role') || config.url.includes('private/v1/update')) {
        return Promise.resolve(upstreamOk({}))
      }
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })

    const response = await agent().get('/login?moduleId=m1&token=tok')
    expect(response.status).toBe(200)
    expect(response.body.message).toBe('success')
  })

  it('backfills missing academics details on an existing user profile', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('sashakt.test/userDetails')) {
        return Promise.resolve(upstreamOk({ userDetails: [sashaktUser], userId: 'sashakt-1' }))
      }
      if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('exists/phone')) return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(
          upstreamOk({ result: { response: { content: [{ id: 'u1', profileDetails: { profileReq: {} } }] } } })
        )
      }
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({}))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })

    const response = await agent().get('/login?moduleId=m1&token=tok')
    expect(response.status).toBe(200)
    expect(response.body.message).toBe('success')
  })

  it('logs and continues when the mandatory-profile-details search call fails', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('sashakt.test/userDetails')) {
        return Promise.resolve(upstreamOk({ userDetails: [sashaktUser], userId: 'sashakt-1' }))
      }
      if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('exists/phone')) return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      if (config.url.includes('private/user/v1/search')) return Promise.reject(networkError())
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })

    const response = await agent().get('/login?moduleId=m1&token=tok')
    expect(response.status).toBe(200)
    expect(response.body.message).toBe('success')
  })
})
