/**
 * PHASE — maharastraNursingCouncilAuth.ts. One route (`POST /login`) that,
 * unlike its siblings (tnnmcAuthV2.ts, sashaktAuth.ts), authenticates the
 * inbound token itself: a JWT signed by the MNC portal with a shared HS256
 * secret (`jwt.verify`), rather than forwarding an opaque token to an
 * upstream "IsValidUser" endpoint. `jsonwebtoken` is used with simple
 * synchronous HS256 sign/verify against a static secret — no JWKS/remote-key
 * lookup — so it is exercised for real (not mocked); only `jwt-decode`
 * (decoding the *Keycloak* access token later in the flow) is mocked, same
 * as every sibling auth file.
 *
 * After JWT verification: check user existence (phone first, then email),
 * fetch full user details, block logins from disallowed orgs, then either
 * register a brand-new user or migrate/update an existing one, and finally
 * exchange credentials for a Keycloak token.
 *
 * Checked carefully for the double-send bug documented in tnnmcAuthV2.ts and
 * sashaktAuth.ts (a `res.status(302)...` in the "Keycloak token response
 * empty" branch with no `return`, falling through into an unconditional
 * final `res.status(200)`): this file's equivalent branch (lines 276-279)
 * DOES have a `return` in front of `res.status(302)...`, so — unlike its two
 * siblings — this route does NOT have that bug. See the NOTE above the
 * Keycloak-failure test below for the full trace.
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
    KEYCLOAK_CLIENT_SECRET_MNC: 'mnc-kc-secret',
    KONG_API_BASE: 'https://kong.test',
    LEARNER_SERVICE_API_BASE: 'https://learner.test',
    MNC_JWT_SECRET: 'mnc-jwt-secret',
    SB_API_KEY: 'sb-api-key',
    SB_EXT_API_BASE_2: 'https://ext2.test',
    SUNBIRD_PROXY_API_BASE: 'https://proxy.test',
  },
}))

import axios from 'axios'
import jwt from 'jsonwebtoken'
import jwtDecode from 'jwt-decode'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { CONSTANTS } from '../utils/env'
import { getCurrentUserRoles } from './rolePermission'
import { maharastraNursingCouncilAuth } from './maharastraNursingCouncilAuth'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockJwtDecode = jwtDecode as jest.Mock
const mockGetCurrentUserRoles = getCurrentUserRoles as jest.Mock

const agent = () => mountRouter(maharastraNursingCouncilAuth, { session: { save: jest.fn((cb: any) => cb()) } })

const AUTH_FAIL_TEXT = 'Authentication failed ! Please check credentials and try again.'

const SECRET = CONSTANTS.MNC_JWT_SECRET as string

function signMncToken(payload: object) {
  return jwt.sign(payload, SECRET, { algorithm: 'HS256', expiresIn: '1h' })
}

const basePayload = {
  designation: 'ANM',
  email: 'nurse@mnc.test',
  firstName: 'Meera',
  lastName: 'Kulkarni',
  phone: '',
  rmNumber: '12345',
  uuid: 'mnc-uuid-1',
}

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockJwtDecode.mockReset().mockReturnValue({ sub: 'f:org:user-1' })
  mockGetCurrentUserRoles.mockReset().mockResolvedValue(undefined)
})

describe('POST /login — request validation', () => {
  it('returns 400 when userToken is missing from the body', async () => {
    const response = await agent().post('/login').send({})
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'userToken is required', status: 'error' })
  })

  it('returns 500 when MNC_JWT_SECRET is not configured', async () => {
    const original = CONSTANTS.MNC_JWT_SECRET
    // tslint:disable-next-line: no-any
    ;(CONSTANTS as any).MNC_JWT_SECRET = undefined
    try {
      const response = await agent().post('/login').send({ userToken: 'whatever' })
      expect(response.status).toBe(500)
      expect(response.body).toEqual({ message: 'Server misconfiguration', status: 'error' })
    } finally {
      // tslint:disable-next-line: no-any
      ;(CONSTANTS as any).MNC_JWT_SECRET = original
    }
  })

  it('returns 401 when the JWT signature is invalid', async () => {
    const badToken = jwt.sign(basePayload, 'wrong-secret', { algorithm: 'HS256', expiresIn: '1h' })
    const response = await agent().post('/login').send({ userToken: badToken })
    expect(response.status).toBe(401)
    expect(response.body.status).toBe('error')
  })

  it('returns 401 when the JWT is expired', async () => {
    const expiredToken = jwt.sign(
      { ...basePayload, exp: Math.floor(Date.now() / 1000) - 60 },
      SECRET,
      { algorithm: 'HS256' }
    )
    const response = await agent().post('/login').send({ userToken: expiredToken })
    expect(response.status).toBe(401)
  })

  it('returns 400 when the JWT payload has neither email nor phone', async () => {
    const token = signMncToken({ ...basePayload, email: undefined, phone: '' })
    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(400)
    expect(response.body.message).toBe('Email or phone is required in token payload.')
  })
})

describe('POST /login — org gating for existing users', () => {
  it('returns 400 FAILURE when an existing user belongs to a disallowed org', async () => {
    const token = signMncToken(basePayload)
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email/')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(
          upstreamOk({ result: { response: { content: [{ id: 'u1', rootOrgName: 'SomeOtherOrg', userId: 'u1' }] } } })
        )
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(400)
    expect(response.body.status).toBe('FAILURE')
    expect(response.body.message).toContain('User already exist on the Sphere platform')
  })
})

describe('POST /login — new user registration', () => {
  it('registers a brand-new user via email (single-word name falls back to lastName=firstName) and completes login', async () => {
    const token = signMncToken({ ...basePayload, firstName: 'Asha', lastName: '', phone: '' })
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email/')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: false } }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(upstreamOk({ result: { response: { content: [] } } }))
      }
      if (config.url.includes('user/v3/create')) return Promise.resolve(upstreamOk({ result: { userId: 'new-1' } }))
      if (config.url.includes('assign/role')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ message: 'success' })
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('user/v3/create'),
        data: expect.objectContaining({
          request: expect.objectContaining({ email: 'nurse@mnc.test', firstName: 'Asha', lastName: 'Asha' }),
        }),
      })
    )
  })

  it('registers a brand-new user via phone when both phone and email are present (phone wins in the create payload)', async () => {
    const token = signMncToken({ ...basePayload, phone: '9876500000' })
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/phone/')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: false } }))
      if (config.url.includes('exists/email/')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: false } }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(upstreamOk({ result: { response: { content: [] } } }))
      }
      if (config.url.includes('user/v3/create')) return Promise.resolve(upstreamOk({ result: { userId: 'new-2' } }))
      if (config.url.includes('assign/role')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('user/v3/create'),
        data: expect.objectContaining({
          request: expect.objectContaining({ phone: '9876500000', phoneVerified: true }),
        }),
      })
    )
  })

  it('still returns 200 when assignRoleToUser fails during new-user registration (its result is never checked)', async () => {
    const token = signMncToken(basePayload)
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email/')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: false } }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(upstreamOk({ result: { response: { content: [] } } }))
      }
      if (config.url.includes('user/v3/create')) return Promise.resolve(upstreamOk({ result: { userId: 'new-3' } }))
      if (config.url.includes('assign/role')) return Promise.reject(networkError())
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(200)
  })

  it('still returns 200 when the profile-update call fails after new-user registration (its result is never checked)', async () => {
    const token = signMncToken(basePayload)
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email/')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: false } }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(upstreamOk({ result: { response: { content: [] } } }))
      }
      if (config.url.includes('user/v3/create')) return Promise.resolve(upstreamOk({ result: { userId: 'new-4' } }))
      if (config.url.includes('assign/role')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('private/v1/update')) return Promise.reject(networkError())
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(200)
  })
})

describe('POST /login — existing user migration/update', () => {
  it('skips org migration when the existing user is already in the MNC org, and completes login (found by phone)', async () => {
    const token = signMncToken({ ...basePayload, phone: '9876511111' })
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/phone/')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(
          upstreamOk({
            result: { response: { content: [{ id: 'u10', rootOrgName: 'Maharashtra Nursing Council', userId: 'u10' }] } },
          })
        )
      }
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('user/v1/migrate') })
    )
  })

  it('migrates an existing "aastrika" org user to MNC, preserving existing professionalDetails entries, then completes login', async () => {
    const token = signMncToken(basePayload)
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email/')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(
          upstreamOk({
            result: {
              response: {
                content: [
                  {
                    id: 'u20',
                    profileDetails: {
                      profileReq: {
                        professionalDetails: [
                          { designation: 'Old', orgType: 'Public/Government Sector', profession: 'Healthcare Worker', uuid: 'old-uuid' },
                          { designation: 'Second', profession: 'Other', uuid: 'second-uuid' },
                        ],
                      },
                    },
                    rootOrgName: 'aastrika',
                    userId: 'u20',
                  },
                ],
              },
            },
          })
        )
      }
      if (config.url.includes('user/v1/migrate')) return Promise.resolve(upstreamOk({ result: { response: 'success' } }))
      if (config.url.includes('assign/role')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('user/v1/migrate') })
    )
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('assign/role') })
    )
  })

  it('migrates an existing "SPhere Team 1" org user to MNC and completes login', async () => {
    const token = signMncToken(basePayload)
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email/')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(
          upstreamOk({ result: { response: { content: [{ id: 'u30', rootOrgName: 'SPhere Team 1', userId: 'u30' }] } } })
        )
      }
      if (config.url.includes('user/v1/migrate')) return Promise.resolve(upstreamOk({ result: { response: 'success' } }))
      if (config.url.includes('assign/role')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(200)
  })

  it('still completes login when migrateUserToMNC returns an unexpected (non-success) response', async () => {
    const token = signMncToken(basePayload)
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email/')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(
          upstreamOk({ result: { response: { content: [{ id: 'u40', rootOrgName: 'aastrika', userId: 'u40' }] } } })
        )
      }
      if (config.url.includes('user/v1/migrate')) return Promise.resolve(upstreamOk({ result: { response: 'unexpected' } }))
      if (config.url.includes('assign/role')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(200)
  })

  it('still completes login when migrateUserToMNC itself throws (its catch block returns false, unchecked by the caller)', async () => {
    const token = signMncToken(basePayload)
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email/')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(
          upstreamOk({ result: { response: { content: [{ id: 'u41', rootOrgName: 'aastrika', userId: 'u41' }] } } })
        )
      }
      if (config.url.includes('user/v1/migrate')) return Promise.reject(networkError())
      if (config.url.includes('assign/role')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(200)
  })

  it('still completes login when assignRoleToUser returns an unexpected (non-SUCCESS) response during migration', async () => {
    const token = signMncToken(basePayload)
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email/')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(
          upstreamOk({ result: { response: { content: [{ id: 'u42', rootOrgName: 'aastrika', userId: 'u42' }] } } })
        )
      }
      if (config.url.includes('user/v1/migrate')) return Promise.resolve(upstreamOk({ result: { response: 'success' } }))
      if (config.url.includes('assign/role')) return Promise.resolve(upstreamOk({ result: { response: 'FAILED' } }))
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(200)
  })

  it('still completes login when the profile-update call returns an unexpected (non-SUCCESS) response', async () => {
    const token = signMncToken(basePayload)
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email/')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(
          upstreamOk({ result: { response: { content: [{ id: 'u43', rootOrgName: 'Maharashtra Nursing Council', userId: 'u43' }] } } })
        )
      }
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'FAILED' } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(200)
  })

  it('treats a non-"OK" responseCode from the existence check as "does not exist" and registers a new user', async () => {
    // fetchUserBymobileorEmail only returns `exists` when responseCode === 'OK';
    // any other responseCode falls through to an implicit `return undefined`,
    // which is falsy — same effective outcome as "not found", exercised here
    // with an explicit non-OK responseCode rather than exists:false.
    const token = signMncToken(basePayload)
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email/')) return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(upstreamOk({ result: { response: { content: [] } } }))
      }
      if (config.url.includes('user/v3/create')) return Promise.resolve(upstreamOk({ result: { userId: 'new-6' } }))
      if (config.url.includes('assign/role')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('user/v3/create') })
    )
  })

  it('treats a network failure on the existence check itself as "does not exist" (its catch block swallows the error) and registers a new user', async () => {
    const token = signMncToken(basePayload)
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email/')) return Promise.reject(networkError())
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(upstreamOk({ result: { response: { content: [] } } }))
      }
      if (config.url.includes('user/v3/create')) return Promise.resolve(upstreamOk({ result: { userId: 'new-8' } }))
      if (config.url.includes('assign/role')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('user/v3/create') })
    )
  })

  it('proceeds straight to Keycloak login (skipping registration/migration) when getUserDetails fails despite the user existing', async () => {
    // fetchUserBymobileorEmail (existence check) succeeds and reports the user
    // exists, but the follow-up getUserDetails() search call fails. Because
    // getUserDetails() catches its own errors and returns { message: 'failed' }
    // (no userDetails field), neither `existingUserResult.message === 'success'`
    // (org gate) nor `existingUserResult.userDetails` (line 225's branch guard)
    // is true, so the route silently skips both handleNewUserRegistration and
    // handleExistingUserMigration and falls through to the Keycloak exchange.
    const token = signMncToken({ ...basePayload, phone: '9876522222' })
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/phone/')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      if (config.url.includes('private/user/v1/search')) return Promise.reject(networkError())
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('user/v3/create') })
    )
    expect(mockAxiosCallable).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('user/v1/migrate') })
    )
  })
})

describe('POST /login — Keycloak token exchange failure', () => {
  it('returns 400 when the Keycloak token exchange throws (caught by the outer catch)', async () => {
    const token = signMncToken(basePayload)
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email/')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: false } }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(upstreamOk({ result: { response: { content: [] } } }))
      }
      if (config.url.includes('user/v3/create')) return Promise.resolve(upstreamOk({ result: { userId: 'new-5' } }))
      if (config.url.includes('assign/role')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('openid-connect/token')) return Promise.reject(networkError())
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ msg: AUTH_FAIL_TEXT, message: 'error' })
  })

  it('returns 302 when the Keycloak token response resolves with no data', async () => {
    // maharastraNursingCouncilAuth.ts lines 276-279:
    //   } else {
    //     logError(...)
    //     return res.status(302).json({ msg: AUTH_FAIL, status: 'error' })
    //   }
    // Unlike the equivalent branches in tnnmcAuthV2.ts and sashaktAuth.ts, this
    // one DOES have a `return` in front of res.status(302), so it does NOT
    // fall through into the unconditional res.status(200) below it — this
    // route does not have the double-send bug its siblings have. Safe to
    // exercise live: it's a single conditional response with no further code
    // path that could double-send.
    const token = signMncToken(basePayload)
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email/')) return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: false } }))
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(upstreamOk({ result: { response: { content: [] } } }))
      }
      if (config.url.includes('user/v3/create')) return Promise.resolve(upstreamOk({ result: { userId: 'new-7' } }))
      if (config.url.includes('assign/role')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('private/v1/update')) return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk(null))
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent().post('/login').send({ userToken: token })
    expect(response.status).toBe(302)
    expect(response.body).toEqual({ msg: AUTH_FAIL_TEXT, status: 'error' })
  })
})
