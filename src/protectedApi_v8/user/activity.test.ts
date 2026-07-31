/**
 * PHASE 1 — user/activity.ts.
 *
 * Single route: GET '/'. userId always comes from
 * extractUserIdFromRequest(req), called once before the try block (mocked
 * here to a fixed value, per campaign convention, so its own internal
 * header/session branching is out of scope for this file). There is no
 * header validation branch — rootOrg/org are read and forwarded as headers
 * unconditionally, then the real axios.get() runs inside a try/catch with
 * the standard `(err && err.response && ...)` guarded fallback in the
 * catch. No Pattern A/B/C/D/E/F issues found on inspection — safe to
 * exercise live for both success and failure (including a network error
 * with no `.response`).
 */

jest.mock('axios')
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    SB_EXT_API_BASE_3: 'https://sb-ext-3.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { activity } from './activity'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(activity)

beforeEach(() => {
  mockAxios.get.mockReset()
})

/**
 * @description Verifies the GET / route returns the upstream activity data
 * on success, and forwards the upstream status/body — or falls back to a
 * generic 500 — when the upstream call fails.
 */
describe('GET /', () => {
  it('should return the caller\'s activity data on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ activities: [{ id: 'a1' }] }))
    const response = await agent().get('/')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ activities: [{ id: 'a1' }] })
  })

  it('should forward the upstream status and body when the upstream call fails', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await agent().get('/')
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('should return 500 with the generic body when the upstream call fails with no response', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })

  it('should send the rootOrg and org headers through to the upstream call', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ activities: [] }))
    const response = await agent().get('/').set('rootOrg', 'r1').set('org', 'o1')
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://sb-ext-3.test/v1/activities/user/user-1',
      expect.objectContaining({
        headers: expect.objectContaining({ rootOrg: 'r1', org: 'o1', wid: 'user-1' }),
      })
    )
  })
})
