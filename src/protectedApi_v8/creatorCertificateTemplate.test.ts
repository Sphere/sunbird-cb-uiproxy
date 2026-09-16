/**
 * creatorCertificateTemplate.ts — a single route, PATCH /template/add, using
 * the callable `axios({...})` form (never axios.get/axios.post).
 *
 *   try {
 *     validate courseId/batchId/template from req.body.request.batch,
 *     400 + return on failure (properly guarded — no fall-through)
 *     ...axios call...
 *     200 with the upstream body
 *   } catch (error) {
 *     400 with a fixed FAILED body — no error.response access anywhere,
 *     so there is no Pattern-D crash risk in the failure path tested live.
 *   }
 *
 * The destructuring of req.body.request.batch happens INSIDE the try block,
 * so a malformed body (missing `request`) throws synchronously and is caught
 * by the same catch — safe to exercise live.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    HTTPS_HOST: 'https://host.test',
    SB_API_KEY: 'sb-api-key',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { creatorCertificateTemplate } from './creatorCertificateTemplate'

// This handler only ever calls the callable `axios({...})` form, never
// axios.get/axios.post, so the mock is exercised as a jest.Mock directly.
const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(creatorCertificateTemplate)

const validBody = {
  request: {
    batch: {
      batchId: 'batch-1',
      courseId: 'course-1',
      template: { name: 'tpl-1' },
    },
  },
}

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

/**
 * @description Verifies that PATCH /template/add validates courseId,
 * batchId, and template before calling upstream, returns the upstream
 * response on success with the auth headers and full request body
 * forwarded, and always answers with a fixed 400 FAILED body on validation
 * failure or on any upstream/transport error.
 */
describe('PATCH /template/add', () => {
  it('should return 200 with the upstream response when the request succeeds', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ added: true }))

    const response = await agent().patch('/template/add').send(validBody)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      message: 'SUCCESS',
      response: { added: true },
    })
  })

  it('should call the upstream template/add endpoint with the auth headers and full request body', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ added: true }))

    await agent().patch('/template/add').send(validBody)

    expect(mockAxiosCallable).toHaveBeenCalledWith({
      data: validBody,
      headers: {
        Authorization: 'sb-api-key',
        'Content-Type': 'application/json',
        'x-authenticated-user-token': 'token-1',
      },
      method: 'PATCH',
      url: 'https://host.test/api/course/batch/cert/v1/template/add',
    })
  })

  it('should return 400 when courseId is missing', async () => {
    const response = await agent()
      .patch('/template/add')
      .send({ request: { batch: { batchId: 'batch-1', template: { name: 'tpl-1' } } } })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Either courseId, batchId, template missing',
      status: 'FAILED',
    })
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('should return 400 when batchId is missing', async () => {
    const response = await agent()
      .patch('/template/add')
      .send({ request: { batch: { courseId: 'course-1', template: { name: 'tpl-1' } } } })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Either courseId, batchId, template missing',
      status: 'FAILED',
    })
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('should return 400 when template is missing', async () => {
    const response = await agent()
      .patch('/template/add')
      .send({ request: { batch: { batchId: 'batch-1', courseId: 'course-1' } } })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Either courseId, batchId, template missing',
      status: 'FAILED',
    })
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('should return 400 when the request body has no batch/request wrapper at all', async () => {
    // req.body.request.batch throws synchronously here since `request` is
    // undefined; that happens inside the try block, so it is caught by the
    // same catch — safe to exercise live (not a Pattern C/E gap).
    const response = await agent().patch('/template/add').send({})

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'FAILED',
      response: 'Error while adding template',
    })
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('should return a fixed 400 when the upstream call rejects with an error response', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))

    const response = await agent().patch('/template/add').send(validBody)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'FAILED',
      response: 'Error while adding template',
    })
  })

  it('should return a fixed 400 when the upstream call fails with a bare network error', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent().patch('/template/add').send(validBody)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'FAILED',
      response: 'Error while adding template',
    })
  })
})
