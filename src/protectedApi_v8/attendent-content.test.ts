/**
 * attendent-content.ts — three GET routes, all following the same shape:
 * a `rootOrg` header guard (400 + return on missing) followed by a single
 * `axios.get` call, forwarded on success and mapped through the standard
 * `err.response.status || 500` / `err.response.data || err` catch on
 * failure.
 *
 * extractUserIdFromRequest is mocked wholesale rather than exercised for
 * real: its fallback path reads req.session.userId, and mountRouter() does
 * not install session middleware by default, so calling the real
 * implementation here would throw on req.session being undefined. That
 * throw happens before the try/catch in both routes that use it (lines 21
 * and 68 in attendent-content.ts, both outside the try block), so it is not
 * a live-test safety hazard to mock around — it's just irrelevant to this
 * file's behaviour, matching the sibling cohorts.test.ts / leaderboard.test.ts
 * approach.
 */

jest.mock('axios')
jest.mock('../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    ATTENDANCE_API_BASE: 'https://attendance.test',
    TIMEOUT: '10000',
  },
}))

import axios from 'axios'
import { attendedContentApi } from './attendent-content'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(attendedContentApi)

beforeEach(() => {
  mockAxios.get.mockReset()
})

/**
 * @description Verifies that GET /attendedCourses guards on the missing
 * rootOrg header, wraps the upstream response in a contents envelope, calls
 * the attended-content endpoint with the expected sourceFields, and maps
 * upstream/transport failures to the appropriate error status.
 */
describe('GET /attendedCourses', () => {
  it('should reject a request missing the rootOrg header', async () => {
    const response = await agent().get('/attendedCourses')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should return the upstream data wrapped in a contents envelope on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'course1' }]))

    const response = await agent()
      .get('/attendedCourses')
      .set('rootOrg', 'r1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ contents: [{ id: 'course1' }] })
  })

  it('should request the configured attended-courses endpoint with sourceFields', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))

    await agent()
      .get('/attendedCourses')
      .query({ sourceFields: 'name,id' })
      .set('rootOrg', 'r1')

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://attendance.test/v1/users/user-1/attended-content?source_fields=name,id',
      expect.objectContaining({ headers: { rootOrg: 'r1' } })
    )
  })

  it('should forward an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent()
      .get('/attendedCourses')
      .set('rootOrg', 'r1')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('should fall back to 500 on a transport failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent()
      .get('/attendedCourses')
      .set('rootOrg', 'r1')

    expect(response.status).toBe(500)
  })
})

/**
 * @description Verifies that GET /attendedUsers/:contentId guards on the
 * missing rootOrg header, forwards the upstream attended-users response on
 * success, calls the correct endpoint, and maps upstream/transport failures
 * to the appropriate error status.
 */
describe('GET /attendedUsers/:contentId', () => {
  it('should reject a request missing the rootOrg header', async () => {
    const response = await agent().get('/attendedUsers/course1')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should forward the upstream status and body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ users: ['u1'] }))

    const response = await agent()
      .get('/attendedUsers/course1')
      .set('rootOrg', 'r1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ users: ['u1'] })
  })

  it('should request the configured attended-users endpoint', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({}))

    await agent()
      .get('/attendedUsers/course1')
      .set('rootOrg', 'r1')

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://attendance.test/v1/content/course1/attended-users',
      expect.objectContaining({ headers: { rootOrg: 'r1' } })
    )
  })

  it('should forward an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(403, { error: 'forbidden' }))

    const response = await agent()
      .get('/attendedUsers/course1')
      .set('rootOrg', 'r1')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'forbidden' })
  })

  it('should fall back to 500 on a transport failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent()
      .get('/attendedUsers/course1')
      .set('rootOrg', 'r1')

    expect(response.status).toBe(500)
  })
})

/**
 * @description Verifies that GET /verifyAttendedUsers guards on the missing
 * rootOrg header, forwards the upstream verification response on success,
 * calls the verify-attendence endpoint with the expected contentIds, and
 * maps upstream/transport failures to the appropriate error status.
 */
describe('GET /verifyAttendedUsers', () => {
  it('should reject a request missing the rootOrg header', async () => {
    const response = await agent().get('/verifyAttendedUsers')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should forward the upstream status and body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ verified: true }))

    const response = await agent()
      .get('/verifyAttendedUsers')
      .query({ contentIds: 'course1,course2' })
      .set('rootOrg', 'r1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ verified: true })
  })

  it('should request the configured verify-attendence endpoint with contentIds', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({}))

    await agent()
      .get('/verifyAttendedUsers')
      .query({ contentIds: 'course1,course2' })
      .set('rootOrg', 'r1')

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://attendance.test/v1/users/user-1/verify-attendence?content_id=course1,course2',
      expect.objectContaining({ headers: { rootOrg: 'r1' } })
    )
  })

  it('should forward an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(409, { error: 'conflict' }))

    const response = await agent()
      .get('/verifyAttendedUsers')
      .query({ contentIds: 'course1' })
      .set('rootOrg', 'r1')

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('should fall back to 500 on a transport failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent()
      .get('/verifyAttendedUsers')
      .query({ contentIds: 'course1' })
      .set('rootOrg', 'r1')

    expect(response.status).toBe(500)
  })
})
