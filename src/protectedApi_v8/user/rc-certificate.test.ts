/**
 * PHASE — user/rc-certificate.ts.
 *
 * One route: GET /user/enrollment/list/adhocCertificates. No header/body
 * validation branch at all (unlike most sibling files, there's no rootOrg
 * guard here) — userId comes straight from extractUserIdFromRequest(req),
 * mocked below like in group.test.ts/preference.test.ts so the real
 * session-reading implementation is never exercised.
 *
 * Two sequential axios({...}) calls (never .get()/.post()), both traced by
 * hand before writing any live test:
 *  - Outer call (enrollment list): inside the route's own try/catch. A
 *    rejection here is caught by the OUTER catch, which uses the standard
 *    guarded `(err && err.response && ...)` fallback shape — safe to
 *    exercise live for both an upstream-shaped failure and a network failure
 *    with no `.response`.
 *  - Inner call (RC mapper lookup): wrapped in its OWN nested try/catch
 *    (lines 38-53) that swallows any rejection, sets
 *    `sunbirdRcCertificates = []`, and falls through to the single
 *    `res.status(200).send(...)` below — so a rejected inner call never
 *    reaches the outer catch and the route still responds 200. Safe to
 *    exercise live.
 * Exactly one response is sent on every path (outer catch, or the single
 * trailing 200) — no double-send, no dropped response, no auth/permission
 * check to worry about (there is none here, unlike the sibling
 * publicCertifcateFlinkv2.ts secret-key bug). No Pattern A/B/C/D/E/F issues
 * found on inspection.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    KONG_API_BASE: 'https://kong.test',
    RC_MAPPER_HOST: 'https://rc-mapper.test',
    SB_API_KEY: 'sb-api-key',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { rcCert } from './rc-certificate'

const mockAxios = axios as unknown as jest.Mock
const agent = () => mountRouter(rcCert)

const courses = [
  {
    courseName: 'C1',
    issuedCertificates: [{ id: 'cert1' }],
  },
  {
    courseName: 'C2',
    issuedCertificates: [],
  },
]

const expectedGeneralCertificates = [
  {
    courseName: 'C1',
    issuedCertificates: [{ certificateType: 'General', id: 'cert1' }],
  },
  {
    courseName: 'C2',
    issuedCertificates: [],
  },
]

beforeEach(() => {
  mockAxios.mockReset()
})

/**
 * @description Verifies GET /user/enrollment/list/adhocCertificates merges
 * general and RC-mapped certificates on success, falls back gracefully when
 * the RC mapper lookup fails, and propagates upstream/network failures from
 * the enrollment list call.
 */
describe('GET /user/enrollment/list/adhocCertificates', () => {
  it('should combine the general and RC certificates on success', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ result: { courses } }))
      .mockResolvedValueOnce(upstreamOk({ data: [{ certId: 'rc1' }] }))

    const response = await agent().get('/user/enrollment/list/adhocCertificates')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      generalCertificates: expectedGeneralCertificates,
      sunbirdRcCertificates: [{ certId: 'rc1' }],
    })
  })

  it('should fall back to an empty RC certificates list when the RC mapper lookup fails', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ result: { courses } }))
      .mockRejectedValueOnce(networkError())

    const response = await agent().get('/user/enrollment/list/adhocCertificates')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      generalCertificates: expectedGeneralCertificates,
      sunbirdRcCertificates: [],
    })
  })

  it('should forward the upstream status and body when the enrollment list call fails', async () => {
    mockAxios.mockRejectedValueOnce(upstreamError(502, { error: 'bad gateway' }))

    const response = await agent().get('/user/enrollment/list/adhocCertificates')

    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('should return 500 with the generic body when the enrollment list call fails with no upstream response', async () => {
    mockAxios.mockRejectedValueOnce(networkError())

    const response = await agent().get('/user/enrollment/list/adhocCertificates')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Something went wrong fetching results' })
  })
})
