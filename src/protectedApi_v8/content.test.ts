/**
 * PHASE 1 — content.ts (290 uncovered).
 *
 * Scope: covers the axios-backed endpoints and the exported helper functions
 * they delegate to (getMultipleContent, getParentDetails, getContentDetails).
 * Deliberately OUT of scope:
 *   - POST /setCookie, POST /setImageCookie — pipe an upstream response
 *     directly into `res` via the callback-style `request` module rather than
 *     returning JSON; a different testing shape (stream assertions), not a
 *     one-line axios mock.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('./user/playlist', () => ({ getPlaylist: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    ENTITY_API_BASE: 'https://entity.test',
    KB_TIMEOUT: '10000',
    LEARNER_SERVICE_API_BASE: 'https://learner.test',
    SB_EXT_API_BASE_2: 'https://ext.test',
    SUNBIRD_PROXY_API_BASE: 'https://sunbird.test',
    TIMEOUT: '10000',
  },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { getPlaylist } from './user/playlist'
import { contentApi } from './content'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const mockGetPlaylist = getPlaylist as jest.Mock

const agent = () => mountRouter(contentApi)
// .set() only exists on the Test object a verb call (.get/.post/...) returns,
// not on the base supertest agent, so headers are applied to the request
// AFTER the verb call rather than chained before it.
// tslint:disable-next-line: no-any
const withOrgHeaders = (req: any) => req.set('org', 'o1').set('rootOrg', 'r1')

const contentItem = (overrides = {}) => ({
  appIcon: 'http://private-host/icon.png',
  contentType: 'Resource',
  identifier: 'do_1',
  ...overrides,
})

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
  mockAxiosCallable.mockReset()
  mockGetPlaylist.mockReset()
})

describe('GET /multiple/:ids', () => {
  it('returns processed content for a comma-separated id list', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk([contentItem(), contentItem({ identifier: 'do_2' })]))

    const response = await withOrgHeaders(agent().get('/multiple/do_1,do_2'))

    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(2)
  })

  it('returns an empty array when upstream sends no array', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk(null))
    const response = await withOrgHeaders(agent().get('/multiple/do_1'))
    expect(response.body).toEqual([])
  })

  it('rejects a request missing org/rootOrg headers', async () => {
    const response = await agent().get('/multiple/do_1')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await withOrgHeaders(agent().get('/multiple/do_1'))
    expect(response.status).toBe(500)
  })
})

describe('GET /parents/:contentId', () => {
  it('returns minimal parent content', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({ result: { response: { parents: { level1: [contentItem()] } } } })
    )

    const response = await agent().get('/parents/do_1')

    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(1)
  })

  it('KNOWN ISSUE: an upstream failure is swallowed and returned as a 200 body', async () => {
    // getParentDetails catches its own error and RETURNS it rather than
    // re-throwing, so the route handler's try/catch never fires and the
    // client receives the Error object serialised as a 200 response instead
    // of an error status. Documented as current behaviour.
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent().get('/parents/do_1')

    expect(response.status).toBe(200)
  })
})

describe('GET /next/:contentId', () => {
  it('returns minimal content for the next items', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ result: { response: [contentItem()] } }))

    const response = await withOrgHeaders(agent().get('/next/do_1'))

    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(1)
  })

  it('rejects a request missing org/rootOrg headers', async () => {
    const response = await agent().get('/next/do_1')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withOrgHeaders(agent().get('/next/do_1'))
    expect(response.status).toBe(500)
  })
})

describe('POST /likeCount', () => {
  it('forwards the upstream response', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ count: 5 }))
    const response = await agent().post('/likeCount').send({ contentId: 'do_1' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ count: 5 })
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/likeCount').send({})
    expect(response.status).toBe(500)
  })
})

describe('POST /searchV5', () => {
  it('forwards the mapped search response', async () => {
    mockAxios.post.mockResolvedValue(
      upstreamOk({ result: { response: { result: [contentItem()] } } })
    )

    // The handler reads req.body.request.uuid, so `request` must be present.
    const response = await agent().post('/searchV5').send({ request: {} })

    expect(response.status).toBe(200)
    expect(response.body.result).toHaveLength(1)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/searchV5').send({ request: {} })
    expect(response.status).toBe(500)
  })
})

describe('POST /searchV6', () => {
  it('forwards the search response', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ results: [] }))
    const response = await agent().post('/searchV6').send({ query: 'x' })
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/searchV6').send({})
    expect(response.status).toBe(500)
  })
})

describe('POST /removeSubset', () => {
  it('forwards the response with the mapped body key', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ removed: true }))

    const response = await agent().post('/removeSubset').send({ contentIds: ['do_1'] })

    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      { goal_content_id: ['do_1'] },
      expect.anything()
    )
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/removeSubset').send({})
    expect(response.status).toBe(500)
  })
})

describe('GET /collection/:collectionType/:collectionId', () => {
  it('returns a playlist collection', async () => {
    mockGetPlaylist.mockResolvedValue({
      contents: [{ identifier: 'do_1' }],
      duration: 100,
      icon: 'icon.png',
      name: 'My Playlist',
    })
    mockAxiosCallable.mockResolvedValue(upstreamOk([contentItem()]))

    const response = await withOrgHeaders(agent().get('/collection/playlist/pl-1'))

    expect(response.status).toBe(200)
    expect(response.body.data.contentType).toBe('Playlist')
    expect(response.body.totalContents).toBe(1)
  })

  it('returns a goal collection with dummy content', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk([contentItem()]))

    const response = await withOrgHeaders(agent().get('/collection/goal/goal-1'))

    expect(response.status).toBe(200)
    expect(response.body.data.contentType).toBe('Goal')
  })

  it('rejects an unknown collection type', async () => {
    const response = await withOrgHeaders(agent().get('/collection/unknown/x'))
    expect(response.status).toBe(400)
    expect(response.body.error).toBe('ERROR_INVALID_COLLECTION_TYPE')
  })

  it('rejects a request missing org/rootOrg headers', async () => {
    const response = await agent().get('/collection/playlist/pl-1')
    expect(response.status).toBe(400)
  })

  it('returns 500 when the playlist lookup fails', async () => {
    mockGetPlaylist.mockRejectedValue(networkError())
    const response = await withOrgHeaders(agent().get('/collection/playlist/pl-1'))
    expect(response.status).toBe(500)
  })
})

describe('POST /:contentId', () => {
  it('returns processed content on a valid hierarchy fetch', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk(contentItem({ identifier: 'do_1' })))

    const response = await withOrgHeaders(agent().post('/do_1')).send({})

    expect(response.status).toBe(200)
    expect(response.body.identifier).toBe('do_1')
  })

  it('returns 500 when upstream sends content with no identifier', async () => {
    // getContentDetails throws 'NO_CONTENT' in this case; the route handler's
    // catch has no err.response, so it falls back to 500.
    mockAxiosCallable.mockResolvedValue(upstreamOk({}))

    const response = await withOrgHeaders(agent().post('/do_1')).send({})

    expect(response.status).toBe(500)
  })

  it('rejects a request missing org/rootOrg headers', async () => {
    const response = await agent().post('/do_1').send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await withOrgHeaders(agent().post('/do_1')).send({})
    expect(response.status).toBe(500)
  })
})

describe('GET /external-access/:id', () => {
  it('forwards the upstream response', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ access: true }))
    const response = await withOrgHeaders(agent().get('/external-access/do_1'))
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withOrgHeaders(agent().get('/external-access/do_1'))
    expect(response.status).toBe(500)
  })
})

describe('POST /:contentId/parent', () => {
  it('forwards the upstream response', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ linked: true }))
    const response = await withOrgHeaders(agent().post('/do_1/parent')).send({ parentId: 'do_0' })
    expect(response.status).toBe(200)
  })
})

describe('POST /kb/v3/reorder', () => {
  it('forwards the upstream response', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ reordered: true }))
    const response = await withOrgHeaders(agent().post('/kb/v3/reorder')).send({})
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withOrgHeaders(agent().post('/kb/v3/reorder')).send({})
    expect(response.status).toBe(500)
  })
})

describe('POST /kb/v2/:apiType', () => {
  it('forwards the upstream response', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ ok: true }))
    const response = await withOrgHeaders(agent().post('/kb/v2/publish')).send({})
    expect(response.status).toBe(200)
  })
})

describe('POST /kb/:updateType', () => {
  it('forwards the upstream response', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await withOrgHeaders(agent().post('/kb/status')).send({})
    expect(response.status).toBe(200)
  })
})

describe('POST /hierarchy/update', () => {
  it('forwards the upstream response', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await withOrgHeaders(agent().post('/hierarchy/update')).send({})
    expect(response.status).toBe(200)
  })
})

describe('POST /getWebModuleManifest', () => {
  it('forwards the upstream response', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ manifest: [] }))
    const response = await agent().post('/getWebModuleManifest').send({ url: 'https://x.test' })
    expect(response.status).toBe(200)
  })
})

describe('GET /getWebModuleFiles', () => {
  it('forwards the upstream response', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ files: [] }))
    const response = await agent().get('/getWebModuleFiles').query({ url: 'https://x.test' })
    expect(response.status).toBe(200)
  })
})
