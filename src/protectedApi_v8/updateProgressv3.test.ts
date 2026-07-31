/**
 * updateProgressv3.ts — a single route, PATCH /update, over one callable
 * `axios({...})` call (a single UPDATE_PROGRESS PATCH), whose response body
 * is returned directly to the caller. The requestValidator() call and the
 * axios call both sit inside one try/catch, so every failure mode below
 * (validation failure, a thrown TypeError from a malformed body, the axios
 * call rejecting) is caught and answered rather than left to hang — safe to
 * exercise live.
 *
 * The catch handler always responds with a fixed 500 body regardless of the
 * underlying error shape (it never reads error.response), so failure-path
 * assertions here check that fixed body rather than a forwarded upstream
 * status.
 *
 * Differs from updateProgressv2.ts: v2 chains two sequential axios calls
 * (an update-progress PATCH whose result is discarded, then a read-progress
 * POST whose body is returned) and builds a stateReadBody payload from
 * req.body.request.contents[0]. v3 has only the single update-progress
 * PATCH call and returns its response.data directly — no second call, no
 * derived payload, so there's no contents[0]-shape hazard to worry about.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    HTTPS_HOST: 'https://sunbird.test',
    SB_API_KEY: 'sb-key-1',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { updateProgressv3 } from './updateProgressv3'

const mockAxiosCallable = axios as unknown as jest.Mock

const agent = () => mountRouter(updateProgressv3)

const validBody = {
  request: {
    contents: [{ batchId: 'batch1', courseId: 'course1' }],
    userId: 'user1',
  },
}

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

/**
 * @description Verifies the PATCH /update route validates the request body,
 * calls the update-progress upstream endpoint with the expected payload
 * shape, returns its body on success, and returns a fixed 500 body on any
 * failure.
 */
describe('PATCH /update', () => {
  it('should return 200 with the upstream response body when the update-progress call succeeds', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ updated: true }))

    const response = await agent().patch('/update').send(validBody)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ updated: true })
  })

  it('should call the update endpoint with the expected shape', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({}))

    await agent().patch('/update').send(validBody)

    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        data: validBody,
        method: 'PATCH',
        url: 'https://sunbird.test/api/course/v1/content/state/update',
      })
    )
  })

  it('should return 400 when userId is missing from the request', async () => {
    const body = { request: { contents: [{ batchId: 'batch1', courseId: 'course1' }] } }

    const response = await agent().patch('/update').send(body)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: 'Missing parameters: userId',
      type: 'Failed',
    })
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('should return 400 when contents is missing from the request', async () => {
    const body = { request: { userId: 'user1' } }

    const response = await agent().patch('/update').send(body)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: 'Missing parameters: contents',
      type: 'Failed',
    })
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('should return 400 when contents is an empty array', async () => {
    const body = { request: { contents: [], userId: 'user1' } }

    const response = await agent().patch('/update').send(body)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: 'Missing parameters: contents',
      type: 'Failed',
    })
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('should return 500 when the request body has no request key at all', async () => {
    // requestValidator() indexes straight into requestBody[prop] with no
    // null-check of its own; req.body.request being absent means it is
    // called with `undefined`, which throws a synchronous TypeError. That
    // throw happens inside this route's try block, so it lands in the
    // catch and yields the generic 500 body rather than hanging or
    // crashing the process — safe to exercise live.
    const response = await agent().patch('/update').send({})

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      message: 'Something went wrong during progress update',
      status: 'failed',
    })
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('should return 500 when the update-progress call rejects with an upstream error', async () => {
    mockAxiosCallable.mockRejectedValueOnce(upstreamError(400, { error: 'bad request' }))

    const response = await agent().patch('/update').send(validBody)

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      message: 'Something went wrong during progress update',
      status: 'failed',
    })
  })

  it('should return 500 on a transport-level failure with no upstream response', async () => {
    mockAxiosCallable.mockRejectedValueOnce(networkError())

    const response = await agent().patch('/update').send(validBody)

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      message: 'Something went wrong during progress update',
      status: 'failed',
    })
  })
})
