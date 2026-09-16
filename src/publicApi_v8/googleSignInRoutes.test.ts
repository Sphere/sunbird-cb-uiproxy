/**
 * PHASE 2 — googleSignInRoutes.ts. One route: verify a Google ID token,
 * create-or-recognize the corresponding Sunbird user, then exchange
 * credentials for a Keycloak token. `google-auth-library`'s `OAuth2Client`
 * is instantiated at import time (mocked below, same pattern as pg/cassandra
 * mocks elsewhere in this campaign).
 *
 * Unlike tnnmcAuth(V2).ts and sashaktAuth.ts (which share this same overall
 * shape), this file's `authTokenResponse.data` falsy branch does NOT
 * double-send — both the success (200) and falsy-data (302) branches are the
 * last statements in their `if`/`else`, and the enclosing try/catch ends
 * immediately after. Verified by reading the full function body before
 * assuming the sibling files' bug applied here too — it doesn't.
 */

jest.mock('axios')
jest.mock('jwt-decode', () => jest.fn())
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn(() => ({ verifyIdToken: jest.fn() })),
}))
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('./rolePermission', () => ({
  getCurrentUserRoles: jest.fn(async () => undefined),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    ES_PASSWORD: 'es-pass',
    GOOGLE_CLIENT_ID: 'google-client-id',
    HTTPS_HOST: 'https://kc.test',
    KONG_API_BASE: 'https://kong.test',
    LEARNER_SERVICE_API_BASE: 'https://learner.test',
    SB_API_KEY: 'sb-api-key',
  },
}))

import axios from 'axios'
import jwtDecode from 'jwt-decode'
import { OAuth2Client } from 'google-auth-library'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { getCurrentUserRoles } from './rolePermission'
import { googleAuth } from './googleSignInRoutes'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockJwtDecode = jwtDecode as jest.Mock
const mockGetCurrentUserRoles = getCurrentUserRoles as jest.Mock
const mockVerifyIdToken = (OAuth2Client as unknown as jest.Mock).mock.results[0].value.verifyIdToken as jest.Mock

const agent = () => mountRouter(googleAuth, { session: {} })

const googlePayload = { email: 'user@gmail.test', name: 'Google User' }

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockJwtDecode.mockReset()
  mockGetCurrentUserRoles.mockReset().mockResolvedValue(undefined)
  mockVerifyIdToken.mockReset()
})

function mockKeycloakSuccess() {
  mockAxiosCallable.mockImplementation((config: { url: string }) => {
    if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
    if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
    return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
  })
  mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })
}

describe('POST /callback', () => {
  it('logs in an existing Google user', async () => {
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => googlePayload })
    mockKeycloakSuccess()
    const response = await agent().post('/callback').send({ idToken: 'valid-token' })
    expect(response.status).toBe(200)
    expect(mockGetCurrentUserRoles).toHaveBeenCalledWith(expect.anything(), 'tok-1')
  })

  it('creates a brand-new user when none exists yet', async () => {
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => googlePayload })
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      if (config.url.includes('user/v3/create')) return Promise.resolve(upstreamOk({ responseCode: 'OK' }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })

    const response = await agent().post('/callback').send({ idToken: 'valid-token' })
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('user/v3/create') }))
  })

  it('returns 401 when the Google token itself is invalid', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Invalid token signature'))
    const response = await agent().post('/callback').send({ idToken: 'bad-token' })
    expect(response.status).toBe(401)
  })

  it('returns 401 when the new user has no name (USER_NAME_NOT_PRESENT)', async () => {
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'user@gmail.test', name: '' }) })
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    const response = await agent().post('/callback').send({ idToken: 'valid-token' })
    expect(response.status).toBe(401)
  })

  it('returns 302 when the Keycloak token exchange succeeds with no data (no double-send here)', async () => {
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => googlePayload })
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk(''))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    const response = await agent().post('/callback').send({ idToken: 'valid-token' })
    expect(response.status).toBe(302)
  })

  it('returns 400 when the Keycloak token exchange throws', async () => {
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => googlePayload })
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('openid-connect/token')) return Promise.reject(networkError())
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    const response = await agent().post('/callback').send({ idToken: 'valid-token' })
    expect(response.status).toBe(400)
  })
})
