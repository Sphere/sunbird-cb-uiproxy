/**
 * userEnrolledInSource.ts — a single route, using the callable `axios({...})`
 * form (method: 'GET') to proxy to CONSTANTS.RECOMMENDATION_API_BASE_V2's
 * course/source_name/users endpoint.
 *
 * DANGEROUS PATTERN — NOT reproduced live, see inline comment below:
 * GET / validates `req.query.sourceName` with
 * `if (!sourceName) { res.status(400).json(...) }` and NO `return`.
 * Execution falls through unconditionally into the axios({...}) call and
 * then into `res.status(response.status).send(response.data)` (success) or
 * the catch block's `res.status(...).send(...)` (failure) — either way a
 * SECOND response is sent after the first (missing-sourceName) response's
 * headers are already flushed. This is the exact double-send Pattern A the
 * test-writing process calls out as unsafe to reproduce live (confirmed
 * elsewhere in this codebase, e.g. assessment.test.ts, to throw "Cannot set
 * headers after they are sent" and surface as an unhandled rejection/hang).
 * Unlike assessment.ts's validation branches, this one is also a bypassed
 * validation (Pattern F): the 400 is never actually the response the client
 * receives, because the second res.send() always overwrites it. The missing/
 * empty-sourceName branch (userEnrolledInSource.ts lines 17-22) is
 * intentionally left untested here. See the report back to the requester for
 * this file/line detail to record in docs/PROD-VERIFICATION.md.
 */

jest.mock('axios')
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    RECOMMENDATION_API_BASE_V2: 'https://recommendation.test',
  },
}))
jest.mock('../utils/logger', () => ({
  logInfo: jest.fn(),
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { userEnrolledInSource } from './userEnrolledInSource'

const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(userEnrolledInSource)

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

/**
 * @description Verifies that GET / forwards the sourceName query param to
 * the upstream course/source_name/users endpoint via the callable
 * `axios({...})` form, and returns the upstream body and status on success.
 */
describe('GET /', () => {
  it('should forward the upstream body and status on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ count: 5 }))

    const response = await agent().get('/').query({ sourceName: 'nptel' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ count: 5 })
    expect(mockAxiosCallable).toHaveBeenCalledWith({
      method: 'GET',
      params: { courseSourceName: 'nptel' },
      url: 'https://recommendation.test/course/source_name/users',
    })
  })

  it('should forward an upstream error status and body', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent().get('/').query({ sourceName: 'nptel' })

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('should fall back to 500 with a generic error body on a transport failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent().get('/').query({ sourceName: 'nptel' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })

  // A request with no/empty sourceName is intentionally NOT tested live:
  // userEnrolledInSource.ts's `if (!sourceName) { res.status(400).json(...) }`
  // (lines 17-22) has no `return`, so execution falls through into the
  // axios({...}) call and then into a second res.send() — a double-send
  // (Pattern A) that throws "Cannot set headers after they are sent" and
  // also means the validation never actually blocks the request
  // (Pattern F). Reported back to the requester for docs/PROD-VERIFICATION.md.
})
