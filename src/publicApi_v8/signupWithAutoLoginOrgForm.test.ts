/**
 * PHASE 1 — signupWithAutoLoginOrgForm.ts (218 uncovered).
 *
 * Both internal helpers (createAccount, updateRoles, profileUpdate,
 * fetchUserBymobileorEmail, updateUserStatusInDatabase) are unexported, so
 * they are driven through the single global axios mock rather than mocked
 * individually. `pg` is mocked because a Pool is constructed AT IMPORT TIME
 * and `.on('error'|'connect'|'remove', ...)` is called on it immediately.
 */

jest.mock('axios')
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ on: jest.fn(), query: jest.fn() })) }))
jest.mock('jwt-decode')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/emailHashPasswordGenerator', () => ({ encryptData: jest.fn(() => 'enc-pw') }))
jest.mock('./otp', () => ({ getOTP: jest.fn(), validateOTP: jest.fn() }))
jest.mock('./rolePermission', () => ({ getCurrentUserRoles: jest.fn() }))
// Real uuid v4 output is fine for every existing test (nothing asserts on the
// generated id), but one new test needs to force it to throw synchronously
// to reach updateUserStatusInDatabase's outer catch block.
jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid-1') }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    APP_SSO_KEYCLOAK_SECRET: 'secret',
    DATA_LAKE_POSTGRES_DATABASE: 'db',
    DATA_LAKE_POSTGRES_HOST: 'host',
    DATA_LAKE_POSTGRES_PASSWORD: 'pw',
    DATA_LAKE_POSTGRES_PORT: 5432,
    DATA_LAKE_POSTGRES_USER: 'user',
    HTTPS_HOST: 'https://auth.test',
    KONG_API_BASE: 'https://kong.test',
    LEARNER_SERVICE_API_BASE: 'https://learner.test',
    MSG_91_AUTH_KEY_SSO: 'msg91-key',
    MSG_91_TEMPLATE_ID_SEND_OTP_SSO: 'tmpl-1',
    SB_API_KEY: 'sb-api-key',
  },
}))

import axios from 'axios'
import jwtDecode from 'jwt-decode'
import { Pool } from 'pg'
import { v4 as uuidv4 } from 'uuid'
import { encryptData } from '../utils/emailHashPasswordGenerator'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { getOTP, validateOTP } from './otp'
import { signupWithAutoLoginOrgForm } from './signupWithAutoLoginOrgForm'

const mockAxios = axios as unknown as jest.Mock
const mockGetOTP = getOTP as jest.Mock
const mockValidateOTP = validateOTP as jest.Mock
const mockJwtDecode = jwtDecode as jest.Mock
const mockEncryptData = encryptData as jest.Mock
const mockUuidv4 = uuidv4 as jest.Mock

// The pg Pool is constructed once at import time inside the module under
// test (`new (require('pg')).Pool(...)`), and the mock factory above hands
// back a fresh { on, query } per call. Pull out the single instance actually
// wired to pgPool so tests can drive its query() behaviour.
//
// NOTE: this does NOT give access to the historical pgPool.on('error'/
// 'connect'/'remove', ...) calls made at that same import time — jest.config.js
// sets `clearMocks: true`, which wipes every mock's recorded calls before
// EACH test runs (including the first), so that history is gone before any
// it() body executes. Those three handler bodies are therefore left
// uncovered; see final report.
const mockPoolInstance = (Pool as unknown as jest.Mock).mock.results[0].value
const mockPgQuery = mockPoolInstance.query as jest.Mock

const agent = () => mountRouter(signupWithAutoLoginOrgForm)

function workingSession() {
  return {
    clearCookie: jest.fn(),
    // tslint:disable-next-line: no-any
    regenerate: (cb: any) => cb(),
    // tslint:disable-next-line: no-any
    save: (cb: any) => cb(null),
  }
}

const notFound = upstreamOk({ responseCode: 'OK', result: { exists: false } })
const created = upstreamOk({ responseCode: 'OK', result: { userId: 'new-user-1' } })

beforeEach(() => {
  mockAxios.mockReset()
  mockPgQuery.mockReset()
  mockPgQuery.mockResolvedValue(undefined)
})

describe('POST /register', () => {
  it('rejects a request with neither email nor phone', async () => {
    const response = await agent().post('/register').send({})
    expect(response.status).toBe(400)
  })

  it('creates a new user and sends an email OTP', async () => {
    mockAxios
      .mockResolvedValueOnce(notFound) // fetch by email
      .mockResolvedValueOnce(notFound) // fetch by phone
      .mockResolvedValueOnce(created) // createAccount
      .mockResolvedValueOnce(upstreamOk({})) // updateRoles
      .mockResolvedValueOnce(upstreamOk({})) // profileUpdate
    mockGetOTP.mockResolvedValue(upstreamOk({}))

    const response = await agent()
      .post('/register')
      .send({ email: 'new@example.com', firstName: 'A' })

    expect(response.status).toBe(200)
    expect(response.body.userId).toBe('new-user-1')
  })

  it('creates a new user and sends a phone OTP via msg91', async () => {
    mockAxios
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce(upstreamOk({}))
      .mockResolvedValueOnce(upstreamOk({}))
      .mockResolvedValueOnce(upstreamOk({})) // msg91 send

    const response = await agent()
      .post('/register')
      .send({ firstName: 'A', phone: '9876543210' })

    expect(response.status).toBe(200)
    expect(response.body.userId).toBe('new-user-1')
  })

  it('returns 500 when account creation fails', async () => {
    mockAxios
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(notFound)
      .mockRejectedValueOnce(new Error('sunbird down'))

    const response = await agent()
      .post('/register')
      .send({ email: 'new@example.com', firstName: 'A' })

    expect(response.status).toBe(500)
  })

  it('rejects when the user already exists under a non-migratable org', async () => {
    const alreadyExists = upstreamOk({ responseCode: 'OK', result: { exists: true } })
    mockAxios
      .mockResolvedValueOnce(alreadyExists) // fetch by email -> exists
      .mockResolvedValueOnce(notFound) // fetch by phone
      .mockResolvedValueOnce(
        upstreamOk({
          result: { response: { content: [{ identifier: 'u1', rootOrgName: 'Other Org' }] } },
        })
      )

    const response = await agent()
      .post('/register')
      .send({ email: 'exists@example.com', firstName: 'A' })

    expect(response.status).toBe(400)
    expect(response.body.msg).toBe('User already exists')
  })

  it('migrates an existing aastrika-org user instead of rejecting', async () => {
    const alreadyExists = upstreamOk({ responseCode: 'OK', result: { exists: true } })
    mockAxios
      .mockResolvedValueOnce(alreadyExists)
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(
        upstreamOk({
          result: { response: { content: [{ identifier: 'u1', rootOrgName: 'aastrika' }] } },
        })
      )
      .mockResolvedValueOnce(upstreamOk({})) // migrateUserToOrg internals
      .mockResolvedValueOnce(upstreamOk({})) // updateRoles
      .mockResolvedValueOnce(upstreamOk({})) // profileUpdate

    const response = await agent()
      .post('/register')
      .send({ email: 'exists@example.com', firstName: 'A' })

    expect(response.status).toBe(200)
    expect(response.body.userId).toBe('u1')
  })

  it('treats a failed existence-check call as "does not exist" and proceeds with creation', async () => {
    mockAxios
      .mockRejectedValueOnce(networkError()) // fetch by email fails -> caught, returns undefined
      .mockResolvedValueOnce(notFound) // fetch by phone
      .mockResolvedValueOnce(created) // createAccount
      .mockResolvedValueOnce(upstreamOk({})) // updateRoles
      .mockResolvedValueOnce(upstreamOk({})) // profileUpdate
    mockGetOTP.mockResolvedValue(upstreamOk({}))

    const response = await agent()
      .post('/register')
      .send({ email: 'fetch-check-fails@example.com', firstName: 'A' })

    expect(response.status).toBe(200)
    expect(response.body.userId).toBe('new-user-1')
  })

  it('falls back to "User already exists" when the migration search call itself rejects', async () => {
    const alreadyExists = upstreamOk({ responseCode: 'OK', result: { exists: true } })
    mockAxios
      .mockResolvedValueOnce(alreadyExists) // fetch by email -> exists
      .mockResolvedValueOnce(notFound) // fetch by phone
      .mockRejectedValueOnce(networkError()) // searchSb rejects -> caught by inner try/catch

    const response = await agent()
      .post('/register')
      .send({ email: 'search-fail@example.com', firstName: 'A' })

    expect(response.status).toBe(400)
    expect(response.body.msg).toBe('User already exists')
  })

  it('reports a successful migration when the migrate API itself returns SUCCESS', async () => {
    const alreadyExists = upstreamOk({ responseCode: 'OK', result: { exists: true } })
    mockAxios
      .mockResolvedValueOnce(alreadyExists)
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(
        upstreamOk({
          result: { response: { content: [{ identifier: 'u2', rootOrgName: 'aastrika' }] } },
        })
      )
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } })) // migrateUserToOrg succeeds
      .mockResolvedValueOnce(upstreamOk({})) // updateRoles
      .mockResolvedValueOnce(upstreamOk({})) // profileUpdate

    const response = await agent()
      .post('/register')
      .send({ email: 'migrate-success@example.com', firstName: 'A' })

    expect(response.status).toBe(200)
    expect(response.body.userId).toBe('u2')
  })

  it('still reports success (with migration marked failed) when the migrate API call itself rejects', async () => {
    const alreadyExists = upstreamOk({ responseCode: 'OK', result: { exists: true } })
    mockAxios
      .mockResolvedValueOnce(alreadyExists)
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(
        upstreamOk({
          result: { response: { content: [{ identifier: 'u3', rootOrgName: 'aastrika' }] } },
        })
      )
      .mockRejectedValueOnce(networkError()) // migrateUserToOrg axios call rejects
      .mockResolvedValueOnce(upstreamOk({})) // updateRoles
      .mockResolvedValueOnce(upstreamOk({})) // profileUpdate

    const response = await agent()
      .post('/register')
      .send({ email: 'migrate-reject@example.com', firstName: 'A' })

    expect(response.status).toBe(200)
    expect(response.body.userId).toBe('u3')
  })

  it('returns 500 when account creation succeeds but no userId is returned', async () => {
    mockAxios
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(upstreamOk({ result: {} })) // createAccount "succeeds" without a userId

    const response = await agent()
      .post('/register')
      .send({ email: 'no-userid@example.com', firstName: 'A' })

    expect(response.status).toBe(500)
  })

  it('returns 500 when password generation throws before any upstream call is made', async () => {
    mockEncryptData.mockImplementationOnce(() => {
      throw new Error('hash boom')
    })

    const response = await agent()
      .post('/register')
      .send({ email: 'no-password@example.com', firstName: 'A' })

    expect(response.status).toBe(500)
  })

  it('creates a new user and still succeeds when role assignment reports success via rolesAssigned', async () => {
    mockAxios
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce(upstreamOk({ responseCode: 'OK', result: { rolesAssigned: true } })) // updateRoles success
      .mockResolvedValueOnce(upstreamOk({})) // profileUpdate
    mockGetOTP.mockResolvedValue(upstreamOk({}))

    const response = await agent()
      .post('/register')
      .send({ email: 'roles-ok@example.com', firstName: 'A' })

    expect(response.status).toBe(200)
  })

  it('still succeeds when role assignment fails with an axios-style error (has .response)', async () => {
    mockAxios
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(created)
      .mockRejectedValueOnce(upstreamError(500, { error: 'role service down' })) // updateRoles
      .mockResolvedValueOnce(upstreamOk({})) // profileUpdate
    mockGetOTP.mockResolvedValue(upstreamOk({}))

    const response = await agent()
      .post('/register')
      .send({ email: 'roles-axios-err@example.com', firstName: 'A' })

    expect(response.status).toBe(200)
  })

  it('still succeeds when role assignment throws a plain Error', async () => {
    mockAxios
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(created)
      .mockRejectedValueOnce(new Error('boom')) // updateRoles
      .mockResolvedValueOnce(upstreamOk({})) // profileUpdate
    mockGetOTP.mockResolvedValue(upstreamOk({}))

    const response = await agent()
      .post('/register')
      .send({ email: 'roles-plain-err@example.com', firstName: 'A' })

    expect(response.status).toBe(200)
  })

  it('still succeeds when role assignment rejects with a non-Error value', async () => {
    mockAxios
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(created)
      .mockRejectedValueOnce({ weird: 'rejection' }) // updateRoles
      .mockResolvedValueOnce(upstreamOk({})) // profileUpdate
    mockGetOTP.mockResolvedValue(upstreamOk({}))

    const response = await agent()
      .post('/register')
      .send({ email: 'roles-weird-err@example.com', firstName: 'A' })

    expect(response.status).toBe(200)
  })

  it('still succeeds when profile update fails', async () => {
    mockAxios
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce(upstreamOk({})) // updateRoles
      .mockRejectedValueOnce(networkError()) // profileUpdate rejects
    mockGetOTP.mockResolvedValue(upstreamOk({}))

    const response = await agent()
      .post('/register')
      .send({ email: 'profile-fail@example.com', firstName: 'A' })

    expect(response.status).toBe(200)
  })

  it('returns 500 when sending the phone OTP via msg91 fails', async () => {
    mockAxios
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce(upstreamOk({})) // updateRoles
      .mockResolvedValueOnce(upstreamOk({})) // profileUpdate
      .mockRejectedValueOnce(networkError()) // msg91 send fails

    const response = await agent()
      .post('/register')
      .send({ firstName: 'A', phone: '9998887776' })

    expect(response.status).toBe(500)
  })

  it('returns 500 when sending the email OTP fails', async () => {
    mockAxios
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce(upstreamOk({})) // updateRoles
      .mockResolvedValueOnce(upstreamOk({})) // profileUpdate
    mockGetOTP.mockRejectedValueOnce(new Error('otp service down'))

    const response = await agent()
      .post('/register')
      .send({ email: 'otp-fail@example.com', firstName: 'A' })

    expect(response.status).toBe(500)
  })

  it('retries and logs when the PostgreSQL audit insert fails on every attempt', async () => {
    mockPgQuery.mockReset()
    mockPgQuery.mockRejectedValue(new Error('db down'))

    mockAxios
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce(upstreamOk({})) // updateRoles
      .mockResolvedValueOnce(upstreamOk({})) // profileUpdate
    mockGetOTP.mockResolvedValue(upstreamOk({}))

    const response = await agent()
      .post('/register')
      .send({ email: 'db-retry@example.com', firstName: 'A' })

    expect(response.status).toBe(200)
  }, 10000)
})

describe('POST /validateOtpWithLogin', () => {
  it('rejects a request with no otp', async () => {
    const response = await agent().post('/validateOtpWithLogin').send({})
    expect(response.status).toBe(400)
  })

  it('logs in after verifying a phone otp', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ type: 'success' })) // msg91 verify
      .mockResolvedValueOnce(upstreamOk({})) // updateRoles
      .mockResolvedValueOnce(upstreamOk({ access_token: 'jwt-token' })) // token grant
    mockJwtDecode.mockReturnValue({ sub: 'realm:user:uid-1' })

    const response = await mountRouter(signupWithAutoLoginOrgForm, { session: workingSession() })
      .post('/validateOtpWithLogin')
      .send({ otp: '1234', phone: '9876543210', userId: 'uid-1' })

    expect(response.status).toBe(200)
  })

  it('rejects an invalid phone otp', async () => {
    mockAxios.mockResolvedValueOnce(upstreamOk({ type: 'error' }))

    const response = await mountRouter(signupWithAutoLoginOrgForm, { session: workingSession() })
      .post('/validateOtpWithLogin')
      .send({ otp: 'wrong', phone: '9876543210', userId: 'uid-1' })

    expect(response.status).toBe(400)
  })

  it('logs in after verifying an email otp', async () => {
    mockValidateOTP.mockResolvedValue(upstreamOk({ result: { response: 'SUCCESS' } }))
    mockAxios.mockResolvedValueOnce(upstreamOk({})) // updateRoles
    mockAxios.mockResolvedValueOnce(upstreamOk({ access_token: 'jwt-token' })) // token grant
    mockJwtDecode.mockReturnValue({ sub: 'realm:user:uid-2' })

    const response = await mountRouter(signupWithAutoLoginOrgForm, { session: workingSession() })
      .post('/validateOtpWithLogin')
      .send({ email: 'a@b.com', otp: '1234', userId: 'uid-2' })

    expect(response.status).toBe(200)
  })

  it('rejects an invalid email otp', async () => {
    mockValidateOTP.mockResolvedValue(upstreamOk({ result: { response: 'FAILED' } }))

    const response = await mountRouter(signupWithAutoLoginOrgForm, { session: workingSession() })
      .post('/validateOtpWithLogin')
      .send({ email: 'a@b.com', otp: 'wrong', userId: 'uid-2' })

    expect(response.status).toBe(400)
  })

  it('reports OTP validation failed when neither phone nor email is provided', async () => {
    const response = await agent()
      .post('/validateOtpWithLogin')
      .send({ otp: '1234', userId: 'uid-x' })

    expect(response.status).toBe(400)
    expect(response.body.message).toBe('OTP validation failed')
  })

  it('rejects when the phone OTP verification call itself fails', async () => {
    mockAxios.mockRejectedValueOnce(networkError()) // msg91 verify rejects

    const response = await agent()
      .post('/validateOtpWithLogin')
      .send({ otp: '1234', phone: '9876543210', userId: 'uid-3' })

    expect(response.status).toBe(400)
    expect(response.body.message).toBe('Phone OTP validation failed')
  })

  it('rejects when the email OTP verification call itself fails', async () => {
    mockValidateOTP.mockRejectedValueOnce(new Error('otp service down'))

    const response = await agent()
      .post('/validateOtpWithLogin')
      .send({ email: 'a@b.com', otp: '1234', userId: 'uid-4' })

    expect(response.status).toBe(400)
    expect(response.body.message).toBe('Email OTP validation failed')
  })

  it('returns 400 when the final token grant call fails after OTP verification succeeds', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ type: 'success' })) // msg91 verify
      .mockResolvedValueOnce(upstreamOk({})) // updateRoles
      .mockRejectedValueOnce(networkError()) // grantAccessToken rejects

    const response = await mountRouter(signupWithAutoLoginOrgForm, { session: workingSession() })
      .post('/validateOtpWithLogin')
      .send({ otp: '1234', phone: '9876543210', userId: 'uid-5' })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Authentication failed ! Please check credentials and try again.')
  })

  // Uses the DEFAULT agent() (no session middleware injected), so req.session
  // is genuinely undefined once OTP verification succeeds — reproducing what
  // happens if this route is ever hit without session middleware wired up.
  // `req.session.user = null` throws synchronously; it's still inside the
  // route's outer try/catch, so this is a safe, single-response test.
  it('returns 500 when the session is unexpectedly missing after OTP verification', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ type: 'success' })) // msg91 verify
      .mockResolvedValueOnce(upstreamOk({})) // updateRoles

    const response = await agent()
      .post('/validateOtpWithLogin')
      .send({ otp: '1234', phone: '9876543210', userId: 'uid-6' })

    expect(response.status).toBe(500)
  })
})

describe('updateUserStatusInDatabase outer catch (audit logging must never break registration)', () => {
  it('still returns 200 when unique id generation throws before the PostgreSQL insert is attempted', async () => {
    mockUuidv4.mockImplementationOnce(() => {
      throw new Error('uuid boom')
    })

    mockAxios
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce(upstreamOk({})) // updateRoles
      .mockResolvedValueOnce(upstreamOk({})) // profileUpdate
    mockGetOTP.mockResolvedValue(upstreamOk({}))

    const response = await agent()
      .post('/register')
      .send({ email: 'uuid-throws@example.com', firstName: 'A' })

    expect(response.status).toBe(200)
  })
})
