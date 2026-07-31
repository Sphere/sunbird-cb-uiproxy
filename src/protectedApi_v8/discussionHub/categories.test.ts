/**
 * PHASE 1 — discussionHub/categories.ts. Two GET routes, both axios.get
 * proxies wrapped in try/catch with the standard `res.status(err.response.status
 * || 500).send(err.response.data || {})` failure shape.
 *
 * Same shape as the sibling topics.ts (already verified clean): no
 * `return async () => {...}` never-invoked-closure bug, no un-`else`'d
 * conditional response, single unconditional `res.send(response.data)` on
 * the success path of both routes. No live-test-unsafe patterns identified.
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
import { categoriesApi } from './categories'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(categoriesApi)

beforeEach(() => {
  mockAxios.get.mockReset()
})

/**
 * @description Verifies that GET / proxies to the upstream /api/categories
 * endpoint with the rootOrg header on success, and maps upstream/transport
 * failures to the appropriate error status and body.
 */
describe('GET /', () => {
  it('should proxy to /api/categories', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ categories: ['a'] }))
    const response = await agent().get('/')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ categories: ['a'] })
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/categories',
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
 * @description Verifies that GET /:cid/:slug?/:tid? builds the upstream
 * category URL from the cid/slug/tid path segments and page/sort query
 * params, forwards the upstream response on success, does not shadow the
 * literal / route, and maps upstream/transport failures to the appropriate
 * error status and body.
 */
describe('GET /:cid/:slug?/:tid?', () => {
  it('should proxy with only cid, default page and empty sort', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'c1' }))
    const response = await agent().get('/c1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'c1' })
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/category/c1?page=1&sort=',
      expect.objectContaining({ headers: { rootOrg: 'root-org' } })
    )
  })

  it('should append the slug segment when provided', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'c1' }))
    const response = await agent().get('/c1/my-slug')
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/category/c1/my-slug?page=1&sort=',
      expect.anything()
    )
  })

  it('should append the slug and tid segments when both provided', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'c1' }))
    const response = await agent().get('/c1/my-slug/t9')
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/category/c1/my-slug/t9?page=1&sort=',
      expect.anything()
    )
  })

  it('should forward page and sort query params', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'c1' }))
    const response = await agent().get('/c1?page=3&sort=oldest')
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/category/c1?page=3&sort=oldest',
      expect.anything()
    )
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/c1')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('should return 500 on a network failure with no upstream response', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/c1')
    expect(response.status).toBe(500)
  })

  it('should not shadow the literal / route', async () => {
    // Sanity check on route registration order: the param route requires at
    // least one path segment (cid), so the root route above still wins for
    // an empty path.
    mockAxios.get.mockResolvedValue(upstreamOk({ categories: [] }))
    const response = await agent().get('/')
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/categories',
      expect.anything()
    )
    expect(response.status).toBe(200)
  })
})
