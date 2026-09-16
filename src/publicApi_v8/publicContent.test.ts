/**
 * publicContent.ts — one route, POST /v1/search, proxying to
 * SUNBIRD_PROXY_API_BASE's /content/v1/search endpoint.
 *
 *   try {
 *     body = { ...req.body }
 *     const response = await axios({...})   // callable axios(...) form
 *     const contents = response.data.result
 *     if (Array.isArray(contents)) { response.data.result = contents.map(processContent) }
 *     res.json(response.data || { filters: [], filtersUsed: [], notVisibleFilters: [], result: [], totalHits: 0 })
 *   } catch (err) {
 *     logError('SEARCH V6 API ERROR >', err)
 *     res.status((err && err.response && err.response.status) || 500).send(
 *       (err && err.response && err.response.data) || { error: GENERAL_ERROR_MSG }
 *     )
 *   }
 *
 * The whole handler is inside one try/catch with no validation branches and
 * no early returns, so there's no double-send / hang / crash pattern here.
 * The `res.json(response.data || {...})` fallback is unreachable in
 * practice: `response.data.result` is read a few lines earlier, which would
 * already throw (into the same catch) if response.data were null/undefined
 * — matching the equivalent fallback in home.ts/searchOrg.ts. Every branch
 * below is safe to exercise live.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    SB_API_KEY: 'test-sb-api-key',
    SUNBIRD_PROXY_API_BASE: 'https://sunbird-proxy.test',
  },
}))

import axios from 'axios'
import { mountRouter } from '../test-support/mountRouter'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { publicContentApi } from './publicContent'

const mockAxios = axios as unknown as jest.Mock
const agent = () => mountRouter(publicContentApi)

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

beforeEach(() => {
  mockAxios.mockReset()
})

/**
 * @description Verifies the POST /v1/search route forwards the request body
 * and auth header to the upstream search endpoint, maps an array `result`
 * through processContent, leaves a non-array `result` untouched, and
 * forwards upstream errors or falls back to a generic 500 on network-level
 * failures.
 */
describe('POST /v1/search', () => {
  it('should return 200 with the upstream body and map an array result through processContent', async () => {
    mockAxios.mockResolvedValue(
      upstreamOk({
        result: [{ identifier: 'c1', contentType: 'Course' }],
        totalHits: 1,
      })
    )

    const response = await agent().post('/v1/search').send({ query: 'leadership' })

    expect(response.status).toBe(200)
    expect(response.body.result).toHaveLength(1)
    expect(response.body.result[0].identifier).toBe('c1')
    // processContent-derived field proves the mapping actually ran.
    expect(response.body.result[0].children).toEqual([])
    expect(response.body.totalHits).toBe(1)
  })

  it('should post the request body and Authorization header to the upstream search endpoint', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ result: [] }))

    await agent().post('/v1/search').send({ query: 'compliance', limit: 5 })

    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { query: 'compliance', limit: 5 },
        headers: { Authorization: 'test-sb-api-key' },
        method: 'POST',
        url: 'https://sunbird-proxy.test/content/v1/search',
      })
    )
  })

  it('should leave a non-array result untouched', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ result: { count: 0 }, totalHits: 0 }))

    const response = await agent().post('/v1/search').send({ query: 'x' })

    expect(response.status).toBe(200)
    expect(response.body.result).toEqual({ count: 0 })
  })

  it('should forward the upstream error status and body when the upstream call fails with an HTTP error', async () => {
    mockAxios.mockRejectedValue(upstreamError(400, { error: 'bad request' }))

    const response = await agent().post('/v1/search').send({ query: 'x' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad request' })
  })

  it('should fall back to 500 with the generic error message on a network-level failure', async () => {
    mockAxios.mockRejectedValue(networkError())

    const response = await agent().post('/v1/search').send({ query: 'x' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: GENERAL_ERROR_MSG })
  })
})
