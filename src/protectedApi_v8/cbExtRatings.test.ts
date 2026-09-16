/**
 * cbExtRatings.ts — four routes, all using the callable `axios({...})` form
 * (never `axios.get`/`axios.post`), all sharing one shape:
 *
 *   try { ...axios call...; res.status(200).json(response.data) }
 *   catch (error) { logInfo(...); res.status(400).json({ message: '<fixed>' }) }
 *
 * Unlike the counter.test.ts / departments.test.ts exemplars, the catch block
 * here does NOT forward the upstream status/body — it always answers 400 with
 * a fixed, route-specific message regardless of whether the failure was an
 * upstream error response or a bare transport failure. Both failure shapes
 * are exercised below to document that they collapse to the same response.
 *
 * GET /summary additionally validates `courseId` before calling upstream,
 * returning 400 with a return statement (no fall-through / double-send risk).
 *
 * Every try/catch here is complete and every catch only touches
 * JSON.stringify(error) and a hardcoded body — no error.response access, so
 * there is no Pattern-D crash risk in the failure paths tested live.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    SB_EXT_API_BASE_2: 'https://ext.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { ratingServiceApi } from './cbExtRatings'

// This handler only ever calls the callable `axios({...})` form, never
// axios.get/axios.post, so the mock is exercised as a jest.Mock directly.
const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(ratingServiceApi)

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

/**
 * @description Verifies that POST /upsert forwards the upstream response
 * body on success, posts the request body to the configured upsert
 * endpoint, and always answers with a fixed 400 message on failure,
 * regardless of whether it was an upstream error response or a bare
 * transport failure.
 */
describe('POST /upsert', () => {
  it('should return the upstream body on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ id: 'r1', rating: 4 }))

    const response = await agent().post('/upsert').send({ rating: 4 })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'r1', rating: 4 })
  })

  it('should post the request body to the configured upsert endpoint', async () => {
    // The outgoing shape IS the contract here — this handler exists to proxy.
    mockAxiosCallable.mockResolvedValue(upstreamOk({}))

    await agent().post('/upsert').send({ rating: 5 })

    expect(mockAxiosCallable).toHaveBeenCalledWith({
      data: { rating: 5 },
      headers: { 'Content-Type': 'application/json' },
      method: 'post',
      url: 'https://ext.test/ratings/v1/upsert',
    })
  })

  it('should return a fixed 400 when the upstream call rejects with an error response', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))

    const response = await agent().post('/upsert').send({ rating: 4 })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Something went wrong while ratings upsert',
    })
  })

  it('should return the same fixed 400 on a bare transport failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent().post('/upsert').send({ rating: 4 })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Something went wrong while ratings upsert',
    })
  })
})

/**
 * @description Verifies that POST /v2/read forwards the upstream response
 * body on success, posts the request body to the configured read endpoint,
 * and always answers with a fixed 400 message on failure, regardless of
 * whether it was an upstream error response or a bare transport failure.
 */
describe('POST /v2/read', () => {
  it('should return the upstream body on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ ratings: [] }))

    const response = await agent().post('/v2/read').send({ courseId: 'c1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ratings: [] })
  })

  it('should post the request body to the configured read endpoint', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({}))

    await agent().post('/v2/read').send({ courseId: 'c1' })

    expect(mockAxiosCallable).toHaveBeenCalledWith({
      data: { courseId: 'c1' },
      headers: { 'Content-Type': 'application/json' },
      method: 'post',
      url: 'https://ext.test/ratings/v2/read',
    })
  })

  it('should return a fixed 400 when the upstream call rejects with an error response', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent().post('/v2/read').send({ courseId: 'c1' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Something went wrong while reading ratings',
    })
  })

  it('should return the same fixed 400 on a bare transport failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent().post('/v2/read').send({ courseId: 'c1' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Something went wrong while reading ratings',
    })
  })
})

/**
 * @description Verifies that POST /ratingLookUp forwards the upstream
 * response body on success, posts the request body to the configured
 * lookup endpoint, and always answers with a fixed 400 message on failure,
 * regardless of whether it was an upstream error response or a bare
 * transport failure.
 */
describe('POST /ratingLookUp', () => {
  it('should return the upstream body on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ found: true }))

    const response = await agent().post('/ratingLookUp').send({ userId: 'u1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ found: true })
  })

  it('should post the request body to the configured lookup endpoint', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({}))

    await agent().post('/ratingLookUp').send({ userId: 'u1' })

    expect(mockAxiosCallable).toHaveBeenCalledWith({
      data: { userId: 'u1' },
      headers: { 'Content-Type': 'application/json' },
      method: 'post',
      url: 'https://ext.test/ratings/v1/ratingLookUp',
    })
  })

  it('should return a fixed 400 when the upstream call rejects with an error response', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(500, { error: 'server error' }))

    const response = await agent().post('/ratingLookUp').send({ userId: 'u1' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Something went wrong while rating lookup',
    })
  })

  it('should return the same fixed 400 on a bare transport failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent().post('/ratingLookUp').send({ userId: 'u1' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Something went wrong while rating lookup',
    })
  })
})

/**
 * @description Verifies that GET /summary validates the required courseId
 * before calling upstream, forwards the upstream summary response on
 * success, requests the configured summary endpoint for the given
 * courseId, and always answers with a fixed 400 message on failure.
 */
describe('GET /summary', () => {
  it('should reject a request with no courseId', async () => {
    const response = await agent().get('/summary')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'CourseId cannot be empty',
      status: 'Failed',
    })
  })

  it('should return the upstream body on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ average: 4.5 }))

    const response = await agent().get('/summary').query({ courseId: 'c1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ average: 4.5 })
  })

  it('should request the configured summary endpoint for the given courseId', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({}))

    await agent().get('/summary').query({ courseId: 'c1' })

    expect(mockAxiosCallable).toHaveBeenCalledWith({
      headers: { 'Content-Type': 'application/json' },
      method: 'GET',
      url: 'https://ext.test/ratings/v1/summary/c1/Course',
    })
  })

  it('should return a fixed 400 when the upstream call rejects with an error response', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(503, { error: 'unavailable' }))

    const response = await agent().get('/summary').query({ courseId: 'c1' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Something went wrong getting summary results',
    })
  })

  it('should return the same fixed 400 on a bare transport failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent().get('/summary').query({ courseId: 'c1' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Something went wrong getting summary results',
    })
  })
})
