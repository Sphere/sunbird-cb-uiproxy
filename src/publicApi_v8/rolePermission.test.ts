/**
 * rolePermission.ts — NOT an Express router. It exports two plain async
 * helper functions consumed by other auth routes (googleSignInRoutes.ts,
 * ssoLogin.ts, tnaiAuth.ts, etc.), each of which does
 * `await getCurrentUserRoles(req, accessToken)` inside its own try/catch.
 * There is no router to mount here, so this suite calls the two exported
 * functions directly with hand-built req-like objects instead of using
 * mountRouter/supertest.
 *
 * setRolesData(reqObj, body):
 *   - reads `body.result.response.id` UNCONDITIONALLY, before the
 *     `if (reqObj.session)` guard, so a malformed body throws regardless of
 *     whether a session is present. Since the function is `async`, that
 *     throw becomes a rejected promise rather than a synchronous exception
 *     -- safe to await directly in a test, but see the fire-and-forget note
 *     below for why it is NOT safe in the one place it's actually called
 *     from production code.
 *   - ROLE (module-level array) already contains 'PUBLIC', so the
 *     `!_.includes(reqObj.session.userRoles, 'PUBLIC')` guard is always
 *     false in practice; the push never runs. Dead code, not a bug -- both
 *     branches are still exercised below for coverage.
 *   - `reqObj.session.save(callback)` is called with a real callback; the
 *     callback's error/success branches only drive logError/logInfo calls,
 *     with no observable effect on the resolved value, so we assert the
 *     promise resolves cleanly in both cases.
 *
 * getCurrentUserRoles(reqObj, accessToken):
 *   - has NO try/catch around its axios call. Ordinarily (see the auto-complete.ts /
 *     Pattern C precedent) that would mean an Express handler's rejection turns into
 *     an unhandled promise rejection. That pattern does not apply here: this
 *     is a plain helper, not a route handler wired straight to Express, and
 *     every real caller does `await getCurrentUserRoles(...)` inside its own
 *     try/catch (confirmed in googleSignInRoutes.ts, ssoLogin.ts, tnaiAuth.ts,
 *     etc.), so the rejection propagates to and is handled by the caller.
 *     Safe to test the failure path live here because this test awaits the
 *     call directly, same as those real callers do.
 *   - on success it calls `setRolesData(reqObj, authTokenResponse.data)`
 *     WITHOUT awaiting or attaching a .catch. In production this IS a
 *     fire-and-forget unhandled-rejection risk: if the upstream `/user/v2/read`
 *     payload doesn't have the `result.response` shape setRolesData expects,
 *     that rejection has no handler anywhere. NOT reproduced live (see report).
 */

jest.mock('../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    SB_API_KEY: 'test-sb-api-key',
    SUNBIRD_PROXY_API_BASE: 'https://sunbird.test/api',
    X_Channel_Id: 'test-channel-id',
  },
}))
jest.mock('axios')

import axios from 'axios'
import { getCurrentUserRoles, setRolesData } from './rolePermission'
import { logError } from '../utils/logger'
import { networkError, upstreamOk } from '../test-support/mockAxios'

const mockAxios = axios as unknown as jest.Mock
const mockLogError = logError as jest.Mock

beforeEach(() => {
  mockAxios.mockReset()
  mockLogError.mockReset()
})

/**
 * @description Verifies setRolesData correctly populates session fields from
 * a valid user-read response body, and handles absent sessions, save errors,
 * and malformed response shapes as described in the file header notes.
 */
describe('setRolesData', () => {
  it('should populate the session from the upstream user-read response', async () => {
    const session: Record<string, unknown> = {
      save: jest.fn((cb: (err?: unknown) => void) => cb()),
    }
    const reqObj = { session }
    const body = {
      result: {
        response: {
          id: 'user-123',
          organisations: ['org-1'],
          rootOrgId: 'root-1',
          userName: 'jdoe',
        },
      },
    }

    await setRolesData(reqObj, body)

    expect(session.userId).toBe('user-123')
    expect(session.userName).toBe('jdoe')
    expect(session.orgs).toEqual(['org-1'])
    expect(session.rootOrgId).toBe('root-1')
    expect(session.userRoles).toEqual(
      expect.arrayContaining(['CBC_ADMIN', 'PUBLIC'])
    )
    // ROLE already contains 'PUBLIC' once; the includes-guard keeps it that way.
    expect(
      (session.userRoles as string[]).filter((r) => r === 'PUBLIC')
    ).toHaveLength(1)
    expect(session.save).toHaveBeenCalledWith(expect.any(Function))
  })

  it('should fall back to response.userId when response.id is absent', async () => {
    const session: Record<string, unknown> = {
      save: jest.fn((cb: (err?: unknown) => void) => cb()),
    }
    const reqObj = { session }
    const body = { result: { response: { userId: 'fallback-user' } } }

    await setRolesData(reqObj, body)

    expect(session.userId).toBe('fallback-user')
  })

  it('should log but still resolve when session.save reports an error', async () => {
    const session: Record<string, unknown> = {
      save: jest.fn((cb: (err?: unknown) => void) => cb(new Error('save failed'))),
    }
    const reqObj = { session }
    const body = { result: { response: { id: 'user-1' } } }

    await expect(setRolesData(reqObj, body)).resolves.toBeUndefined()
    expect(mockLogError).toHaveBeenCalledWith('Error while saving the roles')
  })

  it('should do nothing to the request when reqObj.session is absent', async () => {
    const reqObj = {}
    const body = { result: { response: { id: 'user-1' } } }

    await expect(setRolesData(reqObj, body)).resolves.toBeUndefined()
    expect(reqObj).toEqual({})
  })

  it('should reject when the body does not have the expected result.response shape', async () => {
    const reqObj = { session: {} }

    await expect(setRolesData(reqObj, {})).rejects.toThrow()
  })
})

/**
 * @description Verifies getCurrentUserRoles reads the user via the upstream
 * user-read API with the correct auth headers on success, and rejects when
 * the upstream call fails or when reqObj.session is absent.
 */
describe('getCurrentUserRoles', () => {
  it('should read the user by id from session and forward the auth headers', async () => {
    mockAxios.mockResolvedValue(
      upstreamOk({ result: { response: { id: 'user-123' } } })
    )
    // session.save must be a real function here: getCurrentUserRoles calls
    // setRolesData(reqObj, data) WITHOUT awaiting or .catch-ing it (see file
    // header). If that fire-and-forget call rejects for any reason -- e.g.
    // session.save not being a function, or the upstream body lacking
    // result.response -- there is nothing to catch the rejection and the
    // whole process crashes (confirmed while writing this suite: omitting
    // `save` here reliably killed the Jest worker with an unhandled
    // rejection). NOT reproduced live beyond this one confirmation; see the
    // "MUST VERIFY IN PROD" item reported alongside this file.
    const session: Record<string, unknown> = {
      save: jest.fn((cb: (err?: unknown) => void) => cb()),
      userId: 'user-123',
    }
    const reqObj = { session }

    await getCurrentUserRoles(reqObj, 'access-token-abc')

    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'test-sb-api-key',
          'X-Channel-Id': 'test-channel-id',
          'x-authenticated-user-token': 'access-token-abc',
          'x-authenticated-userid': 'user-123',
        }),
        method: 'GET',
        url: 'https://sunbird.test/api/user/v2/read/user-123',
      })
    )
    // setRolesData is fired-and-forgotten (not awaited) on success; give its
    // microtask a turn before asserting the session it populates.
    await Promise.resolve()
    expect(session.userId).toBe('user-123')
  })

  it('should reject when the upstream read call fails, matching how every real caller awaits it inside its own try/catch', async () => {
    mockAxios.mockRejectedValue(networkError())
    const reqObj = { session: { userId: 'user-123' } }

    await expect(getCurrentUserRoles(reqObj, 'access-token-abc')).rejects.toThrow()
  })

  it('should reject when reqObj.session is absent', async () => {
    const reqObj = {}

    await expect(getCurrentUserRoles(reqObj, 'access-token-abc')).rejects.toThrow()
    expect(mockAxios).not.toHaveBeenCalled()
  })
})
