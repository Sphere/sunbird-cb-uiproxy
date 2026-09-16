/**
 * otp.ts — NOT an Express router. It exports two plain async functions,
 * `getOTP(userUUId, userKey, userType)` and
 * `validateOTP(userUUId, userKey, userType, userOtp)`, each of which builds
 * a request body and calls `axios({...})` (the callable form) directly,
 * returning the axios promise as-is. There is no try/catch in this file at
 * all — success and failure both simply propagate to the caller (ssoLogin.ts,
 * forgotPassword.ts, emailOrMobileLoginSignIn.ts, signupWithAutoLogin*.ts,
 * appSignUpWithAutoLogin.ts all `await` these and catch failures themselves).
 * Since there's no res object here and no early-return/try-catch logic to
 * verify, the Pattern A-F double-send/zero-response/unguarded-catch families
 * don't apply to this file: it's a single expression (`return axios({...})`)
 * per function. There is nothing resembling a key/secret validation branch
 * either — CONSTANTS.SB_API_KEY is only ever forwarded as an outbound
 * Authorization header, never checked/compared here, so there is no
 * auth-bypass surface in this file.
 *
 * This suite calls the exported functions directly with a mocked callable
 * axios, the same way authorizationV2Api.test.ts / nodebbUser.test.ts do for
 * other non-router helper files in this directory, and asserts on the
 * resolved/rejected value plus the exact request shape passed to axios.
 *
 * No real bugs found in this file; nothing skipped.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    SB_API_KEY: 'sb-api-key',
    SUNBIRD_PROXY_API_BASE: 'https://sunbird.test/api',
    TIMEOUT: 10000,
  },
}))

import axios from 'axios'
import { getOTP, validateOTP } from './otp'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'

const mockAxios = axios as unknown as jest.Mock

beforeEach(() => {
  mockAxios.mockReset()
})

/**
 * @description Verifies getOTP posts the correct request shape to the
 * generate-otp endpoint and resolves/rejects exactly as axios does, since
 * the function has no try/catch of its own.
 */
describe('getOTP', () => {
  it('should resolve with the upstream response on success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ result: { response: 'SUCCESS' } }))

    const result = await getOTP('user-1', 'user1@example.com', 'email')

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ result: { response: 'SUCCESS' } })
  })

  it('should call axios with the exact generate-otp request shape', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))

    await getOTP('user-1', 'user1@example.com', 'email')

    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          request: { userId: 'user-1', key: 'user1@example.com', type: 'email' },
        },
        headers: { Authorization: 'sb-api-key' },
        method: 'POST',
        url: 'https://sunbird.test/api/otp/v1/generate',
      })
    )
  })

  it('should reject with the upstream error when the generate-otp call fails with an HTTP error', async () => {
    mockAxios.mockRejectedValue(upstreamError(400, { params: { errmsg: 'invalid key' } }))

    await expect(getOTP('user-1', 'bad-key', 'phone')).rejects.toMatchObject({
      response: { status: 400, data: { params: { errmsg: 'invalid key' } } },
    })
  })

  it('should reject with the raw error when the generate-otp call fails at the network level', async () => {
    mockAxios.mockRejectedValue(networkError())

    await expect(getOTP('user-1', '9999999999', 'phone')).rejects.toThrow('connect ECONNREFUSED')
  })
})

/**
 * @description Verifies validateOTP posts the correct request shape to the
 * verify-otp endpoint and resolves/rejects exactly as axios does, since the
 * function has no try/catch of its own.
 */
describe('validateOTP', () => {
  it('should resolve with the upstream response on success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ result: { response: 'SUCCESS' } }))

    const result = await validateOTP('user-1', 'user1@example.com', 'email', '123456')

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ result: { response: 'SUCCESS' } })
  })

  it('should call axios with the exact verify-otp request shape', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))

    await validateOTP('user-1', 'user1@example.com', 'email', '123456')

    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          request: {
            key: 'user1@example.com',
            otp: '123456',
            type: 'email',
            userId: 'user-1',
          },
        },
        headers: { Authorization: 'sb-api-key' },
        method: 'POST',
        url: 'https://sunbird.test/api/otp/v1/verify',
      })
    )
  })

  it('should reject with the upstream error when the OTP is invalid', async () => {
    mockAxios.mockRejectedValue(upstreamError(401, { params: { errmsg: 'invalid otp' } }))

    await expect(
      validateOTP('user-1', 'user1@example.com', 'email', '000000')
    ).rejects.toMatchObject({
      response: { status: 401, data: { params: { errmsg: 'invalid otp' } } },
    })
  })

  it('should reject with the raw error when the verify-otp call fails at the network level', async () => {
    mockAxios.mockRejectedValue(networkError())

    await expect(
      validateOTP('user-1', '9999999999', 'phone', '123456')
    ).rejects.toThrow('connect ECONNREFUSED')
  })
})
