/**
 * PHASE 2 — publicSearch.ts. One route, structurally similar to
 * ratingsSearch.ts's /getCourses but NOT identical — no ratings enrichment
 * step, hardcodes `filters.contentType = ['Course', 'CourseUnit']`, and uses
 * `limit: 200` (vs 20). Re-verified against the actual source rather than
 * ported blindly from ratingsSearch.test.ts.
 *
 * `pg` is mocked because `new Pool(...)` runs AT IMPORT TIME (module-load
 * side effect) — same pattern as ratingsSearch.test.ts / bnrcUser.test.ts.
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
    SUNBIRD_PROXY_API_BASE: 'https://proxy.test',
  },
}))

import axios from 'axios'
import { Pool } from 'pg'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { publicSearch } from './publicSearch'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockPool = (Pool as unknown as jest.Mock).mock.results[0].value as { query: jest.Mock }

const agent = () => mountRouter(publicSearch)

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockPool.query.mockReset()
})

describe('POST /getCourses (no query — facet-based search)', () => {
  it('injects the Course/CourseUnit contentType filter and returns the null response for zero results', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: { content: [], count: 0, facets: [] } }))
    const response = await agent()
      .post('/getCourses')
      .send({ request: { facets: [], filters: {} } })
    expect(response.status).toBe(200)
    expect(response.body.result.count).toBe(0)
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.stringContaining('"contentType":["Course","CourseUnit"]') })
    )
  })

  it('filters out competency-tagged content', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({
        result: {
          content: [{ identifier: 'c1' }, { identifier: 'c2', competency: true }],
          count: 2,
          facets: [],
        },
      })
    )
    const response = await agent()
      .post('/getCourses')
      .send({ request: { facets: [], filters: {} } })
    expect(response.status).toBe(200)
    expect(response.body.result.count).toBe(1)
    expect(response.body.result.content[0].identifier).toBe('c1')
  })

  it('keeps competency-tagged content when filters.competency is set', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({ result: { content: [{ identifier: 'c1', competency: true }], count: 1, facets: [] } })
    )
    const response = await agent()
      .post('/getCourses')
      .send({ request: { facets: [], filters: { competency: true } } })
    expect(response.status).toBe(200)
    expect(response.body.result.count).toBe(1)
  })

  it('groups and sorts by competency level when competencySearch has 5+ entries', async () => {
    mockAxiosCallable.mockResolvedValue(
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
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: { content: [{ identifier: 'p1' }], facets: [] } }))
    mockPool.query.mockResolvedValue({ rows: [{ id: 'comp-1' }] })
    const response = await agent()
      .post('/getCourses')
      .send({ request: { facets: [], filters: {}, query: 'react' } })
    expect(response.status).toBe(200)
    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('data_node'), ['Competency', '%react%'])
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
