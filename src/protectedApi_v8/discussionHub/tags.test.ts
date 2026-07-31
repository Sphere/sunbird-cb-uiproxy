/**
 * PHASE 1 — discussionHub/tags.ts. Two GET routes, both axios.get proxies
 * wrapped in try/catch with the standard `res.status(err.response.status ||
 * 500).send(err.response.data || {})` failure shape.
 *
 * Unlike the sibling files in this directory (users.ts, writeApi.ts), no
 * `return async () => {...}` never-invoked-closure bug was found here —
 * every route has a real try/catch and a single unconditional
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
import { tagsApi } from './tags'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(tagsApi)

beforeEach(() => {
  mockAxios.get.mockReset()
})

/**
 * @description Verifies the GET / route proxies to the discussion hub tags
 * upstream API and forwards success/error responses.
 */
describe('GET /', () => {
  it('should proxy to /api/tags', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ tags: ['a'] }))
    const response = await agent().get('/')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ tags: ['a'] })
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/tags',
      expect.objectContaining({ headers: { rootOrg: 'root-org' } })
    )
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('should return 500 on a network failure with no upstream response', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/')
    expect(response.status).toBe(500)
  })
})

/**
 * @description Verifies the GET /:tagName route proxies to the discussion hub
 * tags upstream API with the tag name in the path, and that route registration
 * order does not let the param route shadow the literal / route.
 */
describe('GET /:tagName', () => {
  it('should proxy with the tag name in the path', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ topics: ['t1'] }))
    const response = await agent().get('/javascript')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ topics: ['t1'] })
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/tags/javascript',
      expect.objectContaining({ headers: { rootOrg: 'root-org' } })
    )
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/javascript')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('should return 500 on a network failure with no upstream response', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/javascript')
    expect(response.status).toBe(500)
  })

  it('should not shadow the literal / route', async () => {
    // Sanity check on route registration order: the param route requires at
    // least one path segment (tagName), so the root route above still wins
    // for an empty path.
    mockAxios.get.mockResolvedValue(upstreamOk({ tags: [] }))
    const response = await agent().get('/')
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/tags',
      expect.anything()
    )
    expect(response.status).toBe(200)
  })
})
