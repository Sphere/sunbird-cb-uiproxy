/**
 * PHASE 1 — forgotPassword.ts. Two routes backed by a Sunbird learner-service
 * user search plus OTP generate/verify, similar shape to ssoLogin.ts and
 * customSignup.ts's reset flow.
 *
 * Two real defects found while reading this file, documented in
 * docs/PROD-VERIFICATION.md rather than reproduced live here:
 *
 *  - POST /verifyOtp: for both the 'email' and 'phone' branches, the
 *    `if (searchresponse.data.result.response.count > 0) { ... }` has NO
 *    `else`. When no user is found (count === 0, the ordinary "user not
 *    found" case) execution falls straight through to the bare `return` at
 *    the end of the handler with NO response ever sent — the request hangs
 *    forever. NOT reproduced live here (would hang the Jest worker).
 *
 *  - POST /reset/proxy/password: the "user not found" branch does
 *    `res.status(302).send(searchresponse.data.result.response.count)`.
 *    Because `count` is a `number` and Express's `res.send()` treats a
 *    numeric body as a legacy status-code argument (deprecated
 *    `res.send(status)` overload), calling `.send(0)` overwrites the
 *    previously-set 302 with statusCode 0, and `ServerResponse.writeHead(0)`
 *    throws `RangeError: Invalid status code: 0`. This throw happens
 *    synchronously inside the route's own try block, so it IS caught by the
 *    route's catch clause, which sends the generic 500 failure body instead
 *    of the intended 302. This one is safe to reproduce live (confirmed by
 *    hand-tracing and by an isolated probe against the real router before
 *    writing these tests) — it degrades to a real HTTP response, it does
 *    not hang. Tested below as the route's actual current behaviour.
 *
 *    One further wrinkle confirmed by that probe: the failed first
 *    `res.send(0)` call leaves Content-Type set to `text/plain` (Express's
 *    legacy numeric-body path calls `this.type('txt')` before it throws),
 *    and the catch block's later `res.status(500).send({...})` does NOT
 *    override an already-set Content-Type. So the 500 body IS the correct
 *    JSON text on the wire, but it is served as `text/plain`, not
 *    `application/json` — any client that gates JSON parsing on
 *    Content-Type (as supertest's `response.body` does) sees an empty body
 *    and must fall back to `response.text` / manual `JSON.parse`.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    LEARNER_SERVICE_API_BASE: 'https://learner.test',
    SB_API_KEY: 'sb-api-key',
    SUNBIRD_PROXY_API_BASE: 'https://proxy.test',
  },
}))
jest.mock('./otp', () => ({
  validateOTP: jest.fn(),
}))

import axios from 'axios'
import { mountRouter } from '../test-support/mountRouter'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { emailOrMobile, emailValidator, forgotPassword } from './forgotPassword'
import { validateOTP } from './otp'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockValidateOTP = validateOTP as jest.Mock
const agent = () => mountRouter(forgotPassword)

const userFound = (userId = 'user-1') =>
  upstreamOk({ result: { response: { content: [{ userId }], count: 1 } } })
const userNotFound = upstreamOk({ result: { response: { content: [], count: 0 } } })

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockValidateOTP.mockReset()
})

describe('emailOrMobile / emailValidator', () => {
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

describe('POST /reset/proxy/password', () => {
  it('returns 500 when userName is missing (neither email nor phone)', async () => {
    const response = await agent().post('/reset/proxy/password').send({})
    expect(response.status).toBe(500)
    expect(response.text).toBe('Error Ocurred ')
  })

  it('returns 500 for a userName that is neither a valid email nor mobile', async () => {
    const response = await agent().post('/reset/proxy/password').send({ userName: 'not-valid' })
    expect(response.status).toBe(500)
  })

  it('sends an OTP for an existing email user', async () => {
    mockAxiosCallable
      .mockResolvedValueOnce(userFound())
      .mockResolvedValueOnce(upstreamOk({ type: 'success' }))
    const response = await agent().post('/reset/proxy/password').send({ userName: 'a@b.com' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ message: 'Success ! Please verify the OTP .' })
  })

  it('sends an OTP for an existing phone user', async () => {
    mockAxiosCallable
      .mockResolvedValueOnce(userFound())
      .mockResolvedValueOnce(upstreamOk({ type: 'success' }))
    const response = await agent().post('/reset/proxy/password').send({ userName: '9876543210' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ message: 'Success ! Please verify the OTP .' })
  })

  it('degrades to a 500 (documented bug) when no email user is found', async () => {
    // See file-header note: count=0 hits res.status(302).send(0), which
    // Express's legacy res.send(status) overload turns into a synchronous
    // RangeError, caught by the route's own catch block. The resulting 500
    // body is served with Content-Type text/plain (not application/json),
    // so supertest's auto-parsed `response.body` stays `{}` — assert on the
    // raw text instead, which is what actually goes out on the wire.
    mockAxiosCallable.mockResolvedValueOnce(userNotFound)
    const response = await agent().post('/reset/proxy/password').send({ userName: 'a@b.com' })
    expect(response.status).toBe(500)
    expect(response.headers['content-type']).toContain('text/plain')
    expect(JSON.parse(response.text)).toEqual({
      message: 'Sorry ! There is some issue in resetting your account. Please contact admin.',
      status: 'failed',
    })
  })

  it('degrades to a 500 (documented bug) when no phone user is found', async () => {
    mockAxiosCallable.mockResolvedValueOnce(userNotFound)
    const response = await agent().post('/reset/proxy/password').send({ userName: '9876543210' })
    expect(response.status).toBe(500)
  })

  it('returns 500 when the user-search call fails', async () => {
    mockAxiosCallable.mockRejectedValueOnce(networkError())
    const response = await agent().post('/reset/proxy/password').send({ userName: 'a@b.com' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      message: 'Sorry ! There is some issue in resetting your account. Please contact admin.',
      status: 'failed',
    })
  })

  it('returns 500 when the OTP-generate call fails after a user is found', async () => {
    mockAxiosCallable
      .mockResolvedValueOnce(userFound())
      .mockRejectedValueOnce(networkError())
    const response = await agent().post('/reset/proxy/password').send({ userName: 'a@b.com' })
    expect(response.status).toBe(500)
  })
})

describe('POST /verifyOtp', () => {
  it('returns 403 for a type that is neither email nor phone', async () => {
    const response = await agent()
      .post('/verifyOtp')
      .send({ key: 'a@b.com', otp: '1234', type: 'other' })
    expect(response.status).toBe(403)
  })

  it('resets the password for a valid email OTP', async () => {
    mockAxiosCallable
      .mockResolvedValueOnce(userFound('user-1'))
      .mockResolvedValueOnce(upstreamOk({ result: { status: 'ok' } }))
    mockValidateOTP.mockResolvedValueOnce({ data: { result: { response: 'SUCCESS' } } })
    const response = await agent()
      .post('/verifyOtp')
      .send({ key: 'a@b.com', otp: '1234', type: 'email' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })

  it('rejects an invalid email OTP', async () => {
    mockAxiosCallable.mockResolvedValueOnce(userFound('user-1'))
    mockValidateOTP.mockResolvedValueOnce({ data: { result: { response: 'FAILED' } } })
    const response = await agent()
      .post('/verifyOtp')
      .send({ key: 'a@b.com', otp: '0000', type: 'email' })
    expect(response.status).toBe(400)
    expect(response.text).toBe('OTP is not valid')
  })

  it('resets the password for a valid phone OTP', async () => {
    mockAxiosCallable
      .mockResolvedValueOnce(userFound('user-1'))
      .mockResolvedValueOnce(upstreamOk({ result: { status: 'ok' } }))
    mockValidateOTP.mockResolvedValueOnce({ data: { result: { response: 'SUCCESS' } } })
    const response = await agent()
      .post('/verifyOtp')
      .send({ key: '9876543210', otp: '1234', type: 'phone' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })

  it('rejects an invalid phone OTP', async () => {
    mockAxiosCallable.mockResolvedValueOnce(userFound('user-1'))
    mockValidateOTP.mockResolvedValueOnce({ data: { result: { response: 'FAILED' } } })
    const response = await agent()
      .post('/verifyOtp')
      .send({ key: '9876543210', otp: '0000', type: 'phone' })
    expect(response.status).toBe(400)
    expect(response.text).toBe('OTP is not valid')
  })

  it('returns 500 when the user-search call fails', async () => {
    mockAxiosCallable.mockRejectedValueOnce(networkError())
    const response = await agent()
      .post('/verifyOtp')
      .send({ key: 'a@b.com', otp: '1234', type: 'email' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      message: 'Sorry ! There is some issue in verifying your account. Please try after sometime.',
      status: 'failed',
    })
  })

  it('returns 500 when validateOTP itself rejects', async () => {
    mockAxiosCallable.mockResolvedValueOnce(userFound('user-1'))
    mockValidateOTP.mockRejectedValueOnce(networkError())
    const response = await agent()
      .post('/verifyOtp')
      .send({ key: 'a@b.com', otp: '1234', type: 'email' })
    expect(response.status).toBe(500)
  })

  it('returns 500 when the recover-password call fails after a valid OTP', async () => {
    mockAxiosCallable
      .mockResolvedValueOnce(userFound('user-1'))
      .mockRejectedValueOnce(networkError())
    mockValidateOTP.mockResolvedValueOnce({ data: { result: { response: 'SUCCESS' } } })
    const response = await agent()
      .post('/verifyOtp')
      .send({ key: 'a@b.com', otp: '1234', type: 'email' })
    expect(response.status).toBe(500)
  })

  // NOTE: count === 0 ("user not found") for both the email and phone
  // branches is a documented hang bug (no `else`, no response ever sent) —
  // not reproduced live. See docs/PROD-VERIFICATION.md.
})
