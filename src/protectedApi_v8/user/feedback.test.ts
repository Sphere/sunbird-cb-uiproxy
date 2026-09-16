/**
 * PHASE 1 — user/feedback.ts.
 *
 * Single route: POST / — submits course feedback via axios.post to
 * `${SB_EXT_API_BASE}/v1/course/feedback/add/${userId}`. The userId comes
 * from extractUserIdFromRequest, called inside the try block, and the whole
 * handler (extractUserIdFromRequest + axios.post) is wrapped in a single
 * try/catch with the standard `(err && err.response && ...)` guarded
 * fallback shape. No validation branches, no Pattern A/B/C/D/E/F issues
 * found on inspection — exactly one response is sent on every path. Safe to
 * exercise live for both success and failure paths.
 */

jest.mock('axios')
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    SB_EXT_API_BASE: 'https://sb-ext.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { feedbackApi } from './feedback'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(feedbackApi)

beforeEach(() => {
  mockAxios.post.mockReset()
})

/**
 * @description Verifies the POST / route submits feedback for the
 * extracted user, forwards the upstream response body and status on
 * success, and forwards the upstream status/body — or falls back to a
 * generic 500 — when the upstream call fails.
 */
describe('POST /', () => {
  it('should submit feedback and return the upstream response', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ submitted: true }))
    const response = await agent().post('/').send({
      rating: 5,
      comments: 'great course',
    })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ submitted: true })
  })

  it('should post to the feedback endpoint with the extracted userId', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ submitted: true }))
    await agent().post('/').send({ rating: 4 })
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://sb-ext.test/v1/course/feedback/add/user-1',
      { rating: 4 },
      expect.anything()
    )
  })

  it('should forward the upstream status and body on an upstream error', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(422, { error: 'bad feedback' }))
    const response = await agent().post('/').send({ rating: 1 })
    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'bad feedback' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/').send({ rating: 1 })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
