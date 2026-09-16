/**
 * PHASE 1 — user/playlist.ts (202 uncovered).
 *
 * The transform functions from ../../service/playlist (transformToPlaylistV2/V3,
 * transformToSbExtSyncRequest, transformToSbExtPatchRequest, ...) are mocked as
 * pass-through identity functions: these tests are about the ROUTE layer
 * (status codes, header guards, request forwarding), not about verifying the
 * exact shape those transforms produce.
 *
 * Scope: covers every route (sync, recent, accept, reject, share, get-by-id,
 * delete, list, patch, create, add/delete content, trailing get-by-type),
 * including the upstream-HTTP-error branch (err.response present, status/body
 * forwarded) alongside the network-error fallback, and structural edge cases
 * (?wid override, empty pending list, unrecognized :type on the upsert route).
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
  extractUserNameFromRequest: jest.fn(() => 'Test User'),
}))
jest.mock('../../service/playlist', () => ({
  formContentRequestObj: jest.fn((x) => x),
  formPlaylistRequestObj: jest.fn((x) => x),
  formPlaylistupdateObj: jest.fn((x) => x),
  transformToPlaylistV2: jest.fn((x) => x),
  transformToPlaylistV3: jest.fn((x) => x),
  transformToSbExtPatchRequest: jest.fn((x) => x),
  transformToSbExtSyncRequest: jest.fn((x) => ({ content: x })),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: { PLAYLISTV1_API_BASE: 'https://playlist.test', PLAYLIST_API_BASE: 'https://playlist.test' },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { logError } from '../../utils/logger'
import { getPlaylist, playlistApi } from './playlist'

const mockAxios = axios as unknown as jest.Mock
const mockAxiosGet = (axios as jest.Mocked<typeof axios>).get
const mockLogError = logError as jest.MockedFunction<typeof logError>
const agent = () => mountRouter(playlistApi)
const withRootOrg = (req: ReturnType<typeof agent>) => req.set('rootOrg', 'r1')

beforeEach(() => {
  mockAxios.mockReset()
  mockAxiosGet.mockReset()
  mockLogError.mockReset()
})

describe('getPlaylist (exported helper)', () => {
  it('returns the playlist data', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk({ name: 'My Playlist' }))
    await expect(getPlaylist('u1', 'pl-1', 'r1')).resolves.toEqual({ name: 'My Playlist' })
  })
})

describe('GET /sync/:playlistId', () => {
  it('syncs and returns the content', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ items: ['a'] })) // sync-info fetch
      .mockResolvedValueOnce(upstreamOk({})) // contents post
    const response = await withRootOrg(agent().get('/sync/pl-1'))
    expect(response.status).toBe(200)
    // The mocked transformToSbExtSyncRequest wraps its input as { content: x },
    // and the handler sends result.content, so this is the sync-info payload.
    expect(response.body).toEqual({ items: ['a'] })
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/sync/pl-1')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/sync/pl-1'))
    expect(response.status).toBe(500)
  })

  it('forwards the upstream error status and body when the upstream call fails with a response', async () => {
    mockAxios.mockRejectedValue(upstreamError(502, { error: 'sync failed upstream' }))
    const response = await withRootOrg(agent().get('/sync/pl-1'))
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'sync failed upstream' })
  })

  it('logs under the SYNC PLAYLIST label on failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    await withRootOrg(agent().get('/sync/pl-1'))
    expect(mockLogError).toHaveBeenCalledWith('SYNC PLAYLIST ERROR >', expect.anything())
  })
})

describe('GET /recent', () => {
  it('returns recent contents', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ recentContents: ['c1'] }))
    const response = await withRootOrg(agent().get('/recent')).set('org', 'o1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ contents: ['c1'], hasMore: false })
  })

  it('rejects a request missing org/rootOrg', async () => {
    const response = await agent().get('/recent')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/recent')).set('org', 'o1')
    expect(response.status).toBe(500)
  })

  it('forwards the upstream error status and body when the upstream call fails with a response', async () => {
    mockAxios.mockRejectedValue(upstreamError(503, { error: 'recent contents unavailable' }))
    const response = await withRootOrg(agent().get('/recent')).set('org', 'o1')
    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'recent contents unavailable' })
  })

  it('logs under the RECENT PLAYLIST CONTENTS FETCH label on failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    await withRootOrg(agent().get('/recent')).set('org', 'o1')
    expect(mockLogError).toHaveBeenCalledWith('RECENT PLAYLIST CONTENTS FETCH ERROR >', expect.anything())
  })
})

describe('POST /accept/:playlistId', () => {
  it('accepts a pending playlist that exists', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk([{ id: 'pl-1', name: 'x' }]))
    mockAxios.mockResolvedValue(upstreamOk(true))

    const response = await withRootOrg(agent().post('/accept/pl-1')).send({})

    expect(response.status).toBe(200)
  })

  it('returns 404 when the playlist is not in the pending list', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk([]))
    const response = await withRootOrg(agent().post('/accept/missing')).send({})
    expect(response.status).toBe(404)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/accept/pl-1').send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 when the accept upstream call fails', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk([{ id: 'pl-1', name: 'x' }]))
    mockAxios.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().post('/accept/pl-1')).send({})
    expect(response.status).toBe(500)
  })

  it('does not log on failure, unlike /sync and /recent', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk([{ id: 'pl-1', name: 'x' }]))
    mockAxios.mockRejectedValue(networkError())
    await withRootOrg(agent().post('/accept/pl-1')).send({})
    expect(mockLogError).not.toHaveBeenCalled()
  })

  it('forwards the upstream error status and body when the accept call fails with a response', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk([{ id: 'pl-1', name: 'x' }]))
    mockAxios.mockRejectedValue(upstreamError(409, { error: 'already accepted' }))
    const response = await withRootOrg(agent().post('/accept/pl-1')).send({})
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'already accepted' })
  })
})

describe('POST /reject/:playlistId', () => {
  it('rejects the pending playlist', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))
    const response = await withRootOrg(agent().post('/reject/pl-1')).send({})
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().post('/reject/pl-1')).send({})
    expect(response.status).toBe(500)
  })

  it('forwards the upstream error status and body when the reject call fails with a response', async () => {
    mockAxios.mockRejectedValue(upstreamError(404, { error: 'playlist not found' }))
    const response = await withRootOrg(agent().post('/reject/pl-1')).send({})
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'playlist not found' })
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/reject/pl-1').send({})
    expect(response.status).toBe(400)
  })
})

describe('POST /share/:playlistId', () => {
  it('shares the playlist', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))
    const response = await withRootOrg(agent().post('/share/pl-1'))
      .set('Authorization', 'Bearer tok')
      .send({ users: ['u2'] })
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/share/pl-1').send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().post('/share/pl-1'))
      .set('Authorization', 'Bearer tok')
      .send({ users: ['u2'] })
    expect(response.status).toBe(500)
  })

  it('forwards the upstream error status and body when the share call fails with a response', async () => {
    mockAxios.mockRejectedValue(upstreamError(403, { error: 'not permitted to share' }))
    const response = await withRootOrg(agent().post('/share/pl-1'))
      .set('Authorization', 'Bearer tok')
      .send({ users: ['u2'] })
    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'not permitted to share' })
  })
})

describe('GET /:type/:playlistId', () => {
  it('returns the playlist by id', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ id: 'pl-1' }))
    const response = await withRootOrg(agent().get('/goal/pl-1'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'pl-1' })
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/goal/pl-1')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/goal/pl-1'))
    expect(response.status).toBe(500)
  })

  it('forwards the upstream error status and body when the fetch-by-id call fails with a response', async () => {
    mockAxios.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await withRootOrg(agent().get('/goal/pl-1'))
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })
})

describe('DELETE /:playlistId', () => {
  it('deletes the playlist', async () => {
    mockAxios.mockResolvedValue(upstreamOk(true))
    const response = await withRootOrg(agent().delete('/pl-1'))
    expect(response.status).toBe(200)
    expect(response.body).toBe(true)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().delete('/pl-1')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().delete('/pl-1'))
    expect(response.status).toBe(500)
  })

  it('forwards the upstream error status and body when the delete call fails with a response', async () => {
    mockAxios.mockRejectedValue(upstreamError(409, { error: 'cannot delete: in use' }))
    const response = await withRootOrg(agent().delete('/pl-1'))
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'cannot delete: in use' })
  })
})

describe('GET /', () => {
  it('returns all playlists for the user', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk([]))
    const response = await withRootOrg(agent().get('/'))
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/')
    expect(response.status).toBe(400)
  })

  it('splits shared and owned playlists using shared_by', async () => {
    // playlists.result.response items with/without shared_by exercise both
    // filter predicates; the pending-playlists fetch reuses the same mock.
    mockAxiosGet.mockResolvedValue(
      upstreamOk([{ id: 'p1', shared_by: 'other-user' }, { id: 'p2', shared_by: null }])
    )
    const response = await withRootOrg(agent().get('/'))
    expect(response.status).toBe(200)
    expect(response.body.share).toEqual([{ id: 'p1', shared_by: 'other-user' }])
    expect(response.body.user).toEqual([{ id: 'p2', shared_by: null }])
  })

  it('returns 500 when the upstream playlists fetch fails', async () => {
    mockAxiosGet.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/'))
    expect(response.status).toBe(500)
  })

  it('forwards the upstream error status and body when the playlists fetch fails with a response', async () => {
    mockAxiosGet.mockRejectedValue(upstreamError(502, { error: 'playlists service down' }))
    const response = await withRootOrg(agent().get('/'))
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'playlists service down' })
  })

  it('uses the wid query param as the userId when present, overriding the token user', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk([]))
    const response = await withRootOrg(agent().get('/').query({ wid: 'other-user' }))
    expect(response.status).toBe(200)
    expect(mockAxiosGet.mock.calls[0][0]).toContain('/users/other-user/')
  })
})

describe('PATCH /:playlistId', () => {
  it('updates the playlist title and hierarchy', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))
    const response = await withRootOrg(agent().patch('/pl-1'))
      .set('Authorization', 'Bearer tok')
      .send({ playlist_title: 'New Title' })
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().patch('/pl-1').send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().patch('/pl-1')).send({})
    expect(response.status).toBe(500)
  })

  it('forwards the upstream error status and body when the patch call fails with a response', async () => {
    mockAxios.mockRejectedValue(upstreamError(400, { error: 'invalid patch' }))
    const response = await withRootOrg(agent().patch('/pl-1')).send({})
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'invalid patch' })
  })
})

describe('POST /create', () => {
  // Shares the "create content, then patch hierarchy" two-step flow used by
  // goals.ts's create-goal route (docs/DUPLICATE-CODE-CLEANUP.md L1-15/L2-10):
  // one axios call creates the content, a second PATCHes the hierarchy.
  it('creates the playlist content then patches the hierarchy', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ node_id: 'new-content-1' })) // create
      .mockResolvedValueOnce(upstreamOk({}, 201)) // hierarchy patch
    const response = await withRootOrg(agent().post('/create'))
      .set('Authorization', 'Bearer tok')
      .send({ playlist_title: 'New Playlist' })
    expect(response.status).toBe(201)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/create').send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 when the create upstream call fails', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().post('/create'))
      .set('Authorization', 'Bearer tok')
      .send({ playlist_title: 'New Playlist' })
    expect(response.status).toBe(500)
  })

  it('forwards the upstream error status and body when the create call fails with a response', async () => {
    mockAxios.mockRejectedValue(upstreamError(422, { error: 'invalid content' }))
    const response = await withRootOrg(agent().post('/create'))
      .set('Authorization', 'Bearer tok')
      .send({ playlist_title: 'New Playlist' })
    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'invalid content' })
  })

  it('returns 500 when the second call (hierarchy patch) fails after content create succeeds', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ node_id: 'new-content-1' })) // create succeeds
      .mockRejectedValueOnce(networkError()) // hierarchy patch fails
    const response = await withRootOrg(agent().post('/create'))
      .set('Authorization', 'Bearer tok')
      .send({ playlist_title: 'New Playlist' })
    expect(response.status).toBe(500)
  })
})

describe('POST /:playlistId/:type', () => {
  it('adds a content id to the playlist hierarchy', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ result: { content: { childNodes: ['existing-1'] } } })) // hierarchy fetch
      .mockResolvedValueOnce(upstreamOk({ updated: true })) // hierarchy update patch
    const response = await withRootOrg(agent().post('/pl-1/add'))
      .set('Authorization', 'Bearer tok')
      .send({ contentIds: ['c1'] })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ updated: true })
  })

  it('deletes a content id present in the playlist hierarchy', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ result: { content: { childNodes: ['c1'] } } }))
      .mockResolvedValueOnce(upstreamOk({ updated: true }))
    const response = await withRootOrg(agent().post('/pl-1/delete'))
      .set('Authorization', 'Bearer tok')
      .send({ contentIds: ['c1'] })
    expect(response.status).toBe(200)
  })

  it('deletes a content id absent from the playlist hierarchy (index not found)', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ result: { content: { childNodes: ['other'] } } }))
      .mockResolvedValueOnce(upstreamOk({ updated: true }))
    const response = await withRootOrg(agent().post('/pl-1/delete'))
      .set('Authorization', 'Bearer tok')
      .send({ contentIds: ['c1'] })
    expect(response.status).toBe(200)
  })

  it('leaves the hierarchy children unchanged for a :type that is neither add nor delete', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ result: { content: { childNodes: ['existing-1'] } } }))
      .mockResolvedValueOnce(upstreamOk({ updated: true }))
    const response = await withRootOrg(agent().post('/pl-1/unknown-type'))
      .set('Authorization', 'Bearer tok')
      .send({ contentIds: ['c1'] })
    expect(response.status).toBe(200)
    // Neither the add nor delete branch runs, so the second axios call's body
    // should carry the childNodes array untouched (still just 'existing-1').
    const hierarchyPatchCall = mockAxios.mock.calls[1][0]
    expect(hierarchyPatchCall.data.request.data.hierarchy['pl-1'].children).toEqual(['existing-1'])
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/pl-1/add').send({ contentIds: ['c1'] })
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().post('/pl-1/add'))
      .set('Authorization', 'Bearer tok')
      .send({ contentIds: ['c1'] })
    expect(response.status).toBe(500)
  })

  it('forwards the upstream error status and body when the hierarchy fetch fails with a response', async () => {
    mockAxios.mockRejectedValue(upstreamError(404, { error: 'playlist hierarchy not found' }))
    const response = await withRootOrg(agent().post('/pl-1/add'))
      .set('Authorization', 'Bearer tok')
      .send({ contentIds: ['c1'] })
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'playlist hierarchy not found' })
  })

  it('forwards the upstream error status and body when the hierarchy update patch fails with a response', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ result: { content: { childNodes: ['existing-1'] } } }))
      .mockRejectedValueOnce(upstreamError(409, { error: 'version conflict' }))
    const response = await withRootOrg(agent().post('/pl-1/add'))
      .set('Authorization', 'Bearer tok')
      .send({ contentIds: ['c1'] })
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'version conflict' })
  })
})

describe('GET /:type', () => {
  it('returns pending playlists', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk([{ id: 'pl-1' }]))
    const response = await withRootOrg(agent().get('/pending'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'pl-1' }])
  })

  it('returns an empty array when there are no pending playlists', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk([]))
    const response = await withRootOrg(agent().get('/pending'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/pending')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxiosGet.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/pending'))
    expect(response.status).toBe(500)
  })

  it('forwards the upstream error status and body when the pending-playlists fetch fails with a response', async () => {
    mockAxiosGet.mockRejectedValue(upstreamError(502, { error: 'pending fetch failed' }))
    const response = await withRootOrg(agent().get('/pending'))
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'pending fetch failed' })
  })
})
