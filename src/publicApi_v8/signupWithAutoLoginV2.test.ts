/**
 * PHASE 1 — signupWithAutoLoginV2.ts. Near-identical to signupWithAutoLogin.ts
 * (same register-then-autologin shape), but NOT identical: `/register`'s
 * "user already exists" branch now has a `return` (fixed vs v1), while
 * `/validateOtpWithLogin`'s missing-otp check does NOT — and unlike v1, it is
 * unconditional here (not nested inside an `if (phone || email)` block), so
 * ANY request with no `otp` field double-sends. Confirmed by reading the
 * code; see docs/PROD-VERIFICATION.md section R. Every live test below
 * supplies a truthy `otp` to stay off that path entirely.
 */

jest.mock('axios')
jest.mock('jwt-decode', () => jest.fn())
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/emailHashPasswordGenerator', () => ({
  encryptData: jest.fn((value: string) => `encrypted(${value})`),
}))
jest.mock('./otp', () => ({
  getOTP: jest.fn(),
  validateOTP: jest.fn(),
}))
jest.mock('./rolePermission', () => ({
  getCurrentUserRoles: jest.fn(async () => undefined),
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
import jwtDecode from 'jwt-decode'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { getOTP, validateOTP } from './otp'
import { getCurrentUserRoles } from './rolePermission'
import { signupWithAutoLoginV2 } from './signupWithAutoLoginV2'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockJwtDecode = jwtDecode as jest.Mock
const mockGetOTP = getOTP as jest.Mock
const mockValidateOTP = validateOTP as jest.Mock
const mockGetCurrentUserRoles = getCurrentUserRoles as jest.Mock

const agent = () => mountRouter(signupWithAutoLoginV2)

function agentWithSession() {
  const session: Record<string, unknown> = {
    regenerate: jest.fn((cb: () => void) => cb()),
    save: jest.fn((cb: () => void) => cb()),
  }
  return { agent: mountRouter(signupWithAutoLoginV2, { session }), session }
}

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
  mockJwtDecode.mockReset()
  mockGetOTP.mockReset()
  mockValidateOTP.mockReset()
  mockGetCurrentUserRoles.mockReset().mockResolvedValue(undefined)
})

describe('POST /register', () => {
  it('creates the account and sends a phone OTP', async () => {
    mockUserDoesNotExist()
    const response = await agent().post('/register').send({ firstName: 'A', phone: '9876543210' })
    expect(response.status).toBe(200)
    expect(response.body.userId).toBe('new-user-1')
  })

  it('creates the account and sends an email OTP', async () => {
    mockUserDoesNotExist()
    mockGetOTP.mockResolvedValue(undefined)
    const response = await agent().post('/register').send({ email: 'a@b.com', firstName: 'A' })
    expect(response.status).toBe(200)
    expect(mockGetOTP).toHaveBeenCalledWith('new-user-1', 'a@b.com', 'email')
  })

  it('returns 400 when the user already exists (this branch has a `return`, unlike v1)', async () => {
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

  it('returns 500 when account creation itself fails (createAccount swallows the error internally, leaving newUserDetail undefined)', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email') || config.url.includes('exists/phone')) {
        return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      }
      if (config.url.includes('user/v3/create')) {
        return Promise.reject(networkError())
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    const response = await agent().post('/register').send({ email: 'a@b.com', firstName: 'A' })
    expect(response.status).toBe(500)
  })

  it('continues and returns 200 when role assignment fails (updateRoles swallows the error internally)', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email') || config.url.includes('exists/phone')) {
        return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      }
      if (config.url.includes('user/v3/create')) {
        return Promise.resolve(upstreamOk({ result: { userId: 'new-user-4' } }))
      }
      if (config.url.includes('assign/role')) {
        return Promise.reject(networkError())
      }
      if (config.url.includes('private/v1/update')) {
        return Promise.resolve(upstreamOk({}))
      }
      if (config.url.includes('control.msg91.com/api/v5/otp') && !config.url.includes('verify') && !config.url.includes('retry')) {
        return Promise.resolve(upstreamOk({ type: 'success' }))
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    const response = await agent().post('/register').send({ firstName: 'A', phone: '9876543210' })
    expect(response.status).toBe(200)
  })

  it('continues and returns 200 when the profile update fails (profileUpdate swallows the error internally)', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email') || config.url.includes('exists/phone')) {
        return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      }
      if (config.url.includes('user/v3/create')) {
        return Promise.resolve(upstreamOk({ result: { userId: 'new-user-5' } }))
      }
      if (config.url.includes('assign/role')) {
        return Promise.resolve(upstreamOk({}))
      }
      if (config.url.includes('private/v1/update')) {
        return Promise.reject(networkError())
      }
      if (config.url.includes('control.msg91.com/api/v5/otp') && !config.url.includes('verify') && !config.url.includes('retry')) {
        return Promise.resolve(upstreamOk({ type: 'success' }))
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    const response = await agent().post('/register').send({ firstName: 'A', phone: '9876543210' })
    expect(response.status).toBe(200)
  })

  it('continues registration when the user-exists lookup itself fails (fetchUserBymobileorEmail swallows the error internally)', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email') || config.url.includes('exists/phone')) {
        return Promise.reject(networkError())
      }
      if (config.url.includes('user/v3/create')) {
        return Promise.resolve(upstreamOk({ result: { userId: 'new-user-6' } }))
      }
      if (config.url.includes('assign/role') || config.url.includes('private/v1/update')) {
        return Promise.resolve(upstreamOk({}))
      }
      if (config.url.includes('control.msg91.com/api/v5/otp') && !config.url.includes('verify') && !config.url.includes('retry')) {
        return Promise.resolve(upstreamOk({ type: 'success' }))
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })
    const response = await agent().post('/register').send({ firstName: 'A', phone: '9876543210' })
    expect(response.status).toBe(200)
    expect(response.body.userId).toBe('new-user-6')
  })

  // Traced by hand: when both email and phone are absent, the validation
  // response at line 139 is missing a `return` (same Pattern-A shape as the
  // documented bug below), so execution falls through with userEmail === ''
  // and userPhone === ''. That guarantees BOTH later `if (userPhone)` /
  // `if (userEmail)` blocks (which are the only other res.* calls in this
  // handler) are skipped, so no second response is ever attempted here — safe
  // to exercise live. This is still a real defect (wasted downstream calls,
  // and fragile: it relies on userPhone/userEmail staying falsy) worth fixing
  // by adding `return` at line 139, but it does not double-send today.
  it('does not double-send when both email and phone are missing, despite the missing `return` after the validation response', async () => {
    mockUserDoesNotExist()
    const response = await agent().post('/register').send({ firstName: 'A' })
    expect(response.status).toBe(400)
    expect(response.body.msg).toBe('Email id or phone both can not be empty')
  })
})

describe('POST /validateOtpWithLogin', () => {
  it('completes phone autologin: verifies OTP, regenerates the session, exchanges for a Keycloak token', async () => {
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
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })

    const { agent: sessionAgent } = agentWithSession()
    const response = await sessionAgent
      .post('/validateOtpWithLogin')
      .send({ otp: '1234', phone: '9876543210', userId: 'user-1' })

    expect(response.status).toBe(200)
    expect(mockGetCurrentUserRoles).toHaveBeenCalledWith(expect.anything(), 'access-tok-1')
  })

  it('rejects an invalid phone OTP', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ type: 'failed' }))
    const response = await agent()
      .post('/validateOtpWithLogin')
      .send({ otp: '0000', phone: '9876543210', userId: 'user-1' })
    expect(response.status).toBe(400)
  })

  it('rejects an invalid email OTP', async () => {
    mockValidateOTP.mockResolvedValue({ data: { result: { response: 'FAILED' } } })
    const response = await agent()
      .post('/validateOtpWithLogin')
      .send({ email: 'a@b.com', otp: '0000', userId: 'user-1' })
    expect(response.status).toBe(400)
  })

  it('returns 400 when neither phone nor email is present (userOtpVerified stays false)', async () => {
    const response = await agent().post('/validateOtpWithLogin').send({ otp: '1234', userId: 'user-1' })
    expect(response.status).toBe(400)
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('returns 500 when OTP verification itself throws', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent()
      .post('/validateOtpWithLogin')
      .send({ otp: '1234', phone: '9876543210', userId: 'user-1' })
    expect(response.status).toBe(500)
  })

  it('completes email autologin: verifies OTP via validateOTP, regenerates the session, exchanges for a Keycloak token', async () => {
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
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-2' })

    const { agent: sessionAgent } = agentWithSession()
    const response = await sessionAgent
      .post('/validateOtpWithLogin')
      .send({ otp: '1234', email: 'a@b.com', userId: 'user-2' })

    expect(response.status).toBe(200)
    expect(mockGetCurrentUserRoles).toHaveBeenCalledWith(expect.anything(), 'access-tok-2')
  })

  it('returns 400 when the Keycloak token exchange fails inside the regenerate callback', async () => {
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
    const { agent: sessionAgent } = agentWithSession()
    const response = await sessionAgent
      .post('/validateOtpWithLogin')
      .send({ otp: '1234', phone: '9876543210', userId: 'user-1' })
    expect(response.status).toBe(400)
  })

  // NOTE: a request with no `otp` field at all is a documented double-send
  // bug (section R) — not reproduced live here.
})
