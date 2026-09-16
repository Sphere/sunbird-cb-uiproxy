/**
 * PHASE 1 — appSignUpWithAutoLogin.ts. Looks like signupWithAutoLogin.ts /
 * signupWithAutoLoginV2.ts (register -> create Sunbird user -> send OTP,
 * then validateOtpWithLogin -> verify OTP -> exchange for a Keycloak token)
 * but is NOT identical:
 *  - No session-regenerate / jwt-decode flow at all: this file never touches
 *    req.session and doesn't import jwt-decode or ./rolePermission. The
 *    Keycloak token response is returned directly from
 *    POST /validateOtpWithLogin, so no session/agentWithSession() plumbing
 *    is needed here.
 *  - POST /register's "user already exists" branch HAS a `return` (like V2,
 *    unlike V1) — safe to test live.
 *  - POST /register's "email and phone both missing" branch does NOT have a
 *    `return` (same bug as both siblings) — NOT reproduced live, see note
 *    below.
 *  - POST /validateOtpWithLogin's missing-otp check HAS a `return` (unlike
 *    both siblings) — safe to test live.
 *  - POST /validateOtpWithLogin reads `req.body.mobileNumber` (NOT `phone`
 *    like the siblings) for the phone number field.
 *  - A NEW bug not present in either sibling: if `otp` is present but both
 *    `mobileNumber` and `email` are absent/empty, `userOtpVerified` stays
 *    `false` and there is no `else` branch — the handler falls out of the
 *    `try` block having sent no response at all. NOT reproduced live (would
 *    hang the request). See note below.
 *  - Register success responses include both `userId` AND `userUUId` keys.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/emailHashPasswordGenerator', () => ({
  encryptData: jest.fn((value: string) => `encrypted(${value})`),
}))
jest.mock('./otp', () => ({
  getOTP: jest.fn(),
  validateOTP: jest.fn(),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    APP_SSO_KEYCLOAK_SECRET: 'sso-secret',
    HTTPS_HOST: 'https://kc.test',
    KONG_API_BASE: 'https://kong.test',
    LEARNER_SERVICE_API_BASE: 'https://learner.test',
    MSG_91_AUTH_KEY_SSO: 'msg91-key',
    MSG_91_TEMPLATE_ID_SEND_OTP_SSO: 'tmpl-1',
    SB_API_KEY: 'sb-api-key',
    SUNBIRD_PROXY_API_BASE: 'https://proxy.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { appSignUpWithAutoLogin } from './appSignUpWithAutoLogin'
import { getOTP, validateOTP } from './otp'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockGetOTP = getOTP as jest.Mock
const mockValidateOTP = validateOTP as jest.Mock

const agent = () => mountRouter(appSignUpWithAutoLogin)

/** Resolves "does this user already exist" checks as "no" for both email and phone. */
function mockUserDoesNotExist() {
  mockAxiosCallable.mockImplementation((config: { url: string }) => {
    if (config.url.includes('exists/email') || config.url.includes('exists/phone')) {
      return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
    }
    if (config.url.includes('user/v3/create')) {
      return Promise.resolve(upstreamOk({ result: { userId: 'new-user-1' } }))
    }
    if (config.url.includes('assign/role') || config.url.includes('private/v1/update')) {
      return Promise.resolve(upstreamOk({}))
    }
    if (config.url.includes('control.msg91.com/api/v5/otp') && !config.url.includes('verify') && !config.url.includes('retry')) {
      return Promise.resolve(upstreamOk({ type: 'success' }))
    }
    return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
  })
}

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockGetOTP.mockReset()
  mockValidateOTP.mockReset()
})

describe('POST /register', () => {
  it('creates the account and sends a phone OTP', async () => {
    mockUserDoesNotExist()
    const response = await agent()
      .post('/register')
      .send({ firstName: 'A', lastName: 'B', phone: '9876543210' })
    expect(response.status).toBe(200)
    expect(response.body.userId).toBe('new-user-1')
    expect(response.body.userUUId).toBe('new-user-1')
  })

  it('creates the account and sends an email OTP', async () => {
    mockUserDoesNotExist()
    mockGetOTP.mockResolvedValue(undefined)
    const response = await agent()
      .post('/register')
      .send({ email: 'a@b.com', firstName: 'A', lastName: 'B' })
    expect(response.status).toBe(200)
    expect(response.body.userUUId).toBe('new-user-1')
    expect(mockGetOTP).toHaveBeenCalledWith('new-user-1', 'a@b.com', 'email')
  })

  it('returns 400 when the user already exists (this branch has a `return`)', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email')) {
        return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { exists: true } }))
      }
      return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
    })
    const response = await agent().post('/register').send({ email: 'existing@b.com' })
    expect(response.status).toBe(400)
    expect(mockAxiosCallable).not.toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('user/v3/create') }))
  })

  it('returns 500 when the phone OTP send fails', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email') || config.url.includes('exists/phone')) {
        return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      }
      if (config.url.includes('user/v3/create')) {
        return Promise.resolve(upstreamOk({ result: { userId: 'new-user-1' } }))
      }
      if (config.url.includes('assign/role') || config.url.includes('private/v1/update')) {
        return Promise.resolve(upstreamOk({}))
      }
      return Promise.reject(networkError())
    })
    const response = await agent().post('/register').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
  })

  it('returns 500 when the email OTP send fails', async () => {
    mockUserDoesNotExist()
    mockGetOTP.mockRejectedValue(networkError())
    const response = await agent().post('/register').send({ email: 'a@b.com' })
    expect(response.status).toBe(500)
  })

  it('returns 500 when account creation itself fails downstream', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email') || config.url.includes('exists/phone')) {
        return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      }
      // user/v3/create rejects; createAccount() swallows the error internally
      // and returns undefined, so `newUserDetail.data.result.userId` throws
      // and is caught by the outer handler catch -> a single 500 response.
      return Promise.reject(networkError())
    })
    const response = await agent().post('/register').send({ email: 'a@b.com' })
    expect(response.status).toBe(500)
  })

  it('still succeeds when the existence check, role update, and profile update all fail downstream (all three are independently caught and swallowed)', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email') || config.url.includes('exists/phone')) {
        return Promise.reject(networkError())
      }
      if (config.url.includes('user/v3/create')) {
        return Promise.resolve(upstreamOk({ result: { userId: 'new-user-1' } }))
      }
      if (config.url.includes('assign/role') || config.url.includes('private/v1/update')) {
        return Promise.reject(networkError())
      }
      if (config.url.includes('control.msg91.com/api/v5/otp') && !config.url.includes('verify') && !config.url.includes('retry')) {
        return Promise.resolve(upstreamOk({ type: 'success' }))
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    const response = await agent()
      .post('/register')
      .send({ firstName: 'A', lastName: 'B', phone: '9876543210' })
    expect(response.status).toBe(200)
    expect(response.body.userId).toBe('new-user-1')
  })

  // NOTE: "email and phone both missing" is a documented double-send bug
  // (see file header) — not reproduced live.
})

describe('POST /validateOtpWithLogin', () => {
  it('returns 400 when otp is missing (this check has a `return`, unlike both siblings)', async () => {
    const response = await agent().post('/validateOtpWithLogin').send({})
    expect(response.status).toBe(400)
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('completes phone autologin: verifies OTP via msg91 and exchanges for a Keycloak token', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('msg91.com/api/v5/otp/verify')) {
        return Promise.resolve(upstreamOk({ type: 'success' }))
      }
      if (config.url.includes('assign/role')) {
        return Promise.resolve(upstreamOk({}))
      }
      if (config.url.includes('openid-connect/token')) {
        return Promise.resolve(upstreamOk({ access_token: 'access-tok-1' }))
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent()
      .post('/validateOtpWithLogin')
      .send({ mobileNumber: '9876543210', otp: '1234', userId: 'user-1' })

    expect(response.status).toBe(200)
    expect(response.body.access_token).toBe('access-tok-1')
    expect(response.body.status).toBe(200)
  })

  it('completes email autologin: verifies OTP via validateOTP and exchanges for a Keycloak token', async () => {
    mockValidateOTP.mockResolvedValue({ data: { result: { response: 'SUCCESS' } } })
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('assign/role')) {
        return Promise.resolve(upstreamOk({}))
      }
      if (config.url.includes('openid-connect/token')) {
        return Promise.resolve(upstreamOk({ access_token: 'access-tok-2' }))
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent()
      .post('/validateOtpWithLogin')
      .send({ email: 'a@b.com', otp: '1234', userId: 'user-1' })

    expect(response.status).toBe(200)
    expect(response.body.access_token).toBe('access-tok-2')
  })

  it('rejects an invalid phone OTP', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ type: 'failed' }))
    const response = await agent()
      .post('/validateOtpWithLogin')
      .send({ mobileNumber: '9876543210', otp: '0000', userId: 'user-1' })
    expect(response.status).toBe(400)
  })

  it('rejects an invalid email OTP', async () => {
    mockValidateOTP.mockResolvedValue({ data: { result: { response: 'FAILED' } } })
    const response = await agent()
      .post('/validateOtpWithLogin')
      .send({ email: 'a@b.com', otp: '0000', userId: 'user-1' })
    expect(response.status).toBe(400)
  })

  it('returns 401 when the Keycloak token exchange fails after OTP verification succeeds', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('msg91.com/api/v5/otp/verify')) {
        return Promise.resolve(upstreamOk({ type: 'success' }))
      }
      if (config.url.includes('assign/role')) {
        return Promise.resolve(upstreamOk({}))
      }
      if (config.url.includes('openid-connect/token')) {
        return Promise.reject(networkError())
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent()
      .post('/validateOtpWithLogin')
      .send({ mobileNumber: '9876543210', otp: '1234', userId: 'user-1' })

    expect(response.status).toBe(401)
    expect(response.body.message).toBe('Keycloak failed')
  })

  it('returns 500 when OTP verification itself throws', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent()
      .post('/validateOtpWithLogin')
      .send({ mobileNumber: '9876543210', otp: '1234', userId: 'user-1' })
    expect(response.status).toBe(500)
  })

  // NOTE: an `otp` present but with neither `mobileNumber` nor `email` is a
  // documented "no response sent at all" hang bug (see file header) — not
  // reproduced live.
})
