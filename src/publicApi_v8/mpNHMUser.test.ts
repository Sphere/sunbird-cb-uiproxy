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
import { upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { mpNHMUserCreation } from './mpNHMUser'

const mockAxios = axios as unknown as jest.Mock
const agent = () => mountRouter(mpNHMUserCreation)

beforeEach(() => mockAxios.mockReset())

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
})
