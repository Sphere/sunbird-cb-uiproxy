/**
 * PHASE 2 — recommendationEngineV2.ts. Three routes: a simple axios-proxy
 * GET, a search+Postgres-competency-lookup POST (structurally close to
 * ratingsSearch.ts's /recommendation/publicSearch/getcourse but with no
 * ratings-enrichment step — verified against actual source, not assumed),
 * and a CBP recommendation proxy that injects an auth token into the body.
 *
 * `pg` is mocked because `new Pool(...)` runs AT IMPORT TIME.
 */

jest.mock('pg', () => ({ Pool: jest.fn(() => ({ on: jest.fn(), query: jest.fn() })) }))
jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractUserToken: jest.fn(() => 'token-1'),
}))
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
import { recommendationEngineV2 } from './recommendationEngineV2'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockPool = (Pool as unknown as jest.Mock).mock.results[0].value as { query: jest.Mock }

const agent = () => mountRouter(recommendationEngineV2)

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockPool.query.mockReset()
})

describe('GET /', () => {
  it('forwards recommendations, dropping empty background/profession params', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk([{ id: 'c1' }]))
    const response = await agent().get('/')
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).toHaveBeenCalledWith(expect.objectContaining({ params: {} }))
  })

  it('forwards recommendations for a given background/profession', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk([{ id: 'c1' }]))
    const response = await agent().get('/?background=health&profession=nurse')
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ params: { background: 'health', profession: 'nurse' } })
    )
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().get('/')
    expect(response.status).toBe(500)
  })
})

describe('POST /publicSearch/getcourse', () => {
  it('combines primary and competency-matched secondary results', async () => {
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

  it('skips the secondary search when there are no competency matches', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ results: { content: [{ identifier: 'p1' }] } }))
    mockPool.query.mockResolvedValue({ rows: [] })
    const response = await agent().post('/publicSearch/getcourse').send({ query: 'react' })
    expect(response.status).toBe(200)
    expect(response.body.result.count).toBe(1)
  })

  it('returns the null response when there are no results at all', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ results: { content: [] } }))
    mockPool.query.mockResolvedValue({ rows: [] })
    const response = await agent().post('/publicSearch/getcourse').send({ query: 'nomatch' })
    expect(response.status).toBe(200)
    expect(response.body.result.count).toBe(0)
  })

  it('returns 500 on an upstream search failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().post('/publicSearch/getcourse').send({ query: 'react' })
    expect(response.status).toBe(500)
  })

  it('returns 500 when the Postgres lookup fails', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ results: { content: [{ identifier: 'p1' }] } }))
    mockPool.query.mockRejectedValue(new Error('connection refused'))
    const response = await agent().post('/publicSearch/getcourse').send({ query: 'react' })
    expect(response.status).toBe(500)
  })
})

describe('POST /publicSearch/courseRecommendationCbp', () => {
  it('injects the auth token into the request body and forwards the response', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk([{ id: 'c1' }]))
    const response = await agent().post('/publicSearch/courseRecommendationCbp').send({ profile: 'p1' })
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ authToken: 'token-1', profile: 'p1' }) })
    )
  })

  it('prefers the x-authenticated-user-token header over extractUserToken', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk([]))
    const response = await agent()
      .post('/publicSearch/courseRecommendationCbp')
      .set('x-authenticated-user-token', 'header-token')
      .send({})
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ authToken: 'header-token' }) })
    )
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().post('/publicSearch/courseRecommendationCbp').send({})
    expect(response.status).toBe(500)
  })
})
