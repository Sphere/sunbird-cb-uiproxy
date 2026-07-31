/**
 * PHASE 1 — user/miniProfile.ts.
 *
 * Single route: GET /:userId.
 *  - No validation branches — userId, rootOrg and org are all read from the
 *    request and forwarded as headers without any guard.
 *  - The axios.get() call is wrapped in a try/catch with the standard
 *    `(err && err.response && ...)` guarded fallback shape — safe to
 *    exercise live for both an upstream error response and a network error
 *    with no `.response`.
 *
 * No Pattern A/B/C/D/E/F issues found on inspection.
 */

jest.mock('axios')
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    NODE_API_BASE: 'https://node-api.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { userMiniProfile } from './miniProfile'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(userMiniProfile)

beforeEach(() => {
  mockAxios.get.mockReset()
})

/**
 * @description Verifies the GET /:userId route returns the raw upstream
 * mini-profile data on success, and forwards the upstream status/body — or
 * falls back to a generic 500 — when the upstream call fails.
 */
describe('GET /:userId', () => {
  it('should return the upstream mini-profile data for the given userId', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ name: 'Jane Doe', userId: 'u1' }))
    const response = await agent().get('/u1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ name: 'Jane Doe', userId: 'u1' })
  })

  it('should return the upstream mini-profile data when rootOrg and org headers are supplied', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ name: 'Jane Doe', userId: 'u1' }))
    const response = await agent().get('/u1').set('rootOrg', 'r1').set('org', 'o1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ name: 'Jane Doe', userId: 'u1' })
  })

  it('should forward the upstream status and body when the mini-profile lookup fails', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'profile not found' }))
    const response = await agent().get('/u1')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'profile not found' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/u1')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
