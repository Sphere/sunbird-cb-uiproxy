/**
 * exchangeSsoKeycloakToken — shared Keycloak password-grant token-exchange
 * helper behind tnaiAuth.ts / tnnmcAuth.ts / sashaktAuth.ts /
 * maternityFoundationAuth.ts (CHANGE 31). Exercised directly here,
 * independent of any single caller's own test file. Each caller keeps its
 * own auth-fail status code / catch behavior / final response shape — this
 * helper only owns the token exchange, decode, and session establishment.
 */

jest.mock('axios')
jest.mock('jwt-decode', () => jest.fn())
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('./rolePermission', () => ({
  getCurrentUserRoles: jest.fn(async () => undefined),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: { HTTPS_HOST: 'https://kc.test' },
}))

import axios from 'axios'
import jwtDecode from 'jwt-decode'
import { exchangeSsoKeycloakToken } from './ssoKeycloakExchange'
import { getCurrentUserRoles } from './rolePermission'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockJwtDecode = jwtDecode as jest.Mock
const mockGetCurrentUserRoles = getCurrentUserRoles as jest.Mock

function mockReq() {
  return { session: {} } as any
}

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockJwtDecode.mockReset()
  mockGetCurrentUserRoles.mockReset()
  mockGetCurrentUserRoles.mockResolvedValue(undefined)
})

/**
 * @description Verifies a successful token exchange decodes the token,
 * establishes req.session.userId/req.kauth/req.session.grant, calls
 * getCurrentUserRoles, and returns the access token.
 */
it('establishes the session and returns the access token on a successful exchange', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { access_token: 'token-abc' } })
  mockJwtDecode.mockReturnValue({ sub: 'realm:sunbird:user-1' })
  const req = mockReq()

  const result = await exchangeSsoKeycloakToken(req, 'TNAI', 'tnai-secret', 'user@example.com')

  expect(result).toBe('token-abc')
  expect(req.session.userId).toBe('user-1')
  expect(req.kauth.grant.access_token.token).toBe('token-abc')
  expect(req.session.grant.access_token.token).toBe('token-abc')
  expect(mockGetCurrentUserRoles).toHaveBeenCalledWith(req, 'token-abc')
})

/**
 * @description Verifies the grant request carries the given clientId/
 * clientSecret/username, and the fixed grant_type/scope every caller
 * originally sent.
 */
it('builds the password-grant request with the given client credentials', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { access_token: 'token-abc' } })
  mockJwtDecode.mockReturnValue({ sub: 'realm:sunbird:user-1' })

  await exchangeSsoKeycloakToken(mockReq(), 'eShashakt', 'sashakt-secret', '9876543210')

  const callArgs = mockAxiosCallable.mock.calls[0][0]
  expect(callArgs.url).toBe('https://kc.test/auth/realms/sunbird/protocol/openid-connect/token')
  expect(callArgs.data).toContain('client_id=eShashakt')
  expect(callArgs.data).toContain('client_secret=sashakt-secret')
  expect(callArgs.data).toContain('grant_type=password')
  expect(callArgs.data).toContain('scope=offline_access')
  expect(callArgs.data).toContain('username=9876543210')
})

/**
 * @description Verifies a falsy token response returns undefined without
 * touching the session or calling getCurrentUserRoles — callers decide
 * their own failure status code and response for this case.
 */
it('returns undefined and leaves the session untouched when the token response is falsy', async () => {
  mockAxiosCallable.mockResolvedValue({ data: null })
  const req = mockReq()

  const result = await exchangeSsoKeycloakToken(req, 'TNAI', 'tnai-secret', 'user@example.com')

  expect(result).toBeUndefined()
  expect(req.session.userId).toBeUndefined()
  expect(req.kauth).toBeUndefined()
  expect(mockGetCurrentUserRoles).not.toHaveBeenCalled()
})

/**
 * @description Verifies a rejected token-exchange call propagates the
 * rejection — callers wrap this in their own try/catch with their own
 * (differing) catch-block behavior, so this helper must not swallow it.
 */
it('propagates a rejection from the token-exchange call', async () => {
  mockAxiosCallable.mockRejectedValue(new Error('network down'))

  await expect(
    exchangeSsoKeycloakToken(mockReq(), 'TNAI', 'tnai-secret', 'user@example.com')
  ).rejects.toThrow('network down')
})

/**
 * @description Concurrency: this helper is shared between 4 live SSO login
 * routes for different partner orgs, which can receive requests at the
 * same time. Fires 2 concurrent exchanges for different orgs/users, with
 * axios and jwt_decode routing their response by the request's own
 * client_id, and confirms each call's session is established with its OWN
 * userId — never the other call's.
 */
it('concurrent exchanges for different orgs never cross-contaminate the session', async () => {
  mockAxiosCallable.mockImplementation((config) => {
    const isTnai = config.data.includes('client_id=TNAI')
    return Promise.resolve({ data: { access_token: isTnai ? 'tnai-token' : 'sashakt-token' } })
  })
  mockJwtDecode.mockImplementation((token) => ({
    sub: token === 'tnai-token' ? 'realm:sunbird:tnai-user' : 'realm:sunbird:sashakt-user',
  }))
  const reqTnai = mockReq()
  const reqSashakt = mockReq()

  const [tnaiToken, sashaktToken] = await Promise.all([
    exchangeSsoKeycloakToken(reqTnai, 'TNAI', 'tnai-secret', 'tnai-user@example.com'),
    exchangeSsoKeycloakToken(reqSashakt, 'eShashakt', 'sashakt-secret', '9876543210'),
  ])

  expect(tnaiToken).toBe('tnai-token')
  expect(sashaktToken).toBe('sashakt-token')
  expect(reqTnai.session.userId).toBe('tnai-user')
  expect(reqSashakt.session.userId).toBe('sashakt-user')
})
