/**
 * PHASE 1 — discussionHub/users.ts. Nine routes share one shape: resolve a
 * NodeBB user UID/slug via discussionHub-helper, then an axios.get proxy.
 *
 * Real bug found while reading this file (documented in
 * docs/PROD-VERIFICATION.md, NOT exercised for its buggy behaviour beyond
 * confirming the route doesn't crash): `getUserByEmail` and
 * `getUserByUsername` both `return async () => {...}` instead of calling and
 * awaiting that inner function — so the axios call inside them NEVER
 * executes, and `GET /email/:email` always responds 200 with an empty body,
 * regardless of whether a matching user exists upstream.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/discussionHub-helper', () => ({
  getUserSlug: jest.fn(async () => 'user-slug'),
  getUserUID: jest.fn(async () => 'uid-1'),
  getWriteApiToken: jest.fn(() => 'write-api-token'),
}))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: { DISCUSSION_HUB_API_BASE: 'https://discussion.test' },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { getUserByEmail, getUserByUsername, usersApi } from './users'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(usersApi)

beforeEach(() => {
  mockAxios.get.mockReset()
})

const SLUG_ROUTES: Array<[string, string]> = [
  ['/s1/bookmarks', '/api/user/s1/bookmarks'],
  ['/s1/downvoted', '/api/user/s1/downvoted'],
  ['/s1/groups', '/api/user/s1/groups'],
  ['/s1/info', '/api/user/s1/info'],
  ['/s1/posts', '/api/user/s1/posts'],
  ['/s1/upvoted', '/api/user/s1/upvoted'],
  ['/s1/watched', '/api/user/s1/watched'],
  ['/s1/about', '/api/user/s1'],
]

describe.each(SLUG_ROUTES)('GET %s', (path, expectedUrlFragment) => {
  it('proxies the request with the resolved uid', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ ok: true }))
    const response = await agent().get(path)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining(expectedUrlFragment),
      expect.objectContaining({ headers: { authorization: 'write-api-token' } })
    )
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get(path)
    expect(response.status).toBe(500)
  })
})

describe('GET /me', () => {
  it('resolves the slug then proxies the profile', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'me' }))
    const response = await agent().get('/me')
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/user/user-slug'),
      expect.anything()
    )
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/me')
    expect(response.status).toBe(500)
  })
})

describe('GET /email/:email', () => {
  it('always responds 200 with an empty body — getUserByEmail never calls axios (documented bug)', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'u1' }))
    const response = await agent().get('/email/user@test.com')
    expect(response.status).toBe(200)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('returns 500 when a request-extraction helper throws before getUserByEmail is reached', async () => {
    // Covers the route's own catch block (a different code path from the
    // documented closure bug below) by making a synchronous dependency throw.
    ;(extractUserIdFromRequest as jest.Mock).mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const response = await agent().get('/email/user@test.com')
    expect(response.status).toBe(500)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })
})

describe('getUserByEmail / getUserByUsername', () => {
  it('getUserByEmail resolves to a never-invoked function instead of user data', async () => {
    const result = await getUserByEmail('user@test.com')
    expect(typeof result).toBe('function')
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('getUserByUsername resolves to a never-invoked function instead of user data', async () => {
    const result = await getUserByUsername('user1')
    expect(typeof result).toBe('function')
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('getUserByEmail catches a synchronous error thrown while building the request URL', async () => {
    // This exercises getUserByEmail's OWN try/catch (a genuinely reachable
    // path, unrelated to the documented "closure never invoked" bug) by
    // handing it an email whose implicit string coercion throws.
    const boom = new Error('bad email')
    const badEmail = { toString: () => { throw boom } }
    const result = await getUserByEmail(badEmail)
    expect(result).toBe(boom)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('getUserByUsername catches a synchronous error thrown while building the request URL', async () => {
    const boom = new Error('bad username')
    const badUsername = { toString: () => { throw boom } }
    const result = await getUserByUsername(badUsername)
    expect(result).toBe(boom)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })
})
