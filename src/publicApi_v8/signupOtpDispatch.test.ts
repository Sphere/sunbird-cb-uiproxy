/**
 * sendRegistrationOtp / verifyRegistrationOtp — shared post-registration
 * OTP-dispatch and OTP-verify tails behind signupWithAutoLogin.ts /
 * signupWithAutoLoginV2.ts / appSignUpWithAutoLogin.ts (CHANGE 33).
 * Exercised directly here, independent of any single caller's own test file.
 */

jest.mock('axios')
jest.mock('./otp', () => ({ getOTP: jest.fn(), validateOTP: jest.fn() }))
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: { MSG_91_TEMPLATE_ID_SEND_OTP_SSO: 'template-1' },
}))
jest.mock('../utils/autoLoginSignupConstants', () => ({
  API_END_POINTS: { msg91SendOtp: 'https://msg91.test/send', msg91VerifyOtp: 'https://msg91.test/verify' },
  INDIAN_COUNTRY_CODE: '+91',
  MSG91_HEADERS: { authkey: 'msg91-key-test' },
}))

import axios from 'axios'
import { sendRegistrationOtp, verifyRegistrationOtp } from './signupOtpDispatch'
import { getOTP, validateOTP } from './otp'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockGetOTP = getOTP as jest.Mock
const mockValidateOTP = validateOTP as jest.Mock

function mockResponse() {
  return { json: jest.fn(), send: jest.fn(), status: jest.fn(function status(this: any) { return this }) } as any
}

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockGetOTP.mockReset()
  mockValidateOTP.mockReset()
})

/**
 * @description Verifies a phone number sends an OTP via MSG91 and responds
 * 200 with the phone-specific message, ignoring userEmail entirely.
 */
it('sends a phone OTP and responds 200 when userPhone is given', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { type: 'success' } })
  const res = mockResponse()

  await sendRegistrationOtp(res, '9876543210', 'jane@example.com', 'user-1')

  expect(mockAxiosCallable).toHaveBeenCalledWith(
    expect.objectContaining({ params: expect.objectContaining({ mobile: '+919876543210' }) })
  )
  expect(mockGetOTP).not.toHaveBeenCalled()
  expect(res.status).toHaveBeenCalledWith(200)
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ data: 'OTP successfully sent on email 9876543210', userId: 'user-1' })
  )
})

/**
 * @description Verifies a 500 with the phone-specific failure message when
 * the MSG91 send call rejects.
 */
it('responds 500 when the phone OTP send rejects', async () => {
  mockAxiosCallable.mockRejectedValue(new Error('network down'))
  const res = mockResponse()

  await sendRegistrationOtp(res, '9876543210', '', 'user-1')

  expect(res.status).toHaveBeenCalledWith(500)
  expect(res.send).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'OTP generation fail for phone 9876543210' })
  )
})

/**
 * @description Verifies an email is used only when userPhone is empty,
 * calling getOTP and responding 200 with the email-specific message.
 */
it('sends an email OTP and responds 200 when userPhone is empty', async () => {
  const res = mockResponse()

  await sendRegistrationOtp(res, '', 'jane@example.com', 'user-1')

  expect(mockGetOTP).toHaveBeenCalledWith('user-1', 'jane@example.com', 'email')
  expect(mockAxiosCallable).not.toHaveBeenCalled()
  expect(res.status).toHaveBeenCalledWith(200)
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ data: 'OTP successfully sent on email jane@example.com', userId: 'user-1' })
  )
})

/**
 * @description Verifies a 500 with the email-specific failure message when
 * getOTP rejects.
 */
it('responds 500 when the email OTP send rejects', async () => {
  mockGetOTP.mockRejectedValue(new Error('otp service down'))
  const res = mockResponse()

  await sendRegistrationOtp(res, '', 'jane@example.com', 'user-1')

  expect(res.status).toHaveBeenCalledWith(500)
  expect(res.send).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'OTP generation fail for email jane@example.com' })
  )
})

/**
 * @description Verifies extraSuccessFields (appSignUpWithAutoLogin.ts's
 * `userUUId`) are merged into the success response when given, and absent
 * when omitted — matching signupWithAutoLogin.ts/V2's calls exactly.
 */
it('merges extraSuccessFields into the response when given', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { type: 'success' } })
  const res = mockResponse()

  await sendRegistrationOtp(res, '9876543210', '', 'user-1', { userUUId: 'user-1' })

  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ userUUId: 'user-1' }))
})

it('omits extraSuccessFields from the response when not given', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { type: 'success' } })
  const res = mockResponse()

  await sendRegistrationOtp(res, '9876543210', '', 'user-1')

  expect(res.json.mock.calls[0][0]).not.toHaveProperty('userUUId')
})

/**
 * @description Concurrency: this helper is shared between 3 routes that
 * can receive registrations at the same time. Fires 2 concurrent phone-OTP
 * dispatches for different users, with axios routing its response by the
 * requested mobile, and confirms each call's OWN response gets its OWN
 * userId — never the other call's.
 */
it('concurrent dispatches for different users never cross-send userIds', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { type: 'success' } })
  const resA = mockResponse()
  const resB = mockResponse()

  await Promise.all([
    sendRegistrationOtp(resA, '1111111111', '', 'user-a'),
    sendRegistrationOtp(resB, '2222222222', '', 'user-b'),
  ])

  expect(resA.json.mock.calls[0][0].userId).toBe('user-a')
  expect(resB.json.mock.calls[0][0].userId).toBe('user-b')
})

describe('verifyRegistrationOtp', () => {
  /**
   * @description Verifies a successful phone OTP check returns true and
   * sends no response itself.
   */
  it('returns true and sends no response when the phone OTP is valid', async () => {
    mockAxiosCallable.mockResolvedValue({ data: { type: 'success' } })
    const res = mockResponse()

    const result = await verifyRegistrationOtp(res, '9876543210', '', 'user-1', '1234')

    expect(result).toBe(true)
    expect(res.status).not.toHaveBeenCalled()
  })

  /**
   * @description Verifies a successful email OTP check (via validateOTP)
   * returns true and sends no response itself.
   */
  it('returns true and sends no response when the email OTP is valid', async () => {
    mockValidateOTP.mockResolvedValue({ data: { result: { response: 'SUCCESS' } } })
    const res = mockResponse()

    const result = await verifyRegistrationOtp(res, '', 'jane@example.com', 'user-1', '1234')

    expect(result).toBe(true)
    expect(res.status).not.toHaveBeenCalled()
  })

  /**
   * @description Verifies neither phone nor email given returns false
   * (not undefined) and sends no response — the caller's own existing
   * true/false handling (which differs per file) is responsible for what
   * happens next, not this function.
   */
  it('returns false and sends no response when neither phone nor email is given', async () => {
    const res = mockResponse()

    const result = await verifyRegistrationOtp(res, '', '', 'user-1', '1234')

    expect(result).toBe(false)
    expect(res.status).not.toHaveBeenCalled()
  })

  /**
   * @description CRITICAL regression test: a failed phone OTP must return
   * `undefined` (not `false`) and send exactly ONE 400 response. Returning
   * `false` here previously caused a double-send in
   * signupWithAutoLoginV2.ts, whose caller has an `else` branch that also
   * sends a response when the result is falsy — `undefined` is the signal
   * that tells the caller "a response was already sent, return immediately"
   * instead of falling into that branch.
   */
  it('returns undefined and sends exactly one 400 when the phone OTP is invalid', async () => {
    mockAxiosCallable.mockResolvedValue({ data: { type: 'failed' } })
    const res = mockResponse()

    const result = await verifyRegistrationOtp(res, '9876543210', '', 'user-1', '1234')

    expect(result).toBeUndefined()
    expect(res.status).toHaveBeenCalledTimes(1)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Phone OTP validation failed try again' })
    )
  })

  /**
   * @description Same critical regression coverage as above, for the
   * email verification path.
   */
  it('returns undefined and sends exactly one 400 when the email OTP is invalid', async () => {
    mockValidateOTP.mockResolvedValue({ data: { result: { response: 'FAILED' } } })
    const res = mockResponse()

    const result = await verifyRegistrationOtp(res, '', 'jane@example.com', 'user-1', '1234')

    expect(result).toBeUndefined()
    expect(res.status).toHaveBeenCalledTimes(1)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Email OTP validation failed try again' })
    )
  })

  /**
   * @description Verifies both phone and email given, with phone
   * succeeding, still checks and honors the email result (matching the
   * original sequential if/if — not if/else — structure).
   */
  it('checks both phone and email when both are given, and a later failure still returns undefined', async () => {
    mockAxiosCallable.mockResolvedValue({ data: { type: 'success' } })
    mockValidateOTP.mockResolvedValue({ data: { result: { response: 'FAILED' } } })
    const res = mockResponse()

    const result = await verifyRegistrationOtp(res, '9876543210', 'jane@example.com', 'user-1', '1234')

    expect(result).toBeUndefined()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Email OTP validation failed try again' })
    )
  })
})
