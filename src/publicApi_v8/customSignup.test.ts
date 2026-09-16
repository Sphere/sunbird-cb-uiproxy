/**
 * PHASE 1 — customSignup.ts. Not a simple axios-proxy file despite its
 * "easy tier" placement — it is a full Keycloak-backed signup/reset flow
 * with chained axios calls (getKCToken -> the actual operation) and several
 * exported helpers. Tested at two levels: the pure/axios helpers directly
 * (most reliable), and the route handlers for their safe branches only.
 *
 * Two real defects found while reading this file, documented in
 * docs/PROD-VERIFICATION.md rather than reproduced live here:
 *  - setPasswordWithOTP has no `else` when getUser() resolves falsy — the
 *    request never responds (hang).
 *  - setPasswordWithOTP calls `resetKCPassword(...)` without `await`, so
 *    `message` in the 200 response is a Promise, not the actual status.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    ES_BASE: 'https://es.test',
    HTTPS_HOST: 'https://kc.test',
    KEYCLOAK_ADMIN_PASSWORD: 'admin-pass',
    KEYCLOAK_ADMIN_USERNAME: 'admin',
    KEYCLOAK_REALM: 'test-realm',
    MSG91BASE: 'https://msg91.test',
    MSG91KEY: 'msg91-key',
    MSG91TEMPLATEID: 'tmpl-1',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import {
  createKCUser,
  customSignUp,
  emailactionKC,
  emailOrMobile,
  emailValidator,
  getKCToken,
  getUser,
  resendOTP,
  resetKCPassword,
  sendOTP,
  verifyOTP,
} from './customSignup'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(customSignUp)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
  mockAxios.put.mockReset()
})

describe('emailValidator / emailOrMobile', () => {
  it('recognises a valid email', () => {
    expect(emailValidator('a@b.com')).toBe(true)
    expect(emailOrMobile('a@b.com')).toBe('email')
  })

  it('recognises a valid 10-digit mobile starting 7-9', () => {
    expect(emailOrMobile('9876543210')).toBe('phone')
  })

  it('returns "error" for neither', () => {
    expect(emailOrMobile('not-a-thing')).toBe('error')
    expect(emailValidator('not-a-thing')).toBe(false)
  })
})

describe('sendOTP', () => {
  it('sends the OTP request with a 91-prefixed mobile', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ type: 'success' }))
    const response = await sendOTP('9876543210')
    expect(mockAxios.get).toHaveBeenCalledWith(expect.stringContaining('mobile=919876543210'), expect.anything())
    expect(response).toEqual(upstreamOk({ type: 'success' }))
  })

  it('swallows an upstream failure and returns "Error"', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await sendOTP('9876543210')
    expect(response).toBe('Error')
  })
})

describe('resendOTP', () => {
  it('resends the OTP request with a 91-prefixed mobile', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ type: 'success' }))
    await resendOTP('9876543210')
    expect(mockAxios.get).toHaveBeenCalledWith(expect.stringContaining('mobile=919876543210'), expect.anything())
  })

  it('swallows an upstream failure and returns "Error"', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await resendOTP('9876543210')
    expect(response).toBe('Error')
  })
})

describe('verifyOTP', () => {
  it('returns the verification payload on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ type: 'success' }))
    const response = await verifyOTP('9876543210', '1234')
    expect(response).toEqual({ type: 'success' })
  })

  it('swallows an upstream failure and returns "Error"', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await verifyOTP('9876543210', '1234')
    expect(response).toBe('Error')
  })
})

describe('getKCToken', () => {
  it('exchanges admin credentials for an access token', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ access_token: 'tok-123' }))
    const token = await getKCToken()
    expect(token).toBe('tok-123')
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/protocol/openid-connect/token'),
      expect.any(URLSearchParams),
      expect.anything()
    )
  })
})

describe('createKCUser', () => {
  const req = { body: { data: { firstname: 'A', lastname: 'B', password: 'pw', username: 'user1' }, type: 'mobile' } }

  it('creates the user via Keycloak on success', async () => {
    mockAxios.post
      .mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
      .mockResolvedValueOnce(upstreamOk({}))
    const response = await createKCUser(req)
    expect(response.data).toEqual({})
  })

  it('defaults the email for a mobile signup', async () => {
    mockAxios.post
      .mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
      .mockResolvedValueOnce(upstreamOk({}))
    await createKCUser(req)
    expect(mockAxios.post).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ email: 'user1@aastar.org', emailVerified: true }),
      expect.anything()
    )
  })

  it('uses the provided email for an email signup', async () => {
    const emailReq = { body: { data: { email: 'user1@real.com', firstname: 'A', lastname: 'B', password: 'pw', username: 'user1' }, type: 'email' } }
    mockAxios.post
      .mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
      .mockResolvedValueOnce(upstreamOk({}))
    await createKCUser(emailReq)
    expect(mockAxios.post).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ email: 'user1@real.com' }),
      expect.anything()
    )
  })

  it('returns the upstream error response when Keycloak rejects the create call', async () => {
    mockAxios.post
      .mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
      .mockRejectedValueOnce(upstreamError(500, { errorMessage: 'User exists' }))
    const response = await createKCUser(req)
    expect(response.data).toEqual({ errorMessage: 'User exists' })
  })

  it('returns undefined when the token exchange itself fails with no upstream response', async () => {
    mockAxios.post.mockRejectedValueOnce(networkError())
    const response = await createKCUser(req)
    expect(response).toBeUndefined()
  })
})

describe('getUser', () => {
  it('returns the matched users on success', async () => {
    mockAxios.post.mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
    mockAxios.get.mockResolvedValueOnce(upstreamOk([{ id: 'u1' }]))
    const response = await getUser('user1')
    expect(response).toEqual([{ id: 'u1' }])
  })

  it('returns the upstream error data when the search call fails', async () => {
    mockAxios.post.mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
    mockAxios.get.mockRejectedValueOnce(upstreamError(404, null))
    const response = await getUser('user1')
    expect(response).toBeNull()
  })
})

describe('resetKCPassword', () => {
  it('resets the password on success', async () => {
    mockAxios.post.mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
    mockAxios.put.mockResolvedValueOnce(upstreamOk({ status: 'ok' }))
    const response = await resetKCPassword('u1', 'newpass')
    expect(response).toEqual({ status: 'ok' })
  })

  it('returns the upstream error data on failure', async () => {
    mockAxios.post.mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
    mockAxios.put.mockRejectedValueOnce(upstreamError(400, { error: 'weak password' }))
    const response = await resetKCPassword('u1', 'newpass')
    expect(response).toEqual({ error: 'weak password' })
  })
})

describe('emailactionKC', () => {
  it('sends a VERIFY_EMAIL action', async () => {
    mockAxios.post.mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
    mockAxios.put.mockResolvedValueOnce(upstreamOk({ ok: true }))
    await emailactionKC('u1', 'verifyEmail')
    expect(mockAxios.put).toHaveBeenCalledWith(expect.any(String), ['VERIFY_EMAIL'], expect.anything())
  })

  it('sends an UPDATE_PASSWORD action', async () => {
    mockAxios.post.mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
    mockAxios.put.mockResolvedValueOnce(upstreamOk({ ok: true }))
    await emailactionKC('u1', 'resetPassword')
    expect(mockAxios.put).toHaveBeenCalledWith(expect.any(String), ['UPDATE_PASSWORD'], expect.anything())
  })

  it('swallows an upstream failure and returns the error response', async () => {
    mockAxios.post.mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
    mockAxios.put.mockRejectedValueOnce(upstreamError(500, { error: 'boom' }))
    const response = await emailactionKC('u1', 'resetPassword')
    expect(response.data).toEqual({ error: 'boom' })
  })
})

describe('POST /registerUserWithEmail', () => {
  const body = { data: { firstname: 'A', lastname: 'B', password: 'pw', username: 'user1' }, type: 'mobile' }

  it('returns 200 on a clean create', async () => {
    mockAxios.post
      .mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
      .mockResolvedValueOnce(upstreamOk({}))
    const response = await agent().post('/registerUserWithEmail').send(body)
    expect(response.status).toBe(200)
  })

  it('returns 500 when Keycloak reports an errorMessage', async () => {
    mockAxios.post
      .mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
      .mockRejectedValueOnce(upstreamError(500, { errorMessage: 'User exists' }))
    const response = await agent().post('/registerUserWithEmail').send(body)
    expect(response.status).toBe(500)
  })

  it('returns 401 when the token exchange fails outright', async () => {
    mockAxios.post.mockRejectedValueOnce(networkError())
    const response = await agent().post('/registerUserWithEmail').send(body)
    expect(response.status).toBe(401)
  })
})

describe('POST /registerUserWithMobile', () => {
  it('always responds 200 after attempting to send an OTP', async () => {
    mockAxios.get.mockResolvedValueOnce(upstreamOk({ type: 'success' }))
    const response = await agent().post('/registerUserWithMobile').send({ mobileNumber: '9876543210' })
    expect(response.status).toBe(200)
  })
})

describe('POST /verifyUserWithMobileNumber', () => {
  it('returns 401 for an invalid OTP', async () => {
    mockAxios.get.mockResolvedValueOnce(upstreamOk({ type: 'failed' }))
    const response = await agent()
      .post('/verifyUserWithMobileNumber')
      .send({ data: { otp: '0000' }, mobileNumber: '9876543210' })
    expect(response.status).toBe(401)
  })

  it('creates the user after a valid OTP', async () => {
    mockAxios.get.mockResolvedValueOnce(upstreamOk({ type: 'success' }))
    mockAxios.post
      .mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
      .mockResolvedValueOnce(upstreamOk({}))
    const response = await agent()
      .post('/verifyUserWithMobileNumber')
      .send({ data: { firstname: 'A', lastname: 'B', otp: '1234', password: 'pw', username: 'user1' }, mobileNumber: '9876543210' })
    expect(response.status).toBe(200)
  })
})

describe('POST /resetPassword', () => {
  it('sends an OTP for a mobile username', async () => {
    mockAxios.post.mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
    mockAxios.get
      .mockResolvedValueOnce(upstreamOk([{ id: 'u1' }]))
      .mockResolvedValueOnce(upstreamOk({ type: 'success' }))
    const response = await agent().post('/resetPassword').send({ username: '9876543210' })
    expect(response.status).toBe(200)
  })

  it('triggers a reset-password email for an email username', async () => {
    mockAxios.post
      .mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
      .mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
    mockAxios.get.mockResolvedValueOnce(upstreamOk([{ id: 'u1' }]))
    mockAxios.put.mockResolvedValueOnce(upstreamOk({ ok: true }))
    const response = await agent().post('/resetPassword').send({ username: 'user1@real.com' })
    expect(response.status).toBe(200)
  })

  it('returns 401 for a username that is neither a valid email nor mobile', async () => {
    mockAxios.post.mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
    mockAxios.get.mockResolvedValueOnce(upstreamOk([{ id: 'u1' }]))
    const response = await agent().post('/resetPassword').send({ username: 'not-valid' })
    expect(response.status).toBe(401)
  })

  it('returns 401 when no matching user is found', async () => {
    mockAxios.post.mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
    mockAxios.get.mockRejectedValueOnce(upstreamError(404, null))
    const response = await agent().post('/resetPassword').send({ username: '9876543210' })
    expect(response.status).toBe(401)
  })
})

describe('POST /setPasswordWithOTP', () => {
  it('resets the password for a valid OTP', async () => {
    // resetKCPassword() is called without `await` in the handler (a real bug,
    // documented in docs/PROD-VERIFICATION.md), so its own getKCToken/put
    // calls happen on a separate, un-awaited chain — both need mocking and a
    // settle tick afterwards, or they leak an unhandled rejection into the
    // next test.
    mockAxios.post
      .mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' })) // getUser's getKCToken
      .mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' })) // resetKCPassword's getKCToken
    mockAxios.get
      .mockResolvedValueOnce(upstreamOk([{ id: 'u1' }]))
      .mockResolvedValueOnce(upstreamOk({ type: 'success' }))
    mockAxios.put.mockResolvedValueOnce(upstreamOk({ status: 'ok' }))
    const response = await agent()
      .post('/setPasswordWithOTP')
      .send({ otp: '1234', password: 'newpass', username: '9876543210' })
    expect(response.status).toBe(200)
    await new Promise((resolve) => setImmediate(resolve))
  })

  it('returns 401 for an invalid OTP', async () => {
    mockAxios.post.mockResolvedValueOnce(upstreamOk({ access_token: 'tok-123' }))
    mockAxios.get
      .mockResolvedValueOnce(upstreamOk([{ id: 'u1' }]))
      .mockResolvedValueOnce(upstreamOk({ type: 'failed' }))
    const response = await agent()
      .post('/setPasswordWithOTP')
      .send({ otp: '0000', password: 'newpass', username: '9876543210' })
    expect(response.status).toBe(401)
  })

  // NOTE: userData-falsy path is a documented hang bug (no `else`, no
  // response sent) — not reproduced live. See docs/PROD-VERIFICATION.md.
})
