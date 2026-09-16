/**
 * PHASE 1 — discussionHub/posts.ts. Single GET route, an axios.get proxy
 * wrapped in try/catch with the standard `res.status(err.response.status ||
 * 500).send(err.response.data || {})` failure shape.
 *
 * Unlike the sibling files in this directory (users.ts, writeApi.ts), no
 * `return async () => {...}` never-invoked-closure bug was found here — the
 * route handler is a plain `async (req, res) => {...}` directly passed to
 * `.get()`, with a real try/catch and a single unconditional
 * `res.send(response.data)` on the success path. No live-test-unsafe
 * patterns identified.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../authoring/utils/header', () => ({
  getRootOrg: jest.fn(() => 'root-org'),
}))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    DISCUSSION_HUB_API_BASE: 'https://discussion.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { postsApi } from './posts'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(postsApi)

beforeEach(() => {
  mockAxios.get.mockReset()
})

/**
 * @description Verifies the GET /:term route proxies to the discussion hub
 * posts upstream using the route param, and forwards success/error responses.
 */
describe('GET /:term', () => {
  it('should return 200 with the upstream body when the request succeeds', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ posts: ['p1'] }))
    const response = await agent().get('/recent')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ posts: ['p1'] })
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/recent/posts/recent',
      expect.objectContaining({ headers: { rootOrg: 'root-org' } })
    )
  })

  it('should forward the upstream status and body when the upstream call fails', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/recent')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('should return 500 with an empty body on a network failure with no upstream response', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/recent')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({})
  })

  it('should build the upstream URL using the term route param', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ posts: [] }))
    const response = await agent().get('/trending')
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/recent/posts/trending',
      expect.anything()
    )
  })
})
