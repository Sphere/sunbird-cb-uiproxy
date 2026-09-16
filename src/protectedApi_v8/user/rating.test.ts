/**
 * PHASE 1 — user/rating.ts.
 *
 * Four routes, all guarded by a rootOrg header check with a proper `return`
 * after the 400, and all using the callable `axios({...})` form except
 * DELETE /:id which uses axios.delete(). Every route wraps its single
 * upstream call in try/catch and sends exactly one response on every path —
 * no double-send/no-send/unguarded-error-response patterns found here, so
 * every branch below is safe to exercise live.
 */

jest.mock('axios')
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({ CONSTANTS: { RATING_API_BASE: 'https://rating.test' } }))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { ratingApi } from './rating'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockAxiosMethods = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(ratingApi)
const withRootOrg = (req: ReturnType<typeof agent>) => req.set('rootOrg', 'r1')

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockAxiosMethods.delete.mockReset()
})

/**
 * @description Verifies GET /:contentId returns the stored rating for a
 * content item, enforces the rootOrg header check, and propagates upstream
 * error status/body and network failures.
 */
describe('GET /:contentId', () => {
  it("should return the content's rating", async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ rating: 4 }))
    const response = await withRootOrg(agent().get('/c1'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ rating: 4 })
  })

  it('should reject a request missing rootOrg', async () => {
    const response = await agent().get('/c1')
    expect(response.status).toBe(400)
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await withRootOrg(agent().get('/c1'))
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/c1'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies POST /rating submits an average rating request for a
 * set of content IDs, enforces the rootOrg header check, and propagates
 * upstream error status/body and network failures.
 */
describe('POST /rating', () => {
  it('should submit an average rating request', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ average: 3.5 }))
    const response = await withRootOrg(agent().post('/rating')).send({ contentIds: ['c1', 'c2'] })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ average: 3.5 })
  })

  it('should reject a request missing rootOrg', async () => {
    const response = await agent().post('/rating').send({})
    expect(response.status).toBe(400)
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(400, { error: 'bad request' }))
    const response = await withRootOrg(agent().post('/rating')).send({})
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad request' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().post('/rating')).send({})
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies POST /:contentId submits a rating for a single
 * content item, enforces the rootOrg header check, and propagates upstream
 * error status/body and network failures.
 */
describe('POST /:contentId', () => {
  it('should submit a rating for the content', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ rated: true }))
    const response = await withRootOrg(agent().post('/c1')).send({ rating: 5 })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ rated: true })
  })

  it('should reject a request missing rootOrg', async () => {
    const response = await agent().post('/c1').send({ rating: 5 })
    expect(response.status).toBe(400)
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(409, { error: 'conflict' }))
    const response = await withRootOrg(agent().post('/c1')).send({ rating: 5 })
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().post('/c1')).send({ rating: 5 })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies DELETE /:id deletes a rating via axios.delete(),
 * enforces the rootOrg header check, and propagates upstream error
 * status/body and network failures.
 */
describe('DELETE /:id', () => {
  it('should delete the rating', async () => {
    mockAxiosMethods.delete.mockResolvedValue(upstreamOk({ deleted: true }))
    const response = await withRootOrg(agent().delete('/c1'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ deleted: true })
  })

  it('should reject a request missing rootOrg', async () => {
    const response = await agent().delete('/c1')
    expect(response.status).toBe(400)
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxiosMethods.delete.mockRejectedValue(upstreamError(403, { error: 'forbidden' }))
    const response = await withRootOrg(agent().delete('/c1'))
    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'forbidden' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxiosMethods.delete.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().delete('/c1'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
