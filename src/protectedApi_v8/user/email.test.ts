/**
 * PHASE 1 — user/email.ts.
 *
 * One route, POST /emailText, wrapped in a single try/catch:
 *  - req.body is forwarded verbatim to axios.post() against
 *    `${SB_EXT_API_BASE}/v1/Notification/Send/Text`.
 *  - On success, the route mirrors the upstream status and body via
 *    res.status(response.status).send(response.data).
 *  - The catch uses the standard `(err && err.response && ...)` guarded
 *    fallback shape, so it's safe for both a structured upstream error and a
 *    bare network error with no `.response`.
 * No Pattern A/B/C/D/E/F issues found on inspection — safe to exercise live
 * for both success and failure paths.
 */

jest.mock('axios')
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    SB_EXT_API_BASE: 'https://sb-ext.test',
  },
}))

import axios from 'axios'
import { emailApi } from './email'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(emailApi)

beforeEach(() => {
  mockAxios.post.mockReset()
})

/**
 * @description Verifies POST /emailText forwards the request body to the
 * upstream Notification/Send/Text endpoint, mirrors the upstream status and
 * body on success, and forwards the upstream status/body — or falls back to
 * a generic 500 — when the axios call itself fails.
 */
describe('POST /emailText', () => {
  it('should send the request body to the upstream notification endpoint and return its response', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ result: 'sent' }))
    const response = await agent()
      .post('/emailText')
      .send({ to: 'a@test.com', subject: 'hi', body: 'hello' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ result: 'sent' })
  })

  it('should post the request body to the correct upstream Text endpoint', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ result: 'sent' }))
    await agent()
      .post('/emailText')
      .send({ to: 'b@test.com', subject: 'hi', body: 'hello' })
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://sb-ext.test/v1/Notification/Send/Text',
      expect.objectContaining({ to: 'b@test.com', subject: 'hi', body: 'hello' }),
      expect.anything()
    )
  })

  it('should mirror a non-200 upstream success status', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ result: 'accepted' }, 202))
    const response = await agent()
      .post('/emailText')
      .send({ to: 'c@test.com' })
    expect(response.status).toBe(202)
    expect(response.body).toEqual({ result: 'accepted' })
  })

  it('should forward the upstream status and body when the send fails', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(400, { error: 'invalid recipient' }))
    const response = await agent()
      .post('/emailText')
      .send({ to: 'not-an-email' })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'invalid recipient' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent()
      .post('/emailText')
      .send({ to: 'a@test.com' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
