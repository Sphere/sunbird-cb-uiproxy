/**
 * updateProgressv2.ts — a single route, PATCH /update, over two sequential
 * callable `axios({...})` calls: an UPDATE_PROGRESS call whose result is
 * discarded, followed by a READ_PROGRESS call whose body is returned to the
 * caller. Both calls, the requestValidator() call, and the payload-shaping
 * logic that reads req.body.request.contents[0] all sit inside one
 * try/catch, so every failure mode below (validation failure, a thrown
 * TypeError from a malformed body, either axios call rejecting) is caught
 * and answered rather than left to hang — safe to exercise live.
 *
 * The catch handler always responds with a fixed 500 body regardless of the
 * underlying error shape (it never reads error.response), so failure-path
 * assertions here check that fixed body rather than a forwarded upstream
 * status.
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
import { updateProgressv2 } from './updateProgressv2'

const mockAxiosCallable = axios as unknown as jest.Mock

const agent = () => mountRouter(updateProgressv2)

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
 * chains the update-progress and read-progress upstream calls with the
 * expected payload shapes, and returns a fixed 500 body on any failure.
 */
describe('PATCH /update', () => {
  it('should return 200 with the read-progress body when both upstream calls succeed', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ progressdetails: { done: 1 } }))

    const response = await agent().patch('/update').send(validBody)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ progressdetails: { done: 1 } })
  })

  it('should call the update endpoint then the read endpoint with the expected shapes', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({}))

    await agent().patch('/update').send(validBody)

    expect(mockAxiosCallable).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: validBody,
        method: 'PATCH',
        url: 'https://sunbird.test/api/course/v1/content/state/update',
      })
    )
    expect(mockAxiosCallable).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: {
          request: {
            batchId: 'batch1',
            contentIds: [],
            courseId: 'course1',
            fields: ['progressdetails'],
            userId: 'user1',
          },
        },
        method: 'POST',
        url: 'https://sunbird.test/api/course/v1/content/state/read',
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

  it('should return 500 when the read-progress call rejects with an upstream error', async () => {
    mockAxiosCallable
      .mockResolvedValueOnce(upstreamOk({}))
      .mockRejectedValueOnce(upstreamError(404, { error: 'not found' }))

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
