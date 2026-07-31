/**
 * PHASE 1 — user/topic.ts (singular; not to be confused with topics.ts).
 *
 * Two routes, two axios call shapes:
 *  - GET /recommend: try/catch around
 *    `axios.get(...).then((response) => response.data.result.response)`,
 *    then maps `.topics` into a plain ITopic[] shape. Single try block, one
 *    response send in the happy path, one in the catch — no double-send /
 *    zero-response risk. Safe to exercise live, including the case where the
 *    upstream body is missing `topics` (the `.map` on undefined throws
 *    synchronously inside the awaited chain, which the outer catch still
 *    catches, landing on the generic 500 fallback).
 *  - GET /autocomplete: try/catch around the `axios.request({...})` method
 *    form (POST under the hood, with ES basic-auth creds from CONSTANTS and
 *    `req.query.q` as the suggestion prefix), then `res.json(response.data)`.
 *    Same safe single try/catch shape.
 *  Both catch blocks use the guarded
 *  `(err && err.response && err.response.status) || 500` / `.data || {...}`
 *  pattern (no unguarded `err.response` access), so failure paths are safe to
 *  exercise live for both routes.
 */

jest.mock('axios')
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    ES_BASE: 'https://es.test',
    ES_PASSWORD: 'test-es-password',
    ES_USERNAME: 'test-es-username',
    SB_EXT_API_BASE: 'https://sbext.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { topicApi } from './topic'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockAxiosRequest = axios.request as jest.Mock
const agent = () => mountRouter(topicApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxiosRequest.mockReset()
})

/**
 * @description Verifies the GET /recommend route maps the nested upstream
 * topics response into the flattened ITopic shape on success, falls back to
 * the generic 500 body when the upstream response is missing the `topics`
 * field entirely (the resulting TypeError is still caught by the outer
 * try/catch), and forwards the upstream status/body — or the generic 500 —
 * on an axios failure.
 */
describe('GET /recommend', () => {
  it('should return the mapped topics on success', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({
        result: {
          response: {
            topics: [{ count: 3, id: 't1', 'concepts.name': 'Math' }],
          },
        },
      })
    )
    const response = await agent().get('/recommend')
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ count: 3, id: 't1', name: 'Math' }])
  })

  it('should return an empty array when the upstream topics list is empty', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({ result: { response: { topics: [] } } })
    )
    const response = await agent().get('/recommend')
    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it('should fall back to the generic 500 body when the upstream response has no topics field', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ result: { response: {} } }))
    const response = await agent().get('/recommend')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await agent().get('/recommend')
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/recommend')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies the GET /autocomplete route forwards the upstream
 * suggestion payload on success and forwards the upstream status/body — or
 * the generic 500 — on an axios.request() failure.
 */
describe('GET /autocomplete', () => {
  it('should return the autocomplete suggestions for the given query', async () => {
    mockAxiosRequest.mockResolvedValue(
      upstreamOk({ suggest: { 'name-suggest': [{ text: 'mat' }] } })
    )
    const response = await agent().get('/autocomplete').query({ q: 'mat' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ suggest: { 'name-suggest': [{ text: 'mat' }] } })
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxiosRequest.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await agent().get('/autocomplete').query({ q: 'mat' })
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxiosRequest.mockRejectedValue(networkError())
    const response = await agent().get('/autocomplete').query({ q: 'mat' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
