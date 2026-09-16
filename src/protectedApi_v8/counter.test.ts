/**
 * EXEMPLAR — simple proxy handler.
 *
 * This is the template for the ~163 route files that follow the shape:
 *   axios call -> forward status+data, or forward the upstream error status.
 *
 * Three tests per endpoint give near-complete line coverage:
 *   1. success            -> upstream status and body are forwarded
 *   2. upstream error     -> upstream status and body are forwarded
 *   3. transport failure  -> 500 plus the handler's generic body
 *
 * Assertions are on the HTTP response only. Do not assert axios call counts
 * unless the outgoing request itself is the contract being protected.
 */

jest.mock('axios')
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    COUNTER: 'https://counter.test',
    TIMEOUT: '10000',
    USE_SERVING_HOST_COUNTER: '',
  },
}))

import axios from 'axios'
import { CONSTANTS } from '../utils/env'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { counterApi } from './counter'

const mockAxios = axios as jest.Mocked<typeof axios>
// tslint:disable-next-line: no-any
const constants = CONSTANTS as any

describe('GET /counter', () => {
  beforeEach(() => {
    constants.COUNTER = 'https://counter.test'
    constants.USE_SERVING_HOST_COUNTER = ''
  })

  it('forwards the upstream status and body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ visitors: 42 }))

    const response = await mountRouter(counterApi).get('/')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ visitors: 42 })
  })

  it('calls the configured counter host', async () => {
    // The outgoing URL IS the contract here — this handler exists to proxy.
    mockAxios.get.mockResolvedValue(upstreamOk({}))

    await mountRouter(counterApi).get('/')

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://counter.test/stats/data/now',
      expect.anything()
    )
  })

  it('prefers USE_SERVING_HOST_COUNTER when set', async () => {
    constants.USE_SERVING_HOST_COUNTER = 'https://serving.test'
    mockAxios.get.mockResolvedValue(upstreamOk({}))

    await mountRouter(counterApi).get('/')

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://serving.test/stats/data/now',
      expect.anything()
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(503, { error: 'unavailable' }))

    const response = await mountRouter(counterApi).get('/')

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'unavailable' })
  })

  it('falls back to 500 when the failure carries no upstream response', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await mountRouter(counterApi).get('/')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
