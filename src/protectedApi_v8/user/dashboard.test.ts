/**
 * PHASE 1 — user/dashboard.ts.
 *
 * Four routes, all using axios.get/axios.post (never the callable axios({...})
 * form). extractUserIdFromRequest is mocked as a fixed-return helper, matching
 * sibling test files in this directory.
 *
 * SAFETY NOTE (Pattern C — do not remove without re-verifying the source):
 * GET /analytics/progress/:contentType has NO try/catch around its
 * `await axios.get(...)` call. If that call rejects, the rejection becomes an
 * unhandled promise rejection inside the async handler and no response is
 * ever sent — the request hangs forever instead of erroring. Reproducing that
 * live would hang this Jest worker, so only the success path is exercised
 * for that route; the failure path is intentionally NOT tested here.
 * MUST VERIFY IN PROD: confirm whether GET /protected/v8/user/dashboard/analytics/progress/:contentType
 * has ever hung under a real upstream failure (timeout/5xx/DNS) rather than
 * erroring cleanly.
 */

jest.mock('axios')
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    HTTPS_HOST: 'https://dashboard.test',
    LEARNING_HISTORY_API_BASE: 'https://dashboard.test/learning-history',
    PORTAL_PORT: '3000',
    SB_EXT_API_BASE: 'https://dashboard.test/sb-ext',
    TELEMETRY_API_BASE: 'https://dashboard.test/telemetry',
    TIMESPENT_API_BASE: 'https://dashboard.test/timespent',
    USER_ANALYTICS: 'https://dashboard.test/analytics',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { dashboardApi } from './dashboard'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(dashboardApi)
const withRootOrg = (req: ReturnType<typeof agent>) => req.set('rootOrg', 'r1')

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

/**
 * @description Verifies the POST /course/details route forwards the
 * learning history course details on success, and forwards the upstream
 * status/body — or falls back to a generic 500 on a network failure.
 */
describe('POST /course/details', () => {
  it('should forward the learning history course details', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ items: [{ id: 'c1' }] }))
    const response = await agent().post('/course/details').send({ courseIds: ['c1'] })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ items: [{ id: 'c1' }] })
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await agent().post('/course/details').send({ courseIds: ['c1'] })
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/course/details').send({ courseIds: ['c1'] })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies the GET /analytics/progress/:contentType route
 * returns the upstream analytics progress data on success; the failure path
 * is intentionally not tested live (see file-level safety note on the
 * missing try/catch).
 */
describe('GET /analytics/progress/:contentType', () => {
  it('should return the upstream analytics progress data', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ progress: 42 }))
    const response = await agent()
      .get('/analytics/progress/course')
      .query({ startDate: '2020-01-01', endDate: '2020-02-01', isCompleted: 'true' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ progress: 42 })
  })

  // Failure path deliberately NOT tested live — see file-level safety note.
  // This route has no try/catch, so a rejected axios.get() here would hang
  // the request rather than produce an assertable response.
})

/**
 * @description Verifies the GET /course route forwards the course progress
 * list on success, and forwards the upstream status/body — or falls back to
 * a generic 500 on a network failure.
 */
describe('GET /course', () => {
  it('should forward the course progress list', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ items: [{ id: 'c1' }] }, 200))
    const response = await agent()
      .get('/course')
      .query({ contentType: 'course', status: 'inProgress', pageState: '0', pageSize: '10' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ items: [{ id: 'c1' }] })
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/course').query({ contentType: 'course' })
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/course').query({ contentType: 'course' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies the GET /userOrgTime route rejects requests missing
 * the rootOrg header, and otherwise returns the time-spent data and forwards
 * the upstream status/body — or falls back to a generic 500 on a network
 * failure.
 */
describe('GET /userOrgTime', () => {
  it('should reject a request missing rootOrg', async () => {
    const response = await agent().get('/userOrgTime').query({ startdate: '1', enddate: '2' })
    expect(response.status).toBe(400)
  })

  it('should return the time spent data', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ timeSpent: 100 }))
    const response = await withRootOrg(
      agent().get('/userOrgTime').query({ startdate: '1', enddate: '2' })
    )
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ timeSpent: 100 })
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(503, { error: 'service unavailable' }))
    const response = await withRootOrg(agent().get('/userOrgTime'))
    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'service unavailable' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/userOrgTime'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
