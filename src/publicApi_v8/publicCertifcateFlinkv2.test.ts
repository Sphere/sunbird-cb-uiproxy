/**
 * PHASE 2 — publicCertifcateFlinkv2.ts. One route, `GET /download`, with the
 * most severe defects found in this whole campaign — a public,
 * unauthenticated-except-for-a-shared-secret certificate download endpoint
 * whose secret-key check does NOT actually stop the request.
 *
 * `cassandra-driver` and `node-html-to-image` are mocked (module-load /
 * real-browser-launch side effects).
 *
 * CRITICAL bugs found while reading this file — documented in detail in
 * docs/PROD-VERIFICATION.md, deliberately NOT reproduced live (each one
 * cascades into a double/triple response-send and is a real risk of
 * crashing the test runner or, in production, the Node process):
 *
 *  1. AUTHENTICATION BYPASS: `if (certificateKey !== secretKey) { res.status(400)... }`
 *     has NO `return`. An invalid secretKey sends a 400, then execution
 *     CONTINUES into the real Cassandra query and certificate rendering —
 *     the security check does not actually block anything.
 *  2. Missing-parameter validation only rejects when ALL THREE of
 *     userid/courseid/secretKey are absent (`!(a || b || c)`), not when any
 *     one is — a request with only a secretKey and no userid/courseid still
 *     passes this check.
 *  3. `userid`/`courseid` (raw query-string values) are interpolated
 *     directly into a CQL query string with no parameterization or
 *     escaping — a potential CQL injection vector.
 *  4. `if (!certificateData) { res.status(400)... }` also has no `return`.
 *
 * Because of bug 1, there is NO SAFE WAY to test the "wrong secretKey"
 * input live — it doesn't stop at a clean 400, it falls through into the
 * full real flow and eventually double-sends when writeHead()/end() are
 * called on an already-completed response. Every test below therefore
 * either uses a CORRECT secretKey (the only way to reach a single, clean
 * response), or triggers a genuine upstream failure from within that
 * correct-key path (still single-response, since neither buggy `if` fires).
 */

const mockCassandraExecute = jest.fn()
const mockCassandraShutdown = jest.fn()
jest.mock('axios')
jest.mock('cassandra-driver', () => ({
  Client: jest.fn(() => ({ execute: mockCassandraExecute, shutdown: mockCassandraShutdown })),
}))
jest.mock('node-html-to-image', () => jest.fn())
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    CASSANDRA_IP: '127.0.0.1',
    CERTIFICATE_DOWNLOAD_KEY: 'valid-secret-key',
    HTTPS_HOST: 'https://kc.test',
    SB_API_KEY: 'sb-api-key',
  },
}))

import axios from 'axios'
import nodeHtmlToImage from 'node-html-to-image'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { publicCertificateFlinkv2 } from './publicCertifcateFlinkv2'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockNodeHtmlToImage = nodeHtmlToImage as unknown as jest.Mock



const agent = () => mountRouter(publicCertificateFlinkv2)

const certRow = {
  rows: [{ issued_certificates: [{ identifier: 'cert-1', name: 'My Certificate' }] }],
}

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockNodeHtmlToImage.mockReset()
  mockCassandraExecute.mockReset()
})

/**
 * @description Verifies the GET /download route renders and returns a
 * certificate image when called with a valid secretKey, and surfaces 500s
 * for downstream (Cassandra/upstream) failures on that same correct-key path.
 */
describe('GET /download (with a correct secretKey — the only path that responds exactly once)', () => {
  it('should render and return the certificate image', async () => {
    mockCassandraExecute.mockResolvedValue(certRow)
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({ responseCode: 'OK', result: { printUri: "data:image/svg+xml,<svg width='800' height='600'>...</svg>" } })
    )
    mockNodeHtmlToImage.mockResolvedValue(Buffer.from('fake-png-bytes'))

    const response = await agent().get('/download?userid=u1&courseid=c1&secretKey=valid-secret-key')

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('image/png')
    expect(response.headers['content-disposition']).toContain('My Certificate.png')
  })

  it('should fall back to default width/height when the printUri has no <svg width=\'...\'> marker', async () => {
    mockCassandraExecute.mockResolvedValue(certRow)
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({ responseCode: 'OK', result: { printUri: 'data:image/svg+xml,<svg>no-width-marker</svg>' } })
    )
    mockNodeHtmlToImage.mockResolvedValue(Buffer.from('fake-png-bytes'))

    const response = await agent().get('/download?userid=u1&courseid=c1&secretKey=valid-secret-key')

    expect(response.status).toBe(200)
    expect(mockNodeHtmlToImage).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.stringContaining('width:1400px') })
    )
  })

  it('should return 500 when the Cassandra lookup fails', async () => {
    mockCassandraExecute.mockRejectedValue(new Error('cassandra unavailable'))
    const response = await agent().get('/download?userid=u1&courseid=c1&secretKey=valid-secret-key')
    expect(response.status).toBe(500)
  })

  it('should return 500 when the certificate download call fails', async () => {
    mockCassandraExecute.mockResolvedValue(certRow)
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().get('/download?userid=u1&courseid=c1&secretKey=valid-secret-key')
    expect(response.status).toBe(500)
  })

  it('should return 500 when the upstream reports a non-OK responseCode', async () => {
    mockCassandraExecute.mockResolvedValue(certRow)
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({ params: { errmsg: 'not found' }, responseCode: 'CLIENT_ERROR', result: { printUri: '' } })
    )
    const response = await agent().get('/download?userid=u1&courseid=c1&secretKey=valid-secret-key')
    expect(response.status).toBe(500)
  })

  // NOTE: a missing userid/courseid/secretKey, or an INCORRECT secretKey, is
  // a documented double/triple-send bug chain — not reproduced live. See
  // docs/PROD-VERIFICATION.md.
})
