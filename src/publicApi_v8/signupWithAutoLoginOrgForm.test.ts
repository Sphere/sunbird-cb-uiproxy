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
import { upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { getOTP, validateOTP } from './otp'
import { signupWithAutoLoginOrgForm } from './signupWithAutoLoginOrgForm'

const mockAxios = axios as unknown as jest.Mock
const mockGetOTP = getOTP as jest.Mock
const mockValidateOTP = validateOTP as jest.Mock
const mockJwtDecode = jwtDecode as jest.Mock

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

beforeEach(() => mockAxios.mockReset())

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
})
