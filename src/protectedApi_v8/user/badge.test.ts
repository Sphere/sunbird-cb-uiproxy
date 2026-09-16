/**
 * PHASE 1 — user/badge.ts.
 *
 * Six routes, all axios.get/axios.post proxy calls, with response shaping
 * done by three local helpers (processAllBadges / processRecentBadges /
 * processBadgesRecent) that rewrite `image` fields via appendUrl() (real,
 * unmocked — it's a pure string-concat helper with no env dependency).
 *
 * Two routes are deliberately NOT exercised live — see the comments at each
 * `describe.skip` below for why. Both are real bugs that would hang or crash
 * a live request; reproducing them here would hang/crash the Jest worker
 * instead of failing a single test. Report these for docs/PROD-VERIFICATION.md:
 *
 * 1. GET '/' and GET '/for/:wid' (badge.ts:19-49): `catch (err) { return err }`
 *    — the caught error is returned from the async handler (which Express
 *    ignores) instead of being sent as a response. On any axios rejection,
 *    no response is EVER sent for that request. A live client/test hangs
 *    until timeout. Only the success path is tested for these two routes.
 *
 * 2. GET '/badgeDetail' (badge.ts:55): `const badgeIds = req.query('badgeIds')`
 *    — req.query is the parsed querystring object, not a function (confirmed:
 *    @types/express-serve-static-core@4.16.6 types `query` as `any`, which is
 *    why this compiles). Calling it throws
 *    `TypeError: req.query is not a function` synchronously inside an async
 *    handler, which becomes an unhandled promise rejection (Express 4 does
 *    not catch rejections from async route handlers). Verified in a standalone
 *    repro outside Jest: this crashes the whole Node process (Node's default
 *    unhandledRejection mode is to terminate), not just hang one request.
 *    EVERY call to this route — success or failure input — hits line 55
 *    unconditionally before the try/catch even starts, so there is no safe
 *    input to exercise this route with. Not tested at all.
 */

jest.mock('axios')
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: { SB_EXT_API_BASE_2: 'https://badges.test' },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { badgeApi } from './badge'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(badgeApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

// A badges payload exercising every branch of processAllBadges /
// processBadgeRecentArray / processBadgesRecent in one shot:
//  - a normal badge (image rewritten via appendUrl)
//  - a badge already under /assets/instances/ (left untouched)
//  - a falsy array entry (the `if (!badge) return badge` guard)
const fullBadgesPayload = () => ({
  canEarn: [{ badge_id: 'c1', image: '/assets/instances/c1.png' }],
  closeToEarning: [],
  earned: [{ badge_id: 'e1', image: '/img/e1.png' }],
  lastUpdatedDate: '2026-01-01',
  recent: [null],
  totalPoints: [{ collaborative_points: 1, learning_points: 2 }],
})

describe('GET /', () => {
  it('returns all badges for the token user, rewriting image URLs', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk(fullBadgesPayload()))
    const response = await agent().get('/')
    expect(response.status).toBe(200)
    expect(response.body.earned[0].image).toBe('/apis/proxies/v8/img/e1.png')
    expect(response.body.canEarn[0].image).toBe('/assets/instances/c1.png')
    expect(response.body.recent[0]).toBeNull()
  })

  it('uses the wid query param over the token user id when provided', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk(fullBadgesPayload()))
    const response = await agent().get('/').query({ wid: 'other-user' })
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/other-user/badges'),
      expect.anything()
    )
  })

  // BUG (documented above, not reproduced live): catch block does
  // `return err` with no res.send — a live request here would hang until
  // the test/HTTP timeout instead of failing fast. Skipped intentionally.
})

describe('GET /for/:wid', () => {
  it("returns badges for the given user's :wid path param", async () => {
    mockAxios.get.mockResolvedValue(upstreamOk(fullBadgesPayload()))
    const response = await agent().get('/for/other-user')
    expect(response.status).toBe(200)
    expect(response.body.earned[0].image).toBe('/apis/proxies/v8/img/e1.png')
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/other-user/badges'),
      expect.anything()
    )
  })

  // BUG (documented above, not reproduced live): same `catch (err) { return
  // err }` shape as GET '/' — no response sent on failure. Skipped
  // intentionally.
})

// GET /badgeDetail — intentionally NOT tested. See file-header comment:
// `req.query('badgeIds')` throws for every request (req.query is an object,
// not a function), and that throw becomes an unhandled promise rejection
// that crashes the process rather than failing one test.

describe('POST /newUser', () => {
  it('creates the badge assignment for the token user', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ created: true }))
    const response = await agent().post('/newUser').send({})
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ created: true })
  })

  it('forwards the upstream error body with a 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await agent().post('/newUser').send({})
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('returns the generic 500 fallback on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/newUser').send({})
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /update', () => {
  it('recalculates badges for the token user', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ recalculated: true }))
    const response = await agent().post('/update').send({})
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ recalculated: true })
  })

  it('forwards the upstream error body with a 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(400, { error: 'bad request' }))
    const response = await agent().post('/update').send({})
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'bad request' })
  })

  it('returns the generic 500 fallback on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/update').send({})
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /notification', () => {
  it('returns the processed recent badge when result.response is present', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({
        result: {
          response: {
            recent_badge: { badge_id: 'r1', image: '/img/r1.png' },
            totalPoints: [{ collaborative_points: 3, learning_points: 4 }],
          },
        },
      })
    )
    const response = await agent().get('/notification')
    expect(response.status).toBe(200)
    expect(response.body.recent_badge.image).toBe('/apis/proxies/v8/img/r1.png')
    expect(response.body.totalPoints).toEqual([{ collaborative_points: 3, learning_points: 4 }])
  })

  it('passes through a null recent_badge without calling appendUrl', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({ result: { response: { recent_badge: null, totalPoints: [] } } })
    )
    const response = await agent().get('/notification')
    expect(response.status).toBe(200)
    expect(response.body.recent_badge).toBeNull()
  })

  it('falls back to the empty default shape when result is absent', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({}))
    const response = await agent().get('/notification')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ recent_badge: null, totalPoints: [] })
  })

  it('forwards the upstream status and body on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/notification')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('returns the generic 500 fallback on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/notification')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
