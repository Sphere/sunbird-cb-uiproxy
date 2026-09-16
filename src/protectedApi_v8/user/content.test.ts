/**
 * PHASE 1 — user/content.ts.
 *
 * Two axios call shapes: axios.post for POST /contentLikes, and the callable
 * `axios({...})` form for everything else (/like, /like/contents,
 * /like/:contentId, /unlike/:contentId, /assigned-content). getMultipleContent
 * is imported from the sibling ../content router file — mocked here so this
 * suite stays about user/content.ts's own route layer, not content.ts's
 * (already covered by its own content.test.ts).
 *
 * SKIPPED LIVE (real bug, not reproduced against a live HTTP response):
 * GET /like/contents, when the liked-ids list comes back empty (or
 * non-array), does:
 *   if (!Array.isArray(likedIds) || !likedIds.length) { res.send([]) }
 *   // no `return` here
 *   const response = await getMultipleContent(likedIds, ...)
 *   ...
 *   res.json(result)   // <-- SECOND response on the same request
 * This is the "double-send" pattern called out as unsafe to reproduce live —
 * res.send([]) fires with no `return`, so execution falls through and
 * res.json(result) fires again on the same request. See the "real bugs
 * found" note in the test report for file/line and MUST VERIFY IN PROD detail.
 * Every live test below for that route uses a non-empty liked-ids array to
 * avoid ever taking that branch.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    LIKE_API_BASE: 'https://like.test',
    SB_EXT_API_BASE_2: 'https://sbext.test',
  },
}))
jest.mock('../content', () => ({
  getMultipleContent: jest.fn(),
}))

import axios from 'axios'
import { getMultipleContent } from '../content'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { userContentApi } from './content'

const mockAxiosMethods = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const mockGetMultipleContent = getMultipleContent as jest.Mock
const agent = () => mountRouter(userContentApi)
const withOrg = (req: ReturnType<typeof agent>) => req.set('org', 'o1').set('rootOrg', 'r1')

beforeEach(() => {
  mockAxiosMethods.post.mockReset()
  mockAxiosCallable.mockReset()
  mockGetMultipleContent.mockReset()
})

describe('POST /contentLikes', () => {
  it('forwards the like counts on success', async () => {
    mockAxiosMethods.post.mockResolvedValue(upstreamOk({ likes: 5 }))
    const response = await withOrg(agent().post('/contentLikes')).send({ ids: ['c1'] })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ likes: 5 })
  })

  it('rejects a request missing the org header', async () => {
    const response = await agent().post('/contentLikes').set('rootOrg', 'r1').send({})
    expect(response.status).toBe(400)
  })

  it('rejects a request missing the rootOrg header', async () => {
    const response = await agent().post('/contentLikes').set('org', 'o1').send({})
    expect(response.status).toBe(400)
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxiosMethods.post.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await withOrg(agent().post('/contentLikes')).send({})
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxiosMethods.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/contentLikes')).send({})
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /like', () => {
  it('returns the liked ids on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk(['c1', 'c2']))
    const response = await withOrg(agent().get('/like'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual(['c1', 'c2'])
  })

  it('rejects a request missing the org header', async () => {
    const response = await agent().get('/like').set('rootOrg', 'r1')
    expect(response.status).toBe(400)
  })

  it('rejects a request missing the rootOrg header', async () => {
    const response = await agent().get('/like').set('org', 'o1')
    expect(response.status).toBe(400)
  })

  // fetchLikedIdsResponse (the shared helper backing this route) catches the
  // axios rejection and re-throws `new Error(e)` — a brand-new Error with no
  // `.response` property, even when the original axios error carried an
  // upstream status/body. So this route's own catch always takes the
  // generic-500 fallback branch; the upstream status/body is lost. Safe to
  // run live (single response either way) — documented as a real finding
  // below, not a crash risk.
  it('always falls back to 500 (upstream status/body is lost), even for an upstream error response', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await withOrg(agent().get('/like'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/like'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /like/contents', () => {
  it('returns the liked contents on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk(['c1']))
    mockGetMultipleContent.mockResolvedValue([{ identifier: 'c1' }])
    const response = await withOrg(agent().get('/like/contents'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ contents: [{ identifier: 'c1' }], hasMore: false })
  })

  it('rejects a request missing the org header', async () => {
    const response = await agent().get('/like/contents').set('rootOrg', 'r1')
    expect(response.status).toBe(400)
  })

  it('rejects a request missing the rootOrg header', async () => {
    const response = await agent().get('/like/contents').set('org', 'o1')
    expect(response.status).toBe(400)
  })

  it('returns 500 when fetching the liked ids fails', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/like/contents'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })

  it('forwards the upstream status and body when getMultipleContent fails', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk(['c1']))
    mockGetMultipleContent.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await withOrg(agent().get('/like/contents'))
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  // NOT tested live: an empty/non-array liked-ids list makes this handler
  // send two responses on the same request (see file header comment and the
  // "real bugs found" section of the test report) — file:
  // src/protectedApi_v8/user/content.ts lines ~92-102.
})

describe('POST /like/:contentId', () => {
  it('likes the content on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ liked: true }))
    const response = await withOrg(agent().post('/like/c1')).send({})
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ liked: true })
  })

  it('rejects a request missing the org header', async () => {
    const response = await agent().post('/like/c1').set('rootOrg', 'r1').send({})
    expect(response.status).toBe(400)
  })

  it('rejects a request missing the rootOrg header', async () => {
    const response = await agent().post('/like/c1').set('org', 'o1').send({})
    expect(response.status).toBe(400)
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(409, { error: 'conflict' }))
    const response = await withOrg(agent().post('/like/c1')).send({})
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/like/c1')).send({})
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('DELETE /unlike/:contentId', () => {
  it('unlikes the content on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ unliked: true }))
    const response = await withOrg(agent().delete('/unlike/c1')).send({})
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ unliked: true })
  })

  it('rejects a request missing the org header', async () => {
    const response = await agent().delete('/unlike/c1').set('rootOrg', 'r1').send({})
    expect(response.status).toBe(400)
  })

  it('rejects a request missing the rootOrg header', async () => {
    const response = await agent().delete('/unlike/c1').set('org', 'o1').send({})
    expect(response.status).toBe(400)
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await withOrg(agent().delete('/unlike/c1')).send({})
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await withOrg(agent().delete('/unlike/c1')).send({})
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /assigned-content', () => {
  it('returns processed assigned content', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({
        assignedContents: [
          {
            appIcon: 'http://private-abc.internal/icon.png',
            children: [],
            identifier: 'c1',
          },
        ],
      })
    )
    const response = await agent()
      .get('/assigned-content')
      .set('rootOrg', 'r1')
      .query({ pageSize: 10 })
    expect(response.status).toBe(200)
    expect(response.body.hasMore).toBe(false)
    expect(response.body.contents).toHaveLength(1)
    // processContent() ran: the private-host prefix is rewritten.
    expect(response.body.contents[0].appIcon).toBe('/apis/proxies/v8/icon.png')
  })

  it('returns an empty contents list when assignedContents is missing', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({}))
    const response = await agent().get('/assigned-content').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ contents: [], hasMore: false })
  })

  it('rejects a request missing the rootOrg header', async () => {
    const response = await agent().get('/assigned-content')
    expect(response.status).toBe(400)
  })

  it('responds 500 with the raw error on an upstream failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().get('/assigned-content').set('rootOrg', 'r1')
    expect(response.status).toBe(500)
  })
})
