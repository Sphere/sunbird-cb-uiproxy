/**
 * userReporting.ts — six GET routes proxying to USER_REPORTING_SERVICE, all
 * gated by a shared `accesskey` header check compared with `!=` against
 * CONSTANTS.EKSHAMATA_SECURITY_KEY_MASTER. Every route follows the identical
 * shape:
 *   try {
 *     if (req.headers.accesskey != accessKey) { res.status(400).json(...); return }
 *     const response = await axios({...})       // callable axios(...) form, not .get()
 *     res.status(response.status).send(response.data)
 *   } catch (error) { res.status(400).json({...}) }
 *
 * All six are fully try/catch-wrapped with a `return` after the access-key
 * rejection, so no double-send / hang / crash patterns were found — every
 * branch is safe to exercise live.
 */

jest.mock('axios')
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    EKSHAMATA_SECURITY_KEY_MASTER: 'test-access-key',
    USER_REPORTING_SERVICE: 'https://user-reporting.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { userReporting } from './userReporting'

const mockAxios = axios as unknown as jest.Mock

const agent = () => mountRouter(userReporting)

const VALID_KEY = 'test-access-key'
const keyMissingMessage = {
  message: 'Access key invalid or not present',
  status: 'Failed',
}

beforeEach(() => {
  mockAxios.mockReset()
})

describe.each([
  {
    errorMessage: 'Something went wrong while fetching trending courses',
    path: '/user/top/trendingcourses',
  },
  {
    errorMessage: 'Something went wrong while fetching certifcate downloads',
    path: '/user/certificate/downloads',
  },
  {
    errorMessage: 'Something went wrong while fetching registered user total count',
    path: '/user/reg/total_count',
  },
  {
    errorMessage: 'Something went wrong while fetching enrolled user count',
    path: '/user/enroll/user_count',
  },
  {
    errorMessage: 'Something went wrong while fetching course ompleted users',
    path: '/user/course/completed_users',
  },
])('GET $path', ({ path, errorMessage }) => {
  it('returns the upstream payload when the access key is valid', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ count: 42 }))
    const response = await agent().get(path).set('accesskey', VALID_KEY)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ count: 42 })
  })

  it('forwards a non-200 upstream status', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ count: 0 }, 201))
    const response = await agent().get(path).set('accesskey', VALID_KEY)
    expect(response.status).toBe(201)
  })

  it('returns 400 with the invalid-key message when the accesskey header is missing', async () => {
    const response = await agent().get(path)
    expect(response.status).toBe(400)
    expect(response.body).toEqual(keyMissingMessage)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('returns 400 with the invalid-key message when the accesskey header is wrong', async () => {
    const response = await agent().get(path).set('accesskey', 'wrong-key')
    expect(response.status).toBe(400)
    expect(response.body).toEqual(keyMissingMessage)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('returns 400 with the route-specific message when the upstream call fails', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await agent().get(path).set('accesskey', VALID_KEY)
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: errorMessage, status: 'Failed' })
  })
})

describe('GET /role/course/recommendation', () => {
  it('returns the upstream payload when the access key is valid and no query params are given', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ recommendations: [] }))
    const response = await agent().get('/role/course/recommendation').set('accesskey', VALID_KEY)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ recommendations: [] })
    expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({ params: {} }))
  })

  it('passes background and profession through as params when both are given', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ recommendations: ['course-1'] }))
    const response = await agent()
      .get('/role/course/recommendation')
      .query({ background: 'science', profession: 'doctor' })
      .set('accesskey', VALID_KEY)
    expect(response.status).toBe(200)
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({ params: { background: 'science', profession: 'doctor' } })
    )
  })

  it('omits an empty-string background from params', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ recommendations: [] }))
    const response = await agent()
      .get('/role/course/recommendation')
      .query({ background: '', profession: 'doctor' })
      .set('accesskey', VALID_KEY)
    expect(response.status).toBe(200)
    expect(mockAxios).toHaveBeenCalledWith(expect.objectContaining({ params: { profession: 'doctor' } }))
  })

  it('returns 400 with the invalid-key message when the accesskey header is missing', async () => {
    const response = await agent().get('/role/course/recommendation')
    expect(response.status).toBe(400)
    expect(response.body).toEqual(keyMissingMessage)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('returns 400 with the route-specific message when the upstream call fails', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await agent().get('/role/course/recommendation').set('accesskey', VALID_KEY)
    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Something went wrong in course recommendation service',
      status: 'Failed',
    })
  })
})
