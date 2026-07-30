/**
 * PHASE 1 — ssoLogin.ts. Three routes: send OTP, resend OTP, and a
 * password/OTP login that regenerates the session and exchanges credentials
 * for a Keycloak token (jwt-decode'd) — same shape as
 * signupWithAutoLogin(V2).ts's /validateOtpWithLogin.
 *
 * Real double-send risk found (documented in docs/PROD-VERIFICATION.md,
 * partially exercised live where safe — see the test below): `/otp/sendOtp`'s
 * `if (!userEmail && !userPhone) { res.status(400)... }` has no `return`.
 * Whether this actually double-sends downstream depends on whether the
 * subsequent (mocked) user search finds a match:
 *  - if the search finds no user, a SECOND `res.status(400)` fires — a real
 *    crash risk, NOT reproduced live here.
 *  - if the search finds a user, neither the phone nor email branch
 *    triggers (both are empty), so no second response is ever sent — this
 *    exact, safe combination IS tested live below, since it accurately
 *    reflects current (if wasteful) behaviour.
 */

jest.mock('axios')
jest.mock('jwt-decode', () => jest.fn())
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
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
    LEARNER_SERVICE_API_BASE: 'https://learner.test',
    MSG_91_AUTH_KEY_SSO: 'msg91-key',
    MSG_91_TEMPLATE_ID_SEND_OTP_SSO: 'tmpl-1',
    SUNBIRD_PROXY_API_BASE: 'https://proxy.test',
  },
}))

import axios from 'axios'
import jwtDecode from 'jwt-decode'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { getOTP, validateOTP } from './otp'
import { getCurrentUserRoles } from './rolePermission'
import { ssoLogin } from './ssoLogin'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockJwtDecode = jwtDecode as jest.Mock
const mockGetOTP = getOTP as jest.Mock
const mockValidateOTP = validateOTP as jest.Mock
const mockGetCurrentUserRoles = getCurrentUserRoles as jest.Mock

const agent = () => mountRouter(ssoLogin)

function agentWithSession() {
  const session: Record<string, unknown> = {
    regenerate: jest.fn((cb: () => void) => cb()),
    save: jest.fn((cb: () => void) => cb()),
  }
  return mountRouter(ssoLogin, { session })
}

const userFound = upstreamOk({ result: { response: { content: [{ id: 'u1' }], count: 1 } } })
const userNotFound = upstreamOk({ result: { response: { content: [], count: 0 } } })

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockJwtDecode.mockReset()
  mockGetOTP.mockReset()
  mockValidateOTP.mockReset()
  mockGetCurrentUserRoles.mockReset().mockResolvedValue(undefined)
})

describe('POST /otp/sendOtp', () => {
  it('sends a phone OTP for an existing user', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('private/user/v1/search')) return Promise.resolve(userFound)
      if (config.url.includes('control.msg91.com/api/v5/otp') && !config.url.includes('verify')) {
        return Promise.resolve(upstreamOk({ type: 'success' }))
      }
      return Promise.reject(new Error(`Unexpected call: ${config.url}`))
    })
    const response = await agent().post('/otp/sendOtp').send({ userPhone: '9876543210' })
    expect(response.status).toBe(200)
  })

  it('sends an email OTP for an existing user', async () => {
    mockAxiosCallable.mockResolvedValue(userFound)
    mockGetOTP.mockResolvedValue(undefined)
    const response = await agent().post('/otp/sendOtp').send({ userEmail: 'A@B.com' })
    expect(response.status).toBe(200)
    expect(mockGetOTP).toHaveBeenCalledWith('u1', 'a@b.com', 'email')
  })

  it('returns 400 when the user is not found', async () => {
    mockAxiosCallable.mockResolvedValue(userNotFound)
    const response = await agent().post('/otp/sendOtp').send({ userPhone: '9876543210' })
    expect(response.status).toBe(400)
  })

  it('returns 400 (single response) when email/phone are both missing but the search still resolves', async () => {
    mockAxiosCallable.mockResolvedValue(userFound)
    const response = await agent().post('/otp/sendOtp').send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 when the phone OTP send fails', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('private/user/v1/search')) return Promise.resolve(userFound)
      return Promise.reject(networkError())
    })
    const response = await agent().post('/otp/sendOtp').send({ userPhone: '9876543210' })
    expect(response.status).toBe(500)
  })

  it('returns 500 when the email OTP send fails', async () => {
    mockAxiosCallable.mockResolvedValue(userFound)
    mockGetOTP.mockRejectedValue(networkError())
    const response = await agent().post('/otp/sendOtp').send({ userEmail: 'a@b.com' })
    expect(response.status).toBe(500)
  })
})

describe('POST /otp/resendOtp', () => {
  it('rejects a request missing email/phone', async () => {
    const response = await agent().post('/otp/resendOtp').send({})
    expect(response.status).toBe(400)
  })

  it('returns 400 when the user is not found', async () => {
    mockAxiosCallable.mockResolvedValue(userNotFound)
    const response = await agent().post('/otp/resendOtp').send({ userPhone: '9876543210' })
    expect(response.status).toBe(400)
  })

  it('resends a phone OTP', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('private/user/v1/search')) return Promise.resolve(userFound)
      if (config.url.includes('otp/retry')) return Promise.resolve(upstreamOk({ type: 'success' }))
      return Promise.reject(new Error(`Unexpected call: ${config.url}`))
    })
    const response = await agent().post('/otp/resendOtp').send({ userPhone: '9876543210' })
    expect(response.status).toBe(200)
  })

  it('resends an email OTP', async () => {
    mockAxiosCallable.mockResolvedValue(userFound)
    mockGetOTP.mockResolvedValue(undefined)
    const response = await agent().post('/otp/resendOtp').send({ userEmail: 'a@b.com' })
    expect(response.status).toBe(200)
  })

  it('returns 500 when the phone resend fails', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('private/user/v1/search')) return Promise.resolve(userFound)
      return Promise.reject(networkError())
    })
    const response = await agent().post('/otp/resendOtp').send({ userPhone: '9876543210' })
    expect(response.status).toBe(500)
  })

  it('returns 500 when the email resend fails', async () => {
    mockAxiosCallable.mockResolvedValue(userFound)
    mockGetOTP.mockRejectedValue(networkError())
    const response = await agent().post('/otp/resendOtp').send({ userEmail: 'a@b.com' })
    expect(response.status).toBe(500)
  })
})

describe('POST /login', () => {
  it('rejects a request missing typeOfLogin', async () => {
    const response = await agent().post('/login').send({ userEmail: 'a@b.com' })
    expect(response.status).toBe(400)
  })

  it('rejects a request missing both phone and email', async () => {
    const response = await agent().post('/login').send({ typeOfLogin: 'otp' })
    expect(response.status).toBe(400)
  })

  it('returns 400 when the user is not found', async () => {
    mockAxiosCallable.mockResolvedValue(userNotFound)
    const response = await agent().post('/login').send({ typeOfLogin: 'otp', userEmail: 'a@b.com' })
    expect(response.status).toBe(400)
  })

  it('rejects an invalid email OTP', async () => {
    mockAxiosCallable.mockResolvedValue(userFound)
    mockValidateOTP.mockResolvedValue({ data: { result: { response: 'FAILED' } } })
    const response = await agent()
      .post('/login')
      .send({ otp: '0000', typeOfLogin: 'otp', userEmail: 'a@b.com' })
    expect(response.status).toBe(400)
  })

  it('rejects an invalid phone OTP', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('private/user/v1/search')) return Promise.resolve(userFound)
      if (config.url.includes('msg91.com/api/v5/otp/verify')) return Promise.resolve(upstreamOk({ type: 'failed' }))
      return Promise.reject(new Error(`Unexpected call: ${config.url}`))
    })
    const response = await agent()
      .post('/login')
      .send({ otp: '0000', typeOfLogin: 'otp', userPhone: '9876543210' })
    expect(response.status).toBe(400)
  })

  it('completes OTP login for a phone user: verifies, regenerates the session, exchanges for a Keycloak token', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('private/user/v1/search')) return Promise.resolve(userFound)
      if (config.url.includes('msg91.com/api/v5/otp/verify')) return Promise.resolve(upstreamOk({ type: 'success' }))
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-1' }))
      return Promise.reject(new Error(`Unexpected call: ${config.url}`))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })

    const response = await agentWithSession()
      .post('/login')
      .send({ otp: '1234', typeOfLogin: 'otp', userPhone: '9876543210' })

    expect(response.status).toBe(200)
    expect(mockGetCurrentUserRoles).toHaveBeenCalledWith(expect.anything(), 'tok-1')
  })

  it('completes password login for an email user', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('private/user/v1/search')) return Promise.resolve(userFound)
      if (config.url.includes('openid-connect/token')) return Promise.resolve(upstreamOk({ access_token: 'tok-2' }))
      return Promise.reject(new Error(`Unexpected call: ${config.url}`))
    })
    mockJwtDecode.mockReturnValue({ sub: 'f:org:user-1' })

    const response = await agentWithSession()
      .post('/login')
      .send({ typeOfLogin: 'password', userEmail: 'a@b.com', userPassword: 'pw' })

    expect(response.status).toBe(200)
    expect(mockValidateOTP).not.toHaveBeenCalled()
  })

  it('returns 400 when the Keycloak token exchange fails', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('private/user/v1/search')) return Promise.resolve(userFound)
      if (config.url.includes('openid-connect/token')) return Promise.reject(networkError())
      return Promise.reject(new Error(`Unexpected call: ${config.url}`))
    })

    const response = await agentWithSession()
      .post('/login')
      .send({ typeOfLogin: 'password', userEmail: 'a@b.com', userPassword: 'pw' })

    expect(response.status).toBe(400)
  })

  it('returns 500 when the user search itself throws', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().post('/login').send({ typeOfLogin: 'password', userEmail: 'a@b.com' })
    expect(response.status).toBe(500)
  })
})
