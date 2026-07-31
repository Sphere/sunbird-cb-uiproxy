/**
 * PHASE 2 — autoCompletev2.ts. One route, `GET /getUserDetails`.
 * `elasticsearch`'s `Client` is instantiated at import time (module-load
 * side effect, mocked below) — same `mock.results[0].value` pattern proven
 * for `pg`'s `Pool` in courseRecommendation.test.ts, since this file's
 * client is created once at module scope, not per-request.
 */

jest.mock('elasticsearch', () => ({
  Client: jest.fn(() => ({ search: jest.fn() })),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    ES_IP: 'http://es.test:9200',
  },
}))

import elasticsearch from 'elasticsearch'
import { mountRouter } from '../test-support/mountRouter'
import { autoCompletev2 } from './autoCompletev2'

const mockEsClient = (elasticsearch.Client as unknown as jest.Mock).mock.results[0]
  .value as { search: jest.Mock }

const agent = () => mountRouter(autoCompletev2)

beforeEach(() => {
  mockEsClient.search.mockReset()
})

/**
 * @description Verifies GET /getUserDetails maps Elasticsearch hits into the
 * standard Sunbird envelope on success, and forwards a 500 with a guarded
 * fallback body when the search call fails.
 */
describe('GET /getUserDetails', () => {
  it('should return the matched user documents in the standard response envelope', async () => {
    mockEsClient.search.mockResolvedValue({
      hits: { hits: [{ _source: { firstName: 'Ada', lastName: 'Lovelace' } }] },
    })

    const response = await agent().get('/getUserDetails?details=Ada')

    expect(response.status).toBe(200)
    expect(response.body.responseCode).toBe('OK')
    expect(response.body.result.response.content).toEqual([
      { firstName: 'Ada', lastName: 'Lovelace' },
    ])
    expect(mockEsClient.search).toHaveBeenCalledWith(
      expect.objectContaining({ index: 'user_alias' })
    )
  })

  it('should return an empty content array when there are no matching hits', async () => {
    mockEsClient.search.mockResolvedValue({ hits: { hits: [] } })

    const response = await agent().get('/getUserDetails?details=nomatch')

    expect(response.status).toBe(200)
    expect(response.body.result.response.content).toEqual([])
  })

  it('should return 500 with the guarded fallback body when the search call rejects', async () => {
    mockEsClient.search.mockRejectedValue(new Error('es unavailable'))

    const response = await agent().get('/getUserDetails?details=Ada')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })

  it('should forward the upstream status/body when the rejection carries a response shape', async () => {
    mockEsClient.search.mockRejectedValue({
      response: { data: { message: 'bad request' }, status: 400 },
    })

    const response = await agent().get('/getUserDetails?details=Ada')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'bad request' })
  })
})
