/**
 * PHASE — user/classDiagram.ts. Single route:
 *   POST /classdiagram/submit/:contentId
 * Forwards the request body to the submission service under the extracted
 * user id and content id, using a real axios.post() call (not the callable
 * axios({...}) form). The catch block guards `err.response` before reading
 * `.status`/`.data`, so no Pattern D risk here.
 *
 * `extractUserIdFromRequest` runs INSIDE the try block, so if it throws
 * (no `wid` header and no `req.session`) the error is caught and handled by
 * the same guarded catch — safe to exercise live, unlike the documented
 * "extract before try" risk (Pattern E) seen elsewhere in this codebase.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    SUBMISSION_API_BASE: 'https://submission.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { classDiagramApi } from './classDiagram'

const mockAxios = axios as jest.Mocked<typeof axios>

const agent = () => mountRouter(classDiagramApi)
const agentWithSession = (session: object) =>
  mountRouter(classDiagramApi, { session })

beforeEach(() => {
  mockAxios.post.mockReset()
})

/**
 * @description Verifies POST /classdiagram/submit/:contentId forwards the
 * submission to the upstream submission service and relays its response on
 * success, using either a `wid` header or `req.session.userId` to resolve
 * the user id.
 */
describe('POST /classdiagram/submit/:contentId', () => {
  it('should forward the submission and return the upstream response when a wid header is present', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ status: 'submitted' }))
    const response = await agent()
      .post('/classdiagram/submit/c1')
      .set('wid', 'user-1')
      .send({ answer: 'A -> B' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'submitted' })
  })

  it('should resolve the user id from the session when no wid header is present', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ status: 'submitted' }))
    const response = await agentWithSession({ userId: 'session-user' })
      .post('/classdiagram/submit/c1')
      .send({ answer: 'A -> B' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'submitted' })
  })

  it('should return the upstream status and body on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(422, { error: 'invalid diagram' }))
    const response = await agent()
      .post('/classdiagram/submit/c1')
      .set('wid', 'user-1')
      .send({ answer: 'bad' })
    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'invalid diagram' })
  })

  it('should return 500 with the generic error body on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent()
      .post('/classdiagram/submit/c1')
      .set('wid', 'user-1')
      .send({ answer: 'A -> B' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })

  it('should return 500 with the generic error body when no wid header and no session are present', async () => {
    // extractUserIdFromRequest throws (req.session is undefined) inside the
    // try block, so this is caught by the same guarded catch — safe to run
    // live, and never reaches axios.post at all.
    const response = await agent()
      .post('/classdiagram/submit/c1')
      .send({ answer: 'A -> B' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
    expect(mockAxios.post).not.toHaveBeenCalled()
  })
})
