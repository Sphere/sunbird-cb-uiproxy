/**
 * PHASE 1 — user/viewprofile.ts.
 *
 * Single route: GET /:wid.
 *  - Guarded by a rootOrg header check with an explicit `return` after the
 *    400 — the real axios.get() below never runs when rootOrg is missing.
 *    Safe to exercise live.
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
import { viewProfileApi } from './viewprofile'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(viewProfileApi)
const withRootOrg = (req: ReturnType<typeof agent>) => req.set('rootOrg', 'r1')

beforeEach(() => {
  mockAxios.get.mockReset()
})

/**
 * @description Verifies the GET /:wid route rejects requests missing the
 * rootOrg header, forwards the upstream status/body for the caller's
 * profile on success, and forwards the upstream status/body — or falls
 * back to a generic 500 — when the upstream call fails.
 */
describe('GET /:wid', () => {
  it('should reject a request missing the rootOrg header', async () => {
    const response = await agent().get('/w1')
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('should return the upstream profile data for the given wid', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ name: 'Jane Doe', wid: 'w1' }))
    const response = await withRootOrg(agent().get('/w1'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ name: 'Jane Doe', wid: 'w1' })
  })

  it('should forward the upstream status and body when the profile lookup fails', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'profile not found' }))
    const response = await withRootOrg(agent().get('/w1'))
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'profile not found' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/w1'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
