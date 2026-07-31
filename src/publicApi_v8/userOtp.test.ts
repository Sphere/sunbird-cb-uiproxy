/**
 * PHASE 2 — userOtp.ts. One route, `POST /`. `cassandra-driver`'s `Client`
 * is instantiated at import time (module-load side effect, mocked below,
 * shared jest.fn() pattern proven in publicCertifcateFlinkv2.test.ts).
 *
 * Real bug found (documented in docs/PROD-VERIFICATION.md, NOT reproduced
 * live): `if (!otpData) { res.status(400).json(...) }` has no `return`.
 * If `client.execute(...)` ever resolves with a falsy value, this sends a
 * 400 and then falls through to `res.status(200).json({ data: otpData.rows,
 * ... })`, which throws (`Cannot read properties of ... 'rows'`) because
 * `otpData` is falsy — that throw is caught by the outer catch, which sends
 * a THIRD response on an already-ended connection (a double/triple-send
 * crash). The real `cassandra-driver` always resolves `execute()` with a
 * ResultSet object (never falsy) on success, so this is unreachable with
 * the real driver — but it's still a latent bug if that assumption ever
 * changes (e.g. a driver upgrade, or a test/mock misconfiguration), so it
 * is not exercised live here.
 *
 * Also worth noting (see docs/PROD-VERIFICATION.md): `type`/`key` are
 * interpolated directly into a raw CQL string with no parameterization —
 * the same pattern flagged as a likely injection vector in change AR
 * (publicCertifcateFlinkv2.ts).
 */

const mockCassandraExecute = jest.fn()
jest.mock('cassandra-driver', () => ({
  Client: jest.fn(() => ({ execute: mockCassandraExecute })),
}))
jest.mock('../utils/logger', () => ({ logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    CASSANDRA_IP: '127.0.0.1',
    OTP_EXTRACTION_KEY: 'valid-extraction-key',
  },
}))

import { mountRouter } from '../test-support/mountRouter'
import { userOtp } from './userOtp'

const agent = () => mountRouter(userOtp)

beforeEach(() => {
  mockCassandraExecute.mockReset()
})

/**
 * @description Verifies the POST / route rejects requests with a missing or
 * incorrect extraction key without querying Cassandra, returns the matching
 * OTP rows for a correct key, and returns 400 when the Cassandra query fails.
 */
describe('POST /', () => {
  it('should reject a request with a missing extraction key without querying Cassandra', async () => {
    const response = await agent().post('/').send({ key: 'k1', type: 'sms' })
    expect(response.status).toBe(400)
    expect(response.body.message).toBe('Extraction key missing or invalid')
    expect(mockCassandraExecute).not.toHaveBeenCalled()
  })

  it('should reject a request with an incorrect extraction key without querying Cassandra', async () => {
    const response = await agent()
      .post('/')
      .send({ extractionKey: 'wrong-key', key: 'k1', type: 'sms' })
    expect(response.status).toBe(400)
    expect(mockCassandraExecute).not.toHaveBeenCalled()
  })

  it('should return the matching OTP rows for a correct extraction key', async () => {
    mockCassandraExecute.mockResolvedValue({ rows: [{ otp: '123456' }] })
    const response = await agent()
      .post('/')
      .send({ extractionKey: 'valid-extraction-key', key: 'k1', type: 'sms' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ data: [{ otp: '123456' }], message: 'SUCCESS' })
    expect(mockCassandraExecute).toHaveBeenCalledWith(
      "SELECT * FROM sunbird.otp WHERE type='sms' AND key='k1'"
    )
  })

  it('should return 400 when the Cassandra query rejects', async () => {
    mockCassandraExecute.mockRejectedValue(new Error('cassandra unavailable'))
    const response = await agent()
      .post('/')
      .send({ extractionKey: 'valid-extraction-key', key: 'k1', type: 'sms' })

    expect(response.status).toBe(400)
    expect(response.body.message).toBe('Something went wrong while fetching OTP')
  })

  // NOTE: a falsy resolve from client.execute() (e.g. `undefined`) is a
  // documented double/triple-send bug — not reproduced live. See
  // docs/PROD-VERIFICATION.md.
})
