/**
 * PHASE 2 — courseRecommendation.ts. One route, structurally identical to
 * recommendationEngineV2.ts's /publicSearch/getcourse (same file appears to
 * be duplicated across two locations) — verified against THIS file's actual
 * code rather than assumed from the sibling.
 *
 * `pg` is mocked because `new Pool(...)` runs AT IMPORT TIME.
 */

jest.mock('pg', () => ({ Pool: jest.fn(() => ({ on: jest.fn(), query: jest.fn() })) }))
jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    HTTPS_HOST: 'https://kc.test',
    POSTGRES_DATABASE: 'db',
    POSTGRES_HOST: 'host',
    POSTGRES_PASSWORD: 'pw',
    POSTGRES_PORT: 5432,
    POSTGRES_USER: 'user',
    RECOMMENDATION_API_BASE_V2: 'https://reco-v2.test',
  },
}))

import axios from 'axios'
import { Pool } from 'pg'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { courseRecommendation } from './courseRecommendation'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockPool = (Pool as unknown as jest.Mock).mock.results[0].value as { query: jest.Mock }

const agent = () => mountRouter(courseRecommendation)

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockPool.query.mockReset()
})

/**
 * @description Verifies POST /publicSearch/getcourse merges primary search
 * results with competency-matched secondary results, filters out
 * competency-tagged content, handles the no-results case, and returns 500
 * when either the upstream search or the Postgres lookup fails.
 */
describe('POST /publicSearch/getcourse', () => {
  it('should combine primary and competency-matched secondary results', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('publicSearch/getcourse')) {
        return Promise.resolve(upstreamOk({ results: { content: [{ identifier: 'p1' }] } }))
      }
      return Promise.resolve(upstreamOk({ result: { content: [{ identifier: 's1' }] } }))
    })
    mockPool.query.mockResolvedValue({ rows: [{ id: 'comp-1' }] })

    const response = await agent().post('/publicSearch/getcourse').send({ language: 'en', query: 'react' })

    expect(response.status).toBe(200)
    expect(response.body.result.count).toBe(2)
  })

  it('should skip the secondary search when there are no competency matches', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ results: { content: [{ identifier: 'p1' }] } }))
    mockPool.query.mockResolvedValue({ rows: [] })
    const response = await agent().post('/publicSearch/getcourse').send({ query: 'react' })
    expect(response.status).toBe(200)
    expect(response.body.result.count).toBe(1)
  })

  it('should filter out competency-tagged content from the combined result', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({ results: { content: [{ identifier: 'p1' }, { competency: true, identifier: 'p2' }] } })
    )
    mockPool.query.mockResolvedValue({ rows: [] })
    const response = await agent().post('/publicSearch/getcourse').send({ query: 'react' })
    expect(response.status).toBe(200)
    expect(response.body.result.count).toBe(1)
  })

  it('should return the null response when there are no results at all', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ results: { content: [] } }))
    mockPool.query.mockResolvedValue({ rows: [] })
    const response = await agent().post('/publicSearch/getcourse').send({ query: 'nomatch' })
    expect(response.status).toBe(200)
    expect(response.body.result.count).toBe(0)
  })

  it('should return 500 on an upstream search failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().post('/publicSearch/getcourse').send({ query: 'react' })
    expect(response.status).toBe(500)
  })

  it('should return 500 when the Postgres lookup fails', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ results: { content: [{ identifier: 'p1' }] } }))
    mockPool.query.mockRejectedValue(new Error('connection refused'))
    const response = await agent().post('/publicSearch/getcourse').send({ query: 'react' })
    expect(response.status).toBe(500)
  })

  it('does not include limit/offset in the primary search body, unlike ratingsSearch.ts', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ results: { content: [] } }))
    mockPool.query.mockResolvedValue({ rows: [] })
    await agent().post('/publicSearch/getcourse').send({ limit: 15, offset: 30, query: 'react' })
    const primaryCall = mockAxiosCallable.mock.calls.find(
      ([config]) => config.url.includes('publicSearch/getcourse')
    )
    expect(primaryCall[0].data).not.toHaveProperty('limit')
    expect(primaryCall[0].data).not.toHaveProperty('offset')
  })

  it('does not include a lang filter or limit/offset on the secondary search, unlike ratingsSearch.ts', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ results: { content: [] } }))
    mockPool.query.mockResolvedValue({ rows: [{ id: 'comp-1' }] })
    await agent().post('/publicSearch/getcourse').send({ language: 'en', limit: 15, offset: 30, query: 'react' })
    const secondaryCall = mockAxiosCallable.mock.calls.find(
      ([config]) => config.url.includes('publicContent/v1/search')
    )
    expect(secondaryCall[0].data.request).not.toHaveProperty('limit')
    expect(secondaryCall[0].data.request).not.toHaveProperty('offset')
    expect(secondaryCall[0].data.request.filters).not.toHaveProperty('lang')
  })

  it('does not enrich content with ratings, unlike ratingsSearch.ts', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ results: { content: [{ identifier: 'p1' }] } }))
    mockPool.query.mockResolvedValue({ rows: [] })
    const response = await agent().post('/publicSearch/getcourse').send({ query: 'react' })
    expect(response.status).toBe(200)
    expect(response.body.result.content).toEqual([{ identifier: 'p1' }])
  })
})
