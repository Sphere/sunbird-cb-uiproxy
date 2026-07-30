/**
 * PHASE 1 — bnrcUser.ts (251 uncovered).
 *
 * Scope: the three OTP endpoints only. POST /createUser (~150 lines) is a
 * multi-step Joi-validated flow across Postgres and several internal helpers
 * (getUserDetails, migrateUserToBnrc, assignRoleToUser, userProfileUpdate,
 * createUser, updateUserStatusInDatabase) with org-migration business logic —
 * not a one-line mock; deferred to Phase 2 with this file's other
 * Postgres-dependent code.
 *
 * `pg` is mocked because `new (require('pg')).Pool(...)` runs AT IMPORT TIME.
 */

jest.mock('axios')
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ on: jest.fn(), query: jest.fn() })) }))
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    DATA_LAKE_POSTGRES_DATABASE: 'db',
    DATA_LAKE_POSTGRES_HOST: 'host',
    DATA_LAKE_POSTGRES_PASSWORD: 'pw',
    DATA_LAKE_POSTGRES_PORT: 5432,
    DATA_LAKE_POSTGRES_USER: 'user',
    MSG_91_AUTH_KEY_SSO: 'msg91-key',
    MSG_91_TEMPLATE_ID_SEND_OTP_SSO: 'tmpl-1',
  },
}))

import axios from 'axios'
import { upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { bnrcUserCreation } from './bnrcUser'

const mockAxios = axios as unknown as jest.Mock
const agent = () => mountRouter(bnrcUserCreation)

beforeEach(() => mockAxios.mockReset())

describe('POST /otp/sendOtp', () => {
  it('sends the otp and reports success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))

    const response = await agent().post('/otp/sendOtp').send({ phone: '9876543210' })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('success')
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ mobile: '+919876543210' }) })
    )
  })

  it('returns 500 when the msg91 call fails', async () => {
    mockAxios.mockRejectedValue(new Error('down'))
    const response = await agent().post('/otp/sendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
  })

  // A missing phone is deliberately NOT sent as a live request: the handler
  // calls res.status(400).json(...) WITHOUT returning, so it falls through and
  // calls axios anyway, then res.status(200).json(...) a SECOND time on an
  // already-sent response — throwing ERR_HTTP_HEADERS_SENT, unhandled. Same
  // failure family documented for userRegistration.ts and
  // emailOrMobileLoginSignIn.ts. Recorded in docs/PROD-VERIFICATION.md.
})

describe('POST /otp/resendOtp', () => {
  it('resends the otp and reports success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))
    const response = await agent().post('/otp/resendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(200)
  })

  it('rejects a request with no phone (this handler DOES return correctly)', async () => {
    const response = await agent().post('/otp/resendOtp').send({})
    expect(response.status).toBe(400)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('returns 500 when the msg91 call fails', async () => {
    mockAxios.mockRejectedValue(new Error('down'))
    const response = await agent().post('/otp/resendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
  })
})

describe('POST /otp/validateOtp', () => {
  it('validates and reports success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ type: 'success' }))

    const response = await agent()
      .post('/otp/validateOtp')
      .send({ otp: '1234', phone: '9876543210' })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('success')
  })

  it('returns 400 when msg91 reports the otp as invalid', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ type: 'error' }))

    const response = await agent()
      .post('/otp/validateOtp')
      .send({ otp: 'wrong', phone: '9876543210' })

    expect(response.status).toBe(400)
  })

  it('returns 500 when the msg91 call fails', async () => {
    mockAxios.mockRejectedValue(new Error('down'))
    const response = await agent()
      .post('/otp/validateOtp')
      .send({ otp: '1234', phone: '9876543210' })
    expect(response.status).toBe(500)
  })

  // A missing phone/otp is deliberately NOT sent as a live request either —
  // same unreturned res.status(400).json(...) pattern as /otp/sendOtp above.
})
