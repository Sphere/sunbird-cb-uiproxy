/**
 * PHASE 1 — signupWithAutoLogin.ts. A register-then-autologin flow: create a
 * Sunbird user, send an OTP, verify it, then regenerate the Express session
 * and exchange credentials for a Keycloak token (jwt-decode'd).
 *
 * Two real double-send bugs found while reading this file (documented in
 * docs/PROD-VERIFICATION.md, NOT reproduced live — same category as the
 * ERR_HTTP_HEADERS_SENT bugs found earlier this session in userRegistration.ts
 * and emailOrMobileLoginSignIn.ts):
 *  - POST /register: `if (!email && !phone) { res.status(400)... }` has no
 *    `return` — execution continues into the create-account flow and sends a
 *    second response.
 *  - POST /register: `if (resultEmail || resultPhone) { res.status(400)... }`
 *    (user already exists) has no `return` either — same double-send risk.
 *  - POST /validateOtpWithLogin: `if (!req.body.otp) { res.status(400)... }`
 *    has no `return`; if otp is missing AND phone/email is present, a SECOND
 *    400 is sent immediately after by the `if (!validOtp) { ...; return }`
 *    check a few lines later.
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
import { signupWithAutoLogin } from './signupWithAutoLogin'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockJwtDecode = jwtDecode as jest.Mock
const mockGetOTP = getOTP as jest.Mock
const mockValidateOTP = validateOTP as jest.Mock
const mockGetCurrentUserRoles = getCurrentUserRoles as jest.Mock

const agent = () => mountRouter(signupWithAutoLogin)

function agentWithSession() {
  const session: Record<string, unknown> = {
    regenerate: jest.fn((cb: () => void) => cb()),
    save: jest.fn((cb: () => void) => cb()),
  }
  return { agent: mountRouter(signupWithAutoLogin, { session }), session }
}

/** Resolves "does this user already exist" checks as "no" for both email and phone. */
function mockUserDoesNotExist() {
  mockAxiosCallable.mockImplementation((config: { url: string }) => {
    if (config.url.includes('exists/email') || config.url.includes('exists/phone')) {
      return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
    }
    if (config.url.includes('user/v3/create')) {
      return Promise.resolve(upstreamOk({ result: { userId: 'new-user-1' } }))
    }
    if (config.url.includes('private/v1/update')) {
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
    const response = await agent()
      .post('/register')
      .send({ firstName: 'A', lastName: 'B', phone: '9876543210' })
    expect(response.status).toBe(200)
    expect(response.body.userId).toBe('new-user-1')
  })

  it('creates the account and sends an email OTP', async () => {
    mockUserDoesNotExist()
    mockGetOTP.mockResolvedValue(undefined)
    const response = await agent()
      .post('/register')
      .send({ email: 'a@b.com', firstName: 'A', lastName: 'B' })
    expect(response.status).toBe(200)
    expect(mockGetOTP).toHaveBeenCalledWith('new-user-1', 'a@b.com', 'email')
  })

  it('returns 500 when the phone OTP send fails', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('exists/email') || config.url.includes('exists/phone')) {
        return Promise.resolve(upstreamOk({ responseCode: 'FAILED' }))
      }
      if (config.url.includes('user/v3/create')) {
        return Promise.resolve(upstreamOk({ result: { userId: 'new-user-1' } }))
      }
      if (config.url.includes('private/v1/update')) {
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

  // NOTE: "email/phone both missing" and "user already exists" paths are
  // documented double-send bugs above — not reproduced live.
})

describe('POST /validateOtpWithLogin', () => {
  it('returns 400 for a completely empty body (no double-send: the phone/email block is skipped)', async () => {
    const response = await agent().post('/validateOtpWithLogin').send({})
    expect(response.status).toBe(400)
  })

  it('completes phone autologin: verifies OTP, regenerates the session, exchanges for a Keycloak token', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string; method?: string }) => {
      if (config.url.includes('msg91.com/api/v5/otp/verify')) {
        return Promise.resolve(upstreamOk({ type: 'success' }))
      }
      if (config.url.includes('user/private/v1/assign/role')) {
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
      .send({ otp: '1234', phone: '9876543210', userUUId: 'user-1' })

    expect(response.status).toBe(200)
    expect(mockGetCurrentUserRoles).toHaveBeenCalledWith(expect.anything(), 'access-tok-1')
  })

  it('rejects an invalid phone OTP', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ type: 'failed' }))
    const { agent: sessionAgent } = agentWithSession()
    const response = await sessionAgent
      .post('/validateOtpWithLogin')
      .send({ otp: '0000', phone: '9876543210', userUUId: 'user-1' })
    expect(response.status).toBe(400)
  })

  it('rejects an invalid email OTP', async () => {
    mockValidateOTP.mockResolvedValue({ data: { result: { response: 'FAILED' } } })
    const { agent: sessionAgent } = agentWithSession()
    const response = await sessionAgent
      .post('/validateOtpWithLogin')
      .send({ email: 'a@b.com', otp: '0000', userUUId: 'user-1' })
    expect(response.status).toBe(400)
  })

  it('returns 500 when OTP verification itself throws', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent()
      .post('/validateOtpWithLogin')
      .send({ otp: '1234', phone: '9876543210', userUUId: 'user-1' })
    expect(response.status).toBe(500)
  })
})
