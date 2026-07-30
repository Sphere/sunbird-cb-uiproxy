/**
 * PHASE — nodebbUser.ts. Not an Express route file: it exports a single
 * async helper, `fetchnodebbUserDetails`, called by other route handlers
 * (see mobileAppApi.ts, utils/proxyCreator.ts) to create-or-fetch a NodeBB
 * (discussion-hub) user and cache the resulting uid in a module-level
 * in-memory Map with a 24h TTL and LRU eviction above 50k entries.
 *
 * The whole body is wrapped in a single try/catch that swallows every
 * failure and returns `false` — there is no double-send, no hang, and no
 * Pattern-D "not a function" call anywhere in this file. All branches
 * (cache hit, cache miss, TTL expiry, upstream failure, malformed upstream
 * success shape) are safe to exercise live.
 *
 * `axios` is called via the callable form (`axios({...})`, not `.post()`),
 * matching the mock shape used in publicSearch.test.ts / mobileAppApi.test.ts.
 *
 * The userCache Map is module-scoped and persists for the lifetime of this
 * test file (no export exists to reset it, and there's no reason to reach
 * for jest.resetModules() here). Each test below uses its own unique
 * `identifier` to avoid cross-test cache pollution, except the tests that
 * deliberately exercise the cache-hit / cache-expiry behaviour, which reuse
 * one identifier on purpose.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    KONG_API_BASE: 'https://kong.test',
    SB_API_KEY: 'sb-api-key',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { fetchnodebbUserDetails } from './nodebbUser'

const mockAxiosCallable = axios as unknown as jest.Mock

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

describe('cache miss -> create-or-fetch via upstream', () => {
  it('returns the uid from a fresh upstream call', async () => {
    mockAxiosCallable.mockResolvedValueOnce(upstreamOk({ result: { userId: { uid: 'uid-1' } } }))

    const result = await fetchnodebbUserDetails('id-1', 'user1', 'User One', {})

    expect(result).toBe('uid-1')
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { request: { fullname: 'User One', identifier: 'id-1', username: 'user1' } },
        headers: expect.objectContaining({ Authorization: 'sb-api-key', 'Content-Type': 'application/json' }),
        method: 'POST',
        url: 'https://kong.test/discussion/user/v1/create',
      })
    )
  })

  it('updates session.nodebbUid when a session is provided', async () => {
    mockAxiosCallable.mockResolvedValueOnce(upstreamOk({ result: { userId: { uid: 'uid-2' } } }))
    const session: { nodebbUid?: string } = {}

    const result = await fetchnodebbUserDetails('id-2', 'user2', 'User Two', {}, session)

    expect(result).toBe('uid-2')
    expect(session.nodebbUid).toBe('uid-2')
  })

  it('does not touch the session object when none is provided', async () => {
    mockAxiosCallable.mockResolvedValueOnce(upstreamOk({ result: { userId: { uid: 'uid-2b' } } }))

    // Passing no session arg at all must not throw despite the handler
    // conditionally reading/writing `session.nodebbUid`.
    const result = await fetchnodebbUserDetails('id-2b', 'user2b', 'User TwoB', {})

    expect(result).toBe('uid-2b')
  })
})

describe('cache hit', () => {
  it('returns the cached uid on a second call for the same identifier, without calling axios again', async () => {
    mockAxiosCallable.mockResolvedValueOnce(upstreamOk({ result: { userId: { uid: 'uid-3' } } }))
    const first = await fetchnodebbUserDetails('id-3', 'user3', 'User Three', {})
    expect(first).toBe('uid-3')

    mockAxiosCallable.mockClear()
    const second = await fetchnodebbUserDetails('id-3', 'user3', 'User Three', {})

    expect(second).toBe('uid-3')
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('updates session.nodebbUid from the cache on a cache-hit call', async () => {
    mockAxiosCallable.mockResolvedValueOnce(upstreamOk({ result: { userId: { uid: 'uid-4' } } }))
    await fetchnodebbUserDetails('id-4', 'user4', 'User Four', {})

    mockAxiosCallable.mockClear()
    const session: { nodebbUid?: string } = {}
    const second = await fetchnodebbUserDetails('id-4', 'user4', 'User Four', {}, session)

    expect(second).toBe('uid-4')
    expect(session.nodebbUid).toBe('uid-4')
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })
})

describe('cache TTL expiry', () => {
  it('re-fetches from upstream once the cached entry is older than 24h', async () => {
    const dateNowSpy = jest.spyOn(Date, 'now')
    const t0 = 1_700_000_000_000
    dateNowSpy.mockReturnValue(t0)

    mockAxiosCallable.mockResolvedValueOnce(upstreamOk({ result: { userId: { uid: 'uid-5-old' } } }))
    const first = await fetchnodebbUserDetails('id-5', 'user5', 'User Five', {})
    expect(first).toBe('uid-5-old')

    // Advance past the 24h TTL.
    dateNowSpy.mockReturnValue(t0 + CACHE_TTL_MS + 1)
    mockAxiosCallable.mockReset()
    mockAxiosCallable.mockResolvedValueOnce(upstreamOk({ result: { userId: { uid: 'uid-5-new' } } }))

    const second = await fetchnodebbUserDetails('id-5', 'user5', 'User Five', {})

    expect(second).toBe('uid-5-new')
    expect(mockAxiosCallable).toHaveBeenCalledTimes(1)

    dateNowSpy.mockRestore()
  })
})

describe('failure path (single try/catch wraps the whole body — safe to test live)', () => {
  it('returns false on a network-level failure with no upstream response', async () => {
    mockAxiosCallable.mockRejectedValueOnce(networkError())

    const result = await fetchnodebbUserDetails('id-6', 'user6', 'User Six', {})

    expect(result).toBe(false)
  })

  it('returns false when upstream responds with an error status', async () => {
    mockAxiosCallable.mockRejectedValueOnce(upstreamError(500, { error: 'boom' }))

    const result = await fetchnodebbUserDetails('id-7', 'user7', 'User Seven', {})

    expect(result).toBe(false)
  })

  it('returns false when the upstream success response is missing result.userId.uid', async () => {
    // response.data.result.userId.uid is dereferenced without a guard; a
    // malformed-but-200 upstream body throws a TypeError that is caught by
    // the same try/catch, so this is safe to exercise live too.
    mockAxiosCallable.mockResolvedValueOnce(upstreamOk({}))

    const result = await fetchnodebbUserDetails('id-8', 'user8', 'User Eight', {})

    expect(result).toBe(false)
  })

  it('leaves the session untouched when the upstream call fails', async () => {
    mockAxiosCallable.mockRejectedValueOnce(networkError())
    const session: { nodebbUid?: string } = {}

    const result = await fetchnodebbUserDetails('id-9', 'user9', 'User Nine', {}, session)

    expect(result).toBe(false)
    expect(session.nodebbUid).toBeUndefined()
  })

  it('does not cache the identifier when the upstream call fails', async () => {
    mockAxiosCallable.mockRejectedValueOnce(networkError())
    await fetchnodebbUserDetails('id-10', 'user10', 'User Ten', {})

    // A subsequent call for the same identifier must hit upstream again,
    // proving nothing was cached on the failed attempt.
    mockAxiosCallable.mockResolvedValueOnce(upstreamOk({ result: { userId: { uid: 'uid-10-retry' } } }))
    const result = await fetchnodebbUserDetails('id-10', 'user10', 'User Ten', {})

    expect(result).toBe('uid-10-retry')
  })
})
