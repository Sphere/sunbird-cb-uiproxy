/**
 * PHASE 1 — user/iconBadge.ts.
 *
 * Single route, GET /unseenNotificationCount:
 *  - extractUserIdFromRequest(req) and the rootOrg header read both happen
 *    INSIDE the try block, so a synchronous throw from either is caught by
 *    the route's own catch — safe to exercise live.
 *  - The only upstream call is a single axios.get(), wrapped in try/catch,
 *    with the standard `(err && err.response && ...)` guarded fallback in
 *    the catch — safe to exercise live for both success and failure
 *    (including a network error with no `.response`).
 *  - There is no rootOrg validation branch (unlike sibling routes) — the
 *    header is simply forwarded as-is, so there's nothing to test-reject.
 *  - Single response statement on each path (res.json on success,
 *    res.status().send() in the catch) — no double-send risk.
 *
 * No Pattern A/B/C/D/E/F issues found on inspection.
 */

jest.mock('axios')
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    NOTIFICATIONS_API_BASE: 'https://notifications.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { iconBadgeApi } from './iconBadge'
import { extractUserIdFromRequest } from '../../utils/requestExtract'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockExtractUserIdFromRequest = extractUserIdFromRequest as jest.Mock
const agent = () => mountRouter(iconBadgeApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockExtractUserIdFromRequest.mockReset()
  mockExtractUserIdFromRequest.mockImplementation(() => 'user-1')
})

/**
 * @description Verifies the GET /unseenNotificationCount route returns the
 * upstream totalCount on success, forwards the upstream status/body — or
 * falls back to a generic 500 — on failure, and also falls back to the
 * route-level 500 catch when userId extraction throws synchronously.
 */
describe('GET /unseenNotificationCount', () => {
  it('should return the unread notification totalCount for the caller', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ totalCount: 7 }))
    const response = await agent().get('/unseenNotificationCount').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(response.body).toBe(7)
  })

  it('should still succeed when the rootOrg header is missing', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ totalCount: 0 }))
    const response = await agent().get('/unseenNotificationCount')
    expect(response.status).toBe(200)
    expect(response.body).toBe(0)
  })

  it('should forward the upstream status and body when the upstream call fails', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await agent().get('/unseenNotificationCount').set('rootOrg', 'r1')
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/unseenNotificationCount').set('rootOrg', 'r1')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })

  it('should fall back to the route-level 500 catch when userId extraction throws synchronously', async () => {
    mockExtractUserIdFromRequest.mockImplementation(() => {
      throw new Error('boom')
    })
    const response = await agent().get('/unseenNotificationCount').set('rootOrg', 'r1')
    expect(response.status).toBe(500)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })
})
