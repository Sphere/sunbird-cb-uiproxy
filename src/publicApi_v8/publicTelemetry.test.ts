/**
 * publicTelemetry.ts — two routes, POST / and POST /telemetry, both
 * structurally identical (the second is a tslint-flagged duplicate of the
 * first): each logs the request body, then
 *
 *   try {
 *     const response = await axios.post(API_END_POINTS.telemetry, req.body, axiosRequestConfig)
 *     res.status(response.status).send(response.data)
 *   } catch (err) {
 *     res.status((err && err.response && err.response.status) || 500).send(
 *       (err && err.response && err.response.data) || { error: 'Failed due to unknown reason' }
 *     )
 *   }
 *
 * Both handlers are entirely inside one try/catch with no early returns and
 * no branching, so there is no double-send / zero-response / unguarded
 * error-property pattern here — every path below is safe to exercise live.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    TELEMETRY_SB_BASE: 'https://telemetry.test',
  },
}))

import axios from 'axios'
import { publicTelemetry } from './publicTelemetry'
import { mountRouter } from '../test-support/mountRouter'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(publicTelemetry)

beforeEach(() => {
  mockAxios.post.mockReset()
})

/**
 * @description Verifies the POST / route forwards the request body to the
 * telemetry upstream and returns its status/body on success, forwards the
 * upstream error status/body on an HTTP failure, and falls back to a 500
 * with the generic error body on a network-level failure.
 */
describe('POST /', () => {
  it('should return the upstream status and body when the telemetry call succeeds', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ result: 'OK' }, 201))

    const response = await agent().post('/').send({ events: [{ eid: 'IMPRESSION' }] })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ result: 'OK' })
  })

  it('should post the request body to the telemetry endpoint with the shared axios request config', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ result: 'OK' }))

    await agent().post('/').send({ events: [{ eid: 'IMPRESSION' }] })

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://telemetry.test/v1/telemetry',
      { events: [{ eid: 'IMPRESSION' }] },
      expect.objectContaining({ retry: 0 })
    )
  })

  it('should forward the upstream error status and body when the telemetry call fails with an HTTP error', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(400, { error: 'bad telemetry payload' }))

    const response = await agent().post('/').send({ events: [] })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad telemetry payload' })
  })

  it('should fall back to 500 with the generic error body on a network-level failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/').send({ events: [] })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies the POST /telemetry route (a duplicate handler of
 * POST /) behaves identically: forwards the request body, returns the
 * upstream status/body on success, forwards upstream HTTP errors, and falls
 * back to a 500 with the generic error body on a network-level failure.
 */
describe('POST /telemetry', () => {
  it('should return the upstream status and body when the telemetry call succeeds', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ result: 'OK' }, 201))

    const response = await agent().post('/telemetry').send({ events: [{ eid: 'IMPRESSION' }] })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ result: 'OK' })
  })

  it('should post the request body to the telemetry endpoint with the shared axios request config', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ result: 'OK' }))

    await agent().post('/telemetry').send({ events: [{ eid: 'IMPRESSION' }] })

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://telemetry.test/v1/telemetry',
      { events: [{ eid: 'IMPRESSION' }] },
      expect.objectContaining({ retry: 0 })
    )
  })

  it('should forward the upstream error status and body when the telemetry call fails with an HTTP error', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(400, { error: 'bad telemetry payload' }))

    const response = await agent().post('/telemetry').send({ events: [] })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad telemetry payload' })
  })

  it('should fall back to 500 with the generic error body on a network-level failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/telemetry').send({ events: [] })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
