/**
 * translate.ts — one route, using the callable `axios({...})` form (not
 * axios.get/axios.post):
 *   GET /filterdata/:lang — proxies to `${SB_EXT_API_BASE_2}/filters/:lang`,
 *                           forwarding the optional 'org'/'rootOrg' headers
 *                           upstream. Wrapped in try/catch with a guarded
 *                           `err && err.response && ...` catch block.
 *
 * Safety check (translate.ts lines 16-18): `if (!lang) { res.status(400).send() }`
 * has no `return`, which is normally the double-send Pattern A hazard. Here
 * it is unreachable through real HTTP routing: the route is declared as
 * '/filterdata/:lang', and Express only matches this route when the :lang
 * segment is present and non-empty, so `req.params.lang` is always a
 * truthy string for any request that actually reaches this handler. There
 * is no live input that lands inside the `!lang` branch, so it is not
 * exercised here (and doing so would require calling the handler directly
 * rather than through supertest, which is outside this test's scope).
 *
 * No other hazard (zero-response B, missing try/catch C, unguarded
 * err.response access D, logic outside try/catch E, or a validation check
 * that fails to block F) is present — the single reachable branch is safe
 * to exercise live end-to-end.
 */

jest.mock('axios')
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    SB_EXT_API_BASE_2: 'https://translate.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { translateApi } from './translate'

const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(translateApi)

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

/**
 * @description Verifies that GET /filterdata/:lang proxies to the upstream
 * filters endpoint with the 'org'/'rootOrg' headers forwarded, returns the
 * upstream body and status on success, and maps upstream/transport failures
 * to the appropriate error status and body via the guarded catch block.
 */
describe('GET /filterdata/:lang', () => {
  it('should forward the upstream body on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ filters: ['a', 'b'] }))

    const response = await agent()
      .get('/filterdata/en')
      .set('org', 'org-1')
      .set('rootOrg', 'root-1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ filters: ['a', 'b'] })
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { org: 'org-1', rootOrg: 'root-1' },
        method: 'GET',
        url: 'https://translate.test/filters/en',
      })
    )
  })

  it('should still succeed when the optional org/rootOrg headers are absent', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ filters: [] }))

    const response = await agent().get('/filterdata/fr')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ filters: [] })
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { org: undefined, rootOrg: undefined },
        method: 'GET',
        url: 'https://translate.test/filters/fr',
      })
    )
  })

  it('should forward an upstream error status and body', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent().get('/filterdata/en')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('should fall back to 500 on a transport failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent().get('/filterdata/en')

    expect(response.status).toBe(500)
  })
})
