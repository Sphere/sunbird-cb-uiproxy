/**
 * concept.ts — two routes, both the standard axios proxy shape with
 * `err.response.status || 500` / `err.response.data || {...}` catch blocks:
 *   GET  /:ids           — axios.get() form; extracts
 *                          response.data.result.response before sending.
 *                          No validation branch (:ids is a required route
 *                          param, always present when the route matches).
 *   POST /autocomplete   — axios.post() form; forwards req.body plus the
 *                          org/rootOrg headers verbatim, sends
 *                          response.data directly.
 *
 * Both routes wrap their entire body in try/catch and every catch guards
 * `err && err.response` before reading `.status`/`.data`, so none of the
 * double-send (A), zero-response (B), missing try/catch (C), unguarded
 * err.response (D) or bypassed-validation (F) hazards apply here — safe to
 * exercise every branch live, matching the sibling competency.test.ts shape.
 */

jest.mock('axios')
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    NODE_API_BASE: 'https://node.test',
    SB_EXT_API_BASE: 'https://sbext.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { conceptGraphApi } from './concept'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(conceptGraphApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

/**
 * @description Verifies that GET /:ids extracts result.response from the
 * upstream body and forwards it on success, and maps upstream/transport
 * failures to the appropriate error status and body.
 */
describe('GET /:ids', () => {
  it('should forward the extracted result.response on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ result: { response: [{ id: 'c1' }] } }))

    const response = await agent().get('/concept-1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'c1' }])
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://sbext.test/concepts?ids=concept-1',
      expect.anything()
    )
  })

  it('should forward an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent().get('/concept-1')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('should fall back to 500 when the failure carries no upstream response', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent().get('/concept-1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies that POST /autocomplete forwards the request body
 * along with the org/rootOrg headers to the upstream autocomplete endpoint,
 * returns the upstream body and status on success, and maps
 * upstream/transport failures to the appropriate error status and body.
 */
describe('POST /autocomplete', () => {
  it('should forward the upstream body and status on success, passing org/rootOrg headers through', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([{ term: 'sunbird' }]))

    const response = await agent()
      .post('/autocomplete')
      .set('org', 'org-1')
      .set('rootOrg', 'rootorg-1')
      .send({ query: 'sun' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ term: 'sunbird' }])
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://node.test/post/autocomplete',
      { query: 'sun' },
      expect.objectContaining({
        headers: { org: 'org-1', rootOrg: 'rootorg-1' },
      })
    )
  })

  it('should forward an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(400, { error: 'bad request' }))

    const response = await agent().post('/autocomplete').send({ query: 'sun' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad request' })
  })

  it('should fall back to 500 when the failure carries no upstream response', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/autocomplete').send({ query: 'sun' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
