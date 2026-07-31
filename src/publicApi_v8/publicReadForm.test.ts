/**
 * publicReadForm.ts — `GET /readForm`, a public (unauthenticated) endpoint
 * backed directly by cassandra-driver (no axios calls in this file at all).
 *
 * `cassandra-driver` is mocked (real network connection / native driver side
 * effects), same pattern as publicCertifcateFlinkv2.test.ts and
 * mpNHMUser.test.ts in this directory.
 *
 * CRITICAL bugs found while reading this file — deliberately NOT reproduced
 * live, reported to be added to docs/PROD-VERIFICATION.md:
 *
 *  1. Pattern A (double-send): `if (!(frameworkType)) { res.status(400)... }`
 *     has NO `return`. A missing/empty `type` query param sends a 400, then
 *     execution CONTINUES into the real Cassandra client creation and query
 *     (built with `type=undefined` interpolated raw into the CQL string),
 *     and then falls into the same success/failure branch below — sending a
 *     SECOND response. Depending on how the (mocked) `execute()` resolves,
 *     that second send either throws ERR_HTTP_HEADERS_SENT synchronously
 *     (caught by the outer catch, which then attempts a THIRD send — itself
 *     throwing, uncaught, since the catch block has no further try/catch),
 *     or silently hangs via bug #2 below. Either way this is not a safe live
 *     input.
 *
 *  2. Pattern B (zero response / hang): the success branch —
 *     `res.writeHead(200, { ... })` — is NEVER followed by `res.end()` or
 *     `res.send()`. writeHead() only flushes the status line and headers; it
 *     does not terminate the response. Contrast with the sibling
 *     publicCertifcateFlinkv2.ts, which calls `res.writeHead(200, {...})`
 *     followed by `res.end(image, 'binary')`. Here that `res.end()` call is
 *     simply missing, so ANY request that reaches the "formData truthy"
 *     branch (i.e. a valid `type` plus a Cassandra row) hangs the HTTP
 *     response forever. This is not tested live at all — there is no safe
 *     input that reaches it.
 *
 * Because of bug 2, the only two safe-to-reproduce-live paths are the ones
 * that pass a non-empty `type` AND land in a single-response branch:
 * `execute()` resolving to a falsy value (the "cannot be fetched" 400), and
 * `execute()` rejecting (the 500 catch-all).
 */

const mockCassandraExecute = jest.fn()
const mockCassandraShutdown = jest.fn()
jest.mock('cassandra-driver', () => ({
  Client: jest.fn(() => ({ execute: mockCassandraExecute, shutdown: mockCassandraShutdown })),
}))
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    CASSANDRA_IP: '127.0.0.1',
  },
}))

import { mountRouter } from '../test-support/mountRouter'
import { publicReadForm } from './publicReadForm'

const agent = () => mountRouter(publicReadForm)

beforeEach(() => {
  mockCassandraExecute.mockReset()
  mockCassandraShutdown.mockReset()
})

/**
 * @description Verifies the GET /readForm route, when called with a
 * non-empty `type` query param (the only way to avoid the unreturned-400
 * double-send bug documented above), returns a clean single response for
 * both the "no form data found" case and a Cassandra failure.
 */
describe('GET /readForm (with a non-empty type — the only path that responds exactly once)', () => {
  it('should return 400 when the Cassandra query resolves with no form data', async () => {
    mockCassandraExecute.mockResolvedValue(undefined)

    const response = await agent().get('/readForm?type=course')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      msg: 'Form cannot be fetched',
      status: 'error',
      status_code: 400,
    })
  })

  it('should return 500 when the Cassandra query rejects', async () => {
    mockCassandraExecute.mockRejectedValue(new Error('cassandra unavailable'))

    const response = await agent().get('/readForm?type=course')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      message: 'Sorry ! Read form failed . Please try again in sometime.',
      status: 'failed',
    })
  })

  // NOTE: a missing/empty `type` query param is a documented double/triple-send
  // bug (Pattern A) — not reproduced live. See docs/PROD-VERIFICATION.md.
  //
  // NOTE: a non-empty `type` combined with Cassandra returning truthy form
  // data hits the `res.writeHead(200, ...)` branch, which never calls
  // `res.end()`/`res.send()` — a genuine hang (Pattern B). Not reproduced
  // live for the same reason. See docs/PROD-VERIFICATION.md.
})
