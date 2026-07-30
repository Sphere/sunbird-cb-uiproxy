/**
 * userDeactivation.ts — single GET / route that flips a user's profile
 * fields to blank and strips their role assignment, gated by a shared-secret
 * header (CONSTANTS.USER_DEACTIVATION_KEY).
 *
 * REAL BUG FOUND, NOT REPRODUCED LIVE (Pattern B — zero response / hang):
 * the route handler only ever calls res.status(200)... inside
 * `if (profileUpdateStatus && roleUpdateStatus)` — there is no `else`. Both
 * updateNullProfileDetails() and updateUserRoles() swallow every internal
 * error and resolve to `false` rather than reject (see their own try/catch),
 * so whenever either upstream call fails or returns an unexpected shape, the
 * outer try body finishes without calling res.send/json/status/end at all.
 * The outer catch never fires either, because nothing throws. The request
 * hangs forever. This is the campaign's documented "no covering else"
 * pattern — reported instead of reproduced. See the final report for the
 * MUST VERIFY IN PROD item; not added to docs/PROD-VERIFICATION.md here per
 * instructions (that file is maintained by the requester).
 *
 * Only the two safe branches are exercised live below:
 *   - invalid/missing deactivation key -> 400 (returns before anything else)
 *   - both upstream calls succeed -> 200 (the only path that ever responds)
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    KONG_API_BASE: 'https://kong.test',
    SB_API_KEY: 'sb-api-key',
    USER_DEACTIVATION_KEY: 'secret-key',
  },
}))

import axios from 'axios'
import { upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { deactivateUser } from './userDeactivation'

const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(deactivateUser)

const UPDATE_URL = 'https://kong.test/user/private/v1/update'
const ASSIGN_ROLE_URL = 'https://kong.test/user/private/v1/assign/role'

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

describe('GET / — deactivation key validation', () => {
  it('returns 400 when the key header is missing', async () => {
    const response = await agent().get('/').query({ userId: 'u1' })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'User deactivation key missing or invalid' })
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('returns 400 when the key header is present but wrong', async () => {
    const response = await agent().get('/').set('key', 'wrong-key').query({ userId: 'u1' })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'User deactivation key missing or invalid' })
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })
})

describe('GET / — successful deactivation', () => {
  // Routes each axios({...}) call by method/url so all three calls that fire
  // during a success run (the profile PATCH, the role-assign POST, and the
  // fire-and-forget userDetails() lookup described below) resolve correctly
  // regardless of the order they're invoked in.
  beforeEach(() => {
    mockAxiosCallable.mockImplementation((config: { method: string; url: string }) => {
      if (config.url === UPDATE_URL && config.method === 'PATCH') {
        return Promise.resolve(upstreamOk({ responseCode: 'OK', result: { response: 'SUCCESS' } }))
      }
      if (config.url === ASSIGN_ROLE_URL && config.method === 'POST') {
        return Promise.resolve(upstreamOk({ result: { response: 'SUCCESS' } }))
      }
      // POST to UPDATE_URL: userDetails()'s own lookup, invoked without
      // `await` from updateUserRoles (see bug note below) — still needs a
      // resolved value so it doesn't produce an unhandled rejection.
      return Promise.resolve(
        upstreamOk({ result: { response: { content: [{ organisations: [{ organisationId: 'org-1' }] }] } } })
      )
    })
  })

  it('returns 200 when the profile update and role update both succeed', async () => {
    const response = await agent().get('/').set('key', 'secret-key').query({ userId: 'u1' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ message: 'User deactivated successfully' })
  })

  it('sends the emptied-out profile fields for the given userId', async () => {
    await agent().get('/').set('key', 'secret-key').query({ userId: 'u1' })
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { request: { email: '', firstName: '', lastName: '', phone: '', profileDetails: {}, userId: 'u1' } },
        method: 'PATCH',
        url: UPDATE_URL,
      })
    )
  })

  // Documents a second real bug: updateUserRoles() calls
  // `const userOrgDetails = userDetails(userId)` with no `await`, so
  // `userOrgDetails` is the pending Promise object itself, not the resolved
  // organisationId. That Promise is embedded directly into the assign-role
  // request body. This doesn't hang or crash (userDetails() has its own
  // try/catch and never rejects), so it's safe to assert on live — it's a
  // silent data-correctness bug: the upstream role-assign call always
  // receives a Promise instead of the real organisationId.
  it('BUG: sends a pending Promise as organisationId to the assign-role call instead of the resolved value (missing `await` in updateUserRoles)', async () => {
    await agent().get('/').set('key', 'secret-key').query({ userId: 'u1' })
    const assignRoleCall = mockAxiosCallable.mock.calls.find(([config]) => config.url === ASSIGN_ROLE_URL)
    expect(assignRoleCall).toBeDefined()
    const [config] = assignRoleCall as [{ data: { request: { organisationId: unknown } } }]
    expect(config.data.request.organisationId).toBeInstanceOf(Promise)
  })
})

// NOT reproduced live (Pattern B — zero response / hang): when either
// updateNullProfileDetails() or updateUserRoles() resolves `false` (upstream
// failure, unexpected response shape, etc.), the route's
// `if (profileUpdateStatus && roleUpdateStatus)` has no `else`, so no
// response is ever sent and the request hangs forever. Both helpers swallow
// their own errors internally and resolve `false` rather than reject, so the
// route's own try/catch never fires to save it either. Any test that mocks
// an upstream failure or malformed response here would hang the Jest worker
// waiting on supertest's response. Reported in the final summary as a MUST
// VERIFY IN PROD item instead.
