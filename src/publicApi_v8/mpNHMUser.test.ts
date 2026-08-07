/**
 * PHASE 1 — mpNHMUser.ts (208 uncovered).
 *
 * Third file in the bnrcUser.ts/upsmfUser.ts family: pg pool + createUser +
 * 3-OTP-endpoint shape, same author. Same scope decision: /createUser deferred
 * to Phase 2 (also uses cassandra-driver here, adding another dependency).
 */

jest.mock('axios')
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ on: jest.fn(), query: jest.fn() })) }))
jest.mock('cassandra-driver', () => ({ Client: jest.fn(() => ({ execute: jest.fn() })) }))
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    CASSANDRA_IP: '127.0.0.1',
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
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { logError, logInfo } from '../utils/logger'
import { mpNHMUserCreation } from './mpNHMUser'

const mockAxios = axios as unknown as jest.Mock
const mockLogInfo = logInfo as jest.Mock
const mockLogError = logError as jest.Mock
const agent = () => mountRouter(mpNHMUserCreation)

beforeEach(() => {
  mockAxios.mockReset()
  mockLogInfo.mockReset()
  mockLogError.mockReset()
})

describe('POST /otp/sendOtp', () => {
  it('sends the otp and reports success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))
    const response = await agent().post('/otp/sendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(200)
  })

  it('returns 500 when the msg91 call fails', async () => {
    mockAxios.mockRejectedValue(new Error('down'))
    const response = await agent().post('/otp/sendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
  })

  it('returns 500 with the generic fallback body on a network-level failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await agent().post('/otp/sendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
    expect(response.body.status).toBe('failed')
  })

  it('returns 500 (not the upstream status) even when msg91 responds with a real HTTP error', async () => {
    // The catch block always sends a fixed 500 + generic body here, unlike
    // some other handlers in this codebase that forward err.response.status.
    mockAxios.mockRejectedValue(upstreamError(400, { error: 'bad request' }))
    const response = await agent().post('/otp/sendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
    expect(response.body.status).toBe('failed')
  })

  it('logs OTP-send failures at info level, not error level (known pre-existing bug)', async () => {
    // Documented, pre-existing bug — docs/DUPLICATE-CODE-CLEANUP.md L3-9:
    // mpNHMUser.ts's OTP catch blocks call logInfo instead of logError, so
    // these failures won't surface in error-level monitoring/alerting the
    // way upsmfUser.ts/bnrcUser.ts's equivalent handlers do. Asserting the
    // CURRENT (buggy) behavior verbatim — do not "fix" this in source.
    mockAxios.mockRejectedValue(new Error('down'))
    await agent().post('/otp/sendOtp').send({ phone: '9876543210' })
    expect(mockLogInfo).toHaveBeenCalledWith(expect.stringContaining('Error in sending user OTP'))
    expect(mockLogError).not.toHaveBeenCalled()
  })

  // A missing phone is deliberately NOT sent live — same unreturned-400
  // double-send hazard as bnrcUser.ts / upsmfUser.ts. See
  // docs/PROD-VERIFICATION.md.
})

describe('POST /otp/resendOtp', () => {
  it('resends the otp and reports success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))
    const response = await agent().post('/otp/resendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(200)
  })

  it('returns 500 when the msg91 call fails', async () => {
    mockAxios.mockRejectedValue(new Error('down'))
    const response = await agent().post('/otp/resendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
  })

  it('rejects a request with no phone (this handler DOES return correctly)', async () => {
    const response = await agent().post('/otp/resendOtp').send({})
    expect(response.status).toBe(400)
    expect(response.body.status).toBe('error')
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('returns 500 with the generic fallback body on a network-level failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await agent().post('/otp/resendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
    expect(response.body.status).toBe('failed')
  })

  it('returns 500 (not the upstream status) even when msg91 responds with a real HTTP error', async () => {
    mockAxios.mockRejectedValue(upstreamError(400, { error: 'bad request' }))
    const response = await agent().post('/otp/resendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
    expect(response.body.status).toBe('failed')
  })

  it('logs OTP-resend failures at info level, not error level (known pre-existing bug)', async () => {
    // Same documented bug as /otp/sendOtp above — docs/DUPLICATE-CODE-CLEANUP.md
    // L3-9. Asserting current (buggy) behavior verbatim.
    mockAxios.mockRejectedValue(new Error('down'))
    await agent().post('/otp/resendOtp').send({ phone: '9876543210' })
    expect(mockLogInfo).toHaveBeenCalledWith(expect.stringContaining('Error in resending user OTP'))
    expect(mockLogError).not.toHaveBeenCalled()
  })
})

describe('POST /otp/validateOtp', () => {
  it('validates and reports success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ type: 'success' }))
    const response = await agent()
      .post('/otp/validateOtp')
      .send({ otp: '1234', phone: '9876543210' })
    expect(response.status).toBe(200)
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

  it('returns 500 with the generic fallback body on a network-level failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await agent()
      .post('/otp/validateOtp')
      .send({ otp: '1234', phone: '9876543210' })
    expect(response.status).toBe(500)
    expect(response.body.status).toBe('failed')
  })

  it('returns 500 (not the upstream status) even when msg91 responds with a real HTTP error', async () => {
    mockAxios.mockRejectedValue(upstreamError(400, { error: 'bad request' }))
    const response = await agent()
      .post('/otp/validateOtp')
      .send({ otp: '1234', phone: '9876543210' })
    expect(response.status).toBe(500)
    expect(response.body.status).toBe('failed')
  })

  it('logs OTP-validate failures at error level (this handler does NOT have the logInfo bug)', async () => {
    // Unlike /otp/sendOtp and /otp/resendOtp above, this catch block already
    // calls logError — confirming the L3-9 bug is specific to those two
    // handlers, not the whole file.
    mockAxios.mockRejectedValue(new Error('down'))
    await agent().post('/otp/validateOtp').send({ otp: '1234', phone: '9876543210' })
    expect(mockLogError).toHaveBeenCalled()
  })

  // A missing phone/otp is deliberately NOT sent as a live request either —
  // same unreturned res.status(400).json(...) double-send hazard as
  // /otp/sendOtp above.
})
