/**
 * PHASE 2 — certificateValidate.ts. One route, `POST /validate`, plus a
 * pure-axios helper (`getUserContactDetails`) that already catches its own
 * errors and returns a default shape.
 *
 * Real bug found (documented in docs/PROD-VERIFICATION.md, NOT reproduced
 * live): both `if (!req.body.accessCode)` and `if (!req.body.certId)` send
 * a 400 with no `return`. Unlike most double-send bugs in this campaign,
 * this one isn't even confined to the "both missing" case — since the real
 * axios call and its `await` still run afterward regardless of which check
 * fired, ANY single missing field cascades into a SECOND response once that
 * await resolves (success or failure). There is no safe missing-field input
 * to test live for this route; every test below supplies both fields.
 *
 * This is weaker than the sibling bug in publicCertifcateFlinkv2.ts (change
 * AR) — there's no secret/auth key being bypassed here, this is a public
 * certificate *validation* endpoint, so the missing-return bug is a
 * crash/double-send risk, not an authorization bypass.
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

import axios from 'axios'
import { upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { validateCertificate } from './certificateValidate'

const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(validateCertificate)

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

/**
 * @description Verifies POST /validate validates a certificate, merges
 * masked recipient contact details when available, tolerates a missing
 * recipient identity or a failed contact lookup, and forwards upstream
 * error status/message and transport-level failures.
 */
describe('POST /validate', () => {
  it('should validate the certificate and merge masked contact details for the recipient', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('certs/validate')) {
        return Promise.resolve(
          upstreamOk({
            responseCode: 'OK',
            result: { response: { json: { recipient: { identity: 'user-1' } } } },
          })
        )
      }
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve(
          upstreamOk({ result: { response: { content: [{ maskedEmail: 'a***@b.com' }] } } })
        )
      }
      return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
    })

    const response = await agent().post('/validate').send({ accessCode: 'abc', certId: 'cert-1' })
    expect(response.status).toBe(200)
    expect(response.body.maskedEmail).toBe('a***@b.com')
  })

  it('should validate the certificate without a contact lookup when there is no recipient identity', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({ responseCode: 'OK', result: { response: { json: {} } } })
    )
    const response = await agent().post('/validate').send({ accessCode: 'abc', certId: 'cert-1' })
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).toHaveBeenCalledTimes(1)
  })

  it('should still return 200 when the contact-details lookup itself fails (self-contained catch)', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('certs/validate')) {
        return Promise.resolve(
          upstreamOk({ responseCode: 'OK', result: { response: { json: { recipient: { id: 'user-1' } } } } })
        )
      }
      return Promise.reject(new Error('search unavailable'))
    })
    const response = await agent().post('/validate').send({ accessCode: 'abc', certId: 'cert-1' })
    expect(response.status).toBe(200)
    expect(response.body.maskedEmail).toBe('')
  })

  it('should forward the upstream status/message for a non-OK responseCode', async () => {
    mockAxiosCallable.mockRejectedValue(
      Object.assign(new Error('rejected'), {
        response: { data: { params: { errmsg: 'Invalid certificate' } }, status: 400 },
      })
    )
    const response = await agent().post('/validate').send({ accessCode: 'abc', certId: 'bad-cert' })
    expect(response.status).toBe(400)
    expect(response.body.message).toBe('Invalid certificate')
  })

  it('should return 500 on a transport-level failure', async () => {
    mockAxiosCallable.mockRejectedValue(new Error('network down'))
    const response = await agent().post('/validate').send({ accessCode: 'abc', certId: 'cert-1' })
    expect(response.status).toBe(500)
  })

  // NOTE: a missing accessCode or certId is a documented double-send bug —
  // not reproduced live. See docs/PROD-VERIFICATION.md.
})
