/**
 * events.ts is a single-route proxy handler matching the EXEMPLAR shape
 * documented in counter.test.ts: axios.get -> forward the upstream body (on
 * the default 200 status, since the handler never calls res.status() on
 * success), or forward the upstream error status/body, falling back to 500
 * with a generic body when the failure carries no upstream response.
 */

jest.mock('axios')
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    CONTENT_API_BASE: 'https://content.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { eventsApi } from './events'

const mockAxios = axios as jest.Mocked<typeof axios>

/**
 * @description Verifies GET / forwards the upstream live-events list on a
 * successful axios call.
 */
describe('GET /', () => {
  it('should forward the upstream body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ events: [{ id: 'evt-1' }] }))

    const response = await mountRouter(eventsApi).get('/')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ events: [{ id: 'evt-1' }] })
  })

  it('should call the configured live-events upstream URL', async () => {
    // The outgoing URL IS the contract here — this handler exists to proxy.
    mockAxios.get.mockResolvedValue(upstreamOk({}))

    await mountRouter(eventsApi).get('/')

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://content.test/live-events',
      expect.anything()
    )
  })

  it('should forward an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(503, { error: 'unavailable' }))

    const response = await mountRouter(eventsApi).get('/')

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'unavailable' })
  })

  it('should fall back to 500 with a generic body when the failure carries no upstream response', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await mountRouter(eventsApi).get('/')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
