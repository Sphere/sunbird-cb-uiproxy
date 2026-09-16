/**
 * event-external.ts — single route.
 *
 * GET / uses the `axios.get()` form against a hardcoded upstream
 * (`https://igot.in`) with a hardcoded api_key header (not sourced from
 * CONSTANTS, so no env key needs mocking for the handler itself — only for
 * the transitively-imported ../configs/request.config, which reads
 * CONSTANTS.TIMEOUT with its own fallback default).
 *
 * try { res.json(data || {}) } catch { forward upstream status/body,
 * falling back to 500 + {} when the failure carries no err.response }. Both
 * status() and data lookups in the catch are guarded with `err &&` /
 * `err.response &&` short-circuits, so a bare network error cannot throw —
 * matches the counter.test.ts exemplar shape.
 */

jest.mock('axios')
jest.mock('../utils/env', () => ({
  CONSTANTS: {},
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { externalEventsApi } from './event-external'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(externalEventsApi)

/**
 * @description Verifies that GET / forwards the upstream response body on
 * success, falls back to an empty object when the upstream body is falsy,
 * calls the hardcoded igot.in endpoint with the hardcoded api_key header,
 * and maps upstream/transport failures to the appropriate error status and
 * body.
 */
describe('GET /', () => {
  it('should forward the upstream response body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ events: [{ id: 'evt-1' }] }))

    const response = await agent().get('/')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ events: [{ id: 'evt-1' }] })
  })

  it('should respond with an empty object when the upstream body is falsy', async () => {
    // upstreamOk() defaults its `data` param to {} for a bare `undefined`
    // argument (default parameters only trigger on undefined), so `null` is
    // used here to actually exercise the `data || {}` fallback branch.
    mockAxios.get.mockResolvedValue(upstreamOk(null))

    const response = await agent().get('/')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({})
  })

  it('should call the hardcoded igot.in endpoint with the api_key header', async () => {
    // The outgoing URL and header ARE the contract here — this handler
    // exists to proxy to a fixed upstream with a fixed key.
    mockAxios.get.mockResolvedValue(upstreamOk({}))

    await agent().get('/')

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://igot.in',
      expect.objectContaining({
        headers: { api_key: '41ccd6ed78971a9051b1b17a9f81dbdff44ac020eff79b3d703ad0afa39490d3' },
      })
    )
  })

  it('should forward an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(503, { error: 'unavailable' }))

    const response = await agent().get('/')

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'unavailable' })
  })

  it('should fall back to 500 with an empty body when the failure carries no upstream response', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent().get('/')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({})
  })
})
