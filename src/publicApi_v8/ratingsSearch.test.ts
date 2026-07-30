/**
 * PHASE 1 (harder tier) — ratingsSearch.ts. Two routes with real business
 * logic: an Elasticsearch-backed course search combined with a Postgres
 * competency lookup and a ratings-service enrichment call.
 *
 * `pg` is mocked because `new Pool(...)` runs AT IMPORT TIME (module-load
 * side effect) — same pattern already used in bnrcUser.test.ts. Since
 * ratingsSearch.ts actually calls `pool.query(...)` in its handlers (unlike
 * bnrcUser.ts, which only needed the import-time mock), the single Pool
 * instance created at module load is captured below so its `query` mock can
 * be configured per test.
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
    SUNBIRD_PROXY_API_BASE: 'https://proxy.test',
  },
}))

import axios from 'axios'
import { Pool } from 'pg'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { ratingsSearch } from './ratingsSearch'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockPool = (Pool as unknown as jest.Mock).mock.results[0].value as { query: jest.Mock }

const agent = () => mountRouter(ratingsSearch)

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockPool.query.mockReset()
})

describe('POST /getCourses (no query — facet-based search)', () => {
  it('returns the null response when Elasticsearch reports zero results', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: { content: [], count: 0, facets: [] } }))
    const response = await agent()
      .post('/getCourses')
      .send({ request: { facets: [], filters: {} } })
    expect(response.status).toBe(200)
    expect(response.body.result.count).toBe(0)
  })

  it('filters out competency-tagged content and enriches with ratings', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('content/v1/search')) {
        return Promise.resolve(
          upstreamOk({
            result: {
              content: [
                { identifier: 'c1', lang: 'en' },
                { identifier: 'c2', competency: true, lang: 'en' },
              ],
              count: 2,
              facets: [],
            },
          })
        )
      }
      if (config.url.includes('bulkRatingLookup')) {
        return Promise.resolve(upstreamOk([{ activityId: 'c1', averageRating: 4.5 }]))
      }
      return Promise.reject(new Error(`Unexpected call: ${config.url}`))
    })
    const response = await agent()
      .post('/getCourses')
      .send({ request: { facets: [], filters: {} } })
    expect(response.status).toBe(200)
    expect(response.body.result.count).toBe(1)
    expect(response.body.result.content[0].averageRating).toBe(4.5)
  })

  it('keeps competency-tagged content when filters.competency is set', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('content/v1/search')) {
        return Promise.resolve(
          upstreamOk({
            result: { content: [{ identifier: 'c1', competency: true }], count: 1, facets: [] },
          })
        )
      }
      if (config.url.includes('bulkRatingLookup')) return Promise.resolve(upstreamOk([]))
      return Promise.reject(new Error(`Unexpected call: ${config.url}`))
    })
    const response = await agent()
      .post('/getCourses')
      .send({ request: { facets: [], filters: { competency: true } } })
    expect(response.status).toBe(200)
    expect(response.body.result.count).toBe(1)
  })

  it('groups and sorts by competency level when competencySearch has 5+ entries', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('content/v1/search')) {
        return Promise.resolve(
          upstreamOk({
            result: {
              content: [
                { competencies_v1: JSON.stringify([{ level: 3 }]), identifier: 'c1', lang: 'en', lastUpdatedOn: '2024-01-01' },
                { competencies_v1: JSON.stringify([{ level: 1 }]), identifier: 'c2', lang: 'en', lastUpdatedOn: '2024-02-01' },
              ],
              count: 2,
              facets: [],
            },
          })
        )
      }
      if (config.url.includes('bulkRatingLookup')) return Promise.resolve(upstreamOk([]))
      return Promise.reject(new Error(`Unexpected call: ${config.url}`))
    })
    const response = await agent()
      .post('/getCourses')
      .send({ request: { facets: [], filters: { competencySearch: ['a', 'b', 'c', 'd', 'e'] } } })
    expect(response.status).toBe(200)
    expect(response.body.result.content.map((c: { identifier: string }) => c.identifier)).toEqual(['c2', 'c1'])
  })

  it('returns 400 when the search call itself throws', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent()
      .post('/getCourses')
      .send({ request: { facets: [], filters: {} } })
    expect(response.status).toBe(400)
  })
})

describe('POST /getCourses (with query — search-bar path)', () => {
  it('combines primary ES results with competency-matched secondary results', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({ result: { content: [{ identifier: 'p1' }], facets: [] } })
    )
    mockPool.query.mockResolvedValue({ rows: [{ id: 'comp-1' }] })
    const response = await agent()
      .post('/getCourses')
      .send({ request: { facets: [], filters: {}, query: 'react' } })
    expect(response.status).toBe(200)
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('data_node'), ['Competency', '%react%'])
  })

  it('skips the secondary search when no competency matches are found', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({ result: { content: [{ identifier: 'p1' }], facets: [] } })
    )
    mockPool.query.mockResolvedValue({ rows: [] })
    const response = await agent()
      .post('/getCourses')
      .send({ request: { facets: [], filters: {}, query: 'react' } })
    expect(response.status).toBe(200)
    expect(response.body.result.content).toHaveLength(1)
  })

  it('returns the null response when both primary and secondary results are empty', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: { content: [], facets: [] } }))
    mockPool.query.mockResolvedValue({ rows: [] })
    const response = await agent()
      .post('/getCourses')
      .send({ request: { facets: [], filters: {}, query: 'nomatch' } })
    expect(response.status).toBe(200)
    expect(response.body.result.count).toBe(0)
  })

  it('returns 500 when the secondary competency search fails', async () => {
    let callCount = 0
    mockAxiosCallable.mockImplementation(() => {
      callCount += 1
      if (callCount === 1) return Promise.resolve(upstreamOk({ result: { content: [{ identifier: 'p1' }], facets: [] } }))
      return Promise.reject(networkError())
    })
    mockPool.query.mockResolvedValue({ rows: [{ id: 'comp-1' }] })
    const response = await agent()
      .post('/getCourses')
      .send({ request: { facets: [], filters: {}, query: 'react' } })
    expect(response.status).toBe(500)
  })

  it('returns 400 when the Postgres lookup itself fails', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: { content: [{ identifier: 'p1' }], facets: [] } }))
    mockPool.query.mockRejectedValue(new Error('connection refused'))
    const response = await agent()
      .post('/getCourses')
      .send({ request: { facets: [], filters: {}, query: 'react' } })
    expect(response.status).toBe(400)
  })
})

describe('POST /recommendation/publicSearch/getcourse', () => {
  it('combines primary and competency-matched secondary results, enriched with ratings', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('publicSearch/getcourse')) {
        return Promise.resolve(upstreamOk({ results: { content: [{ identifier: 'p1' }] } }))
      }
      if (config.url.includes('publicContent/v1/search')) {
        return Promise.resolve(upstreamOk({ result: { content: [{ identifier: 's1' }] } }))
      }
      if (config.url.includes('bulkRatingLookup')) return Promise.resolve(upstreamOk([]))
      return Promise.reject(new Error(`Unexpected call: ${config.url}`))
    })
    mockPool.query.mockResolvedValue({ rows: [{ id: 'comp-1' }] })
    const response = await agent()
      .post('/recommendation/publicSearch/getcourse')
      .send({ language: 'en', limit: 10, offset: 0, query: 'react' })
    expect(response.status).toBe(200)
    expect(response.body.result.count).toBe(2)
  })

  it('returns the null response when there are no results at all', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ results: { content: [] } }))
    mockPool.query.mockResolvedValue({ rows: [] })
    const response = await agent()
      .post('/recommendation/publicSearch/getcourse')
      .send({ query: 'nomatch' })
    expect(response.status).toBe(200)
    expect(response.body.result.count).toBe(0)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent()
      .post('/recommendation/publicSearch/getcourse')
      .send({ query: 'react' })
    expect(response.status).toBe(500)
  })
})
