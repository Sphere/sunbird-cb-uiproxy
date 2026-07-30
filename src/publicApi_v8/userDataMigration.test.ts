/**
 * PHASE 1 — userDataMigration.ts. Two routes (`forgotPassword` router):
 * /reset/proxy/password (send an OTP for a matched user) and /verifyOtp
 * (verify the OTP and trigger a password reset). Both branch on
 * emailOrMobile()/req.body.type and call axios via the callable `axios({...})`
 * form.
 *
 * Real bugs found while reading this file, NOT reproduced live here
 * (documented in docs/PROD-VERIFICATION.md):
 *
 * 1. In POST /verifyOtp, both the 'email' branch (lines 127-145) and the
 *    'phone' branch (lines 153-171) only call res.send inside
 *    `if (searchresponse.data.result.response.count > 0) { ... }` with NO
 *    `else`. When the upstream search finds no user (count 0, or count
 *    missing/falsy), the handler falls through to the bare `return` at line
 *    178 having sent no response at all — the request hangs until the
 *    client/proxy times out. This is a zero-response bug (Pattern B), so the
 *    "user not found" case for /verifyOtp is deliberately not exercised live
 *    below.
 *
 * 2. In POST /reset/proxy/password, the "user not found" branches (both
 *    'email' and 'phone') do `res.status(302).send(searchresponse.data.result.response.count)`
 *    — sending the raw NUMBER `0` (the count) as the response body. Express
 *    treats a Number argument to `.send()` as a deprecated status-code
 *    shortcut, which throws `RangeError: Invalid status code: 0` (confirmed
 *    empirically) — NOT a 302 with body "0" as the code's shape suggests.
 *    That throw is caught by this route's own outer catch, which responds
 *    `500` with the text `'Error Ocurred : ' + err`. This IS safe to test
 *    live (the throw is synchronous and caught, no hang) — tested below
 *    against its real, if surprising, 500 behavior rather than the
 *    apparently-intended 302.
 *
 * Secondary oddity (documented, not a hang risk): the /verifyOtp 'phone'
 * branch queries API_END_POINTS.recoverPassword for its initial "search",
 * not API_END_POINTS.searchSb like the 'email' branch and like
 * /reset/proxy/password's own phone branch do — almost certainly a
 * copy-paste mistake, but since it's still a real HTTP call that resolves,
 * it doesn't hang and is safe to exercise live (mocked at the same URL).
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    LEARNER_SERVICE_API_BASE: 'https://learner.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { emailOrMobile, emailValidator, forgotPassword } from './userDataMigration'

const mockAxiosCallable = axios as unknown as jest.Mock

const agent = () => mountRouter(forgotPassword)

const searchFound = upstreamOk({
  result: { response: { content: [{ userId: 'u1' }], count: 1 } },
})
const searchNotFound = upstreamOk({
  result: { response: { content: [], count: 0 } },
})

beforeEach(() => {
  mockAxiosCallable.mockReset()
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

  it('returns "error" when the value is missing (no userName)', () => {
    expect(emailOrMobile(undefined as unknown as string)).toBe('error')
  })
})

describe('POST /reset/proxy/password', () => {
  it('sends an OTP for an existing email user', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('/private/user/v1/search')) return Promise.resolve(searchFound)
      if (config.url.includes('/otp/v1/generate')) return Promise.resolve(upstreamOk({ type: 'success' }))
      return Promise.reject(new Error(`Unexpected call: ${config.url}`))
    })
    const response = await agent().post('/reset/proxy/password').send({ userName: 'a@b.com' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ message: 'Success ! Please verify the OTP .' })
  })

  it('sends an OTP for an existing phone user', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('/private/user/v1/search')) return Promise.resolve(searchFound)
      if (config.url.includes('/otp/v1/generate')) return Promise.resolve(upstreamOk({ type: 'success' }))
      return Promise.reject(new Error(`Unexpected call: ${config.url}`))
    })
    const response = await agent().post('/reset/proxy/password').send({ userName: '9876543210' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ message: 'Success ! Please verify the OTP .' })
  })

  it('degrades to 500 (documented bug) when no matching email user is found', async () => {
    mockAxiosCallable.mockResolvedValue(searchNotFound)
    const response = await agent().post('/reset/proxy/password').send({ userName: 'a@b.com' })
    expect(response.status).toBe(500)
    expect(response.text).toContain('Invalid status code: 0')
  })

  it('degrades to 500 (documented bug) when no matching phone user is found', async () => {
    mockAxiosCallable.mockResolvedValue(searchNotFound)
    const response = await agent().post('/reset/proxy/password').send({ userName: '9876543210' })
    expect(response.status).toBe(500)
    expect(response.text).toContain('Invalid status code: 0')
  })

  it('returns 500 when userName is neither a valid email nor mobile', async () => {
    const response = await agent().post('/reset/proxy/password').send({ userName: 'not-valid' })
    expect(response.status).toBe(500)
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('returns 500 when userName is missing entirely', async () => {
    const response = await agent().post('/reset/proxy/password').send({})
    expect(response.status).toBe(500)
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('returns 500 when the upstream search call fails', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().post('/reset/proxy/password').send({ userName: 'a@b.com' })
    expect(response.status).toBe(500)
  })
})

describe('POST /verifyOtp', () => {
  it('verifies the OTP and returns the reset result for an email user', async () => {
    mockAxiosCallable
      .mockResolvedValueOnce(searchFound)
      .mockResolvedValueOnce(upstreamOk({ result: { status: 'reset-success' } }))
    const response = await agent()
      .post('/verifyOtp')
      .send({ key: 'a@b.com', otp: '1234', type: 'email' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'reset-success' })
  })

  it('verifies the OTP and returns the reset result for a phone user', async () => {
    mockAxiosCallable
      .mockResolvedValueOnce(searchFound)
      .mockResolvedValueOnce(upstreamOk({ result: { status: 'reset-success' } }))
    const response = await agent()
      .post('/verifyOtp')
      .send({ key: '9876543210', otp: '1234', type: 'phone' })
    expect(response.status).toBe(200)
  })

  it('returns 500 when type is neither email nor phone', async () => {
    const response = await agent()
      .post('/verifyOtp')
      .send({ key: 'a@b.com', otp: '1234', type: 'other' })
    expect(response.status).toBe(500)
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('returns 500 when key is missing for an email verification', async () => {
    // key.toLowerCase() throws synchronously inside the try block, caught by
    // the surrounding catch — safe to exercise live.
    const response = await agent()
      .post('/verifyOtp')
      .send({ otp: '1234', type: 'email' })
    expect(response.status).toBe(500)
  })

  it('returns 500 when the upstream search call fails', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent()
      .post('/verifyOtp')
      .send({ key: 'a@b.com', otp: '1234', type: 'email' })
    expect(response.status).toBe(500)
  })

  // NOTE: "user not found" (count === 0) for both the 'email' and 'phone'
  // branches is a documented zero-response hang bug — not reproduced live.
  // See docs/PROD-VERIFICATION.md.
})
