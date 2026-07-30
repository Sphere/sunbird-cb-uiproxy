/**
 * playlist.ts — three routes (POST /search, POST /create, PUT /update), all
 * using the `axios.post`/`axios.put` form and sharing one validation +
 * try/catch shape:
 *   - missing req.body / req.body.request -> 400 MISSING_REQUEST_BODY
 *   - (create/update) missing req.body.request.playlist -> 400 MISSING_PLAYLIST_DATA
 *   - (update only) missing req.body.request.playlist.id -> 400 MISSING_PLAYLIST_ID
 *   - success -> forwards upstream status + body
 *   - upstream error (error.response present) -> forwards upstream status + body
 *   - transport failure (no error.response) -> 500 generic body
 *
 * Every validation branch and every catch branch does an early `return`, so
 * there is no double-send / zero-response risk. The catch guards
 * `error && error.response` before touching `error.response.*`, so a
 * transport failure with no `.response` safely falls through to the generic
 * 500 branch rather than throwing inside the catch itself.
 *
 * extractUserToken is mocked wholesale (like cohorts.test.ts does for
 * extractUserIdFromRequest) purely for isolation; the real implementation
 * (`req.kauth && req.kauth.grant.access_token.token`) is itself safe to call
 * with no kauth on the request, so this isn't working around a hazard.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractUserToken: jest.fn(() => 'user-token-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    KONG_API_BASE: 'https://kong.test/api',
    SB_API_KEY: 'test-sb-api-key',
  },
}))

import axios from 'axios'
import { playlistApi } from './playlist'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(playlistApi)

describe('POST /search', () => {
  const validBody = {
    request: {
      filters: { orgId: 'org-1' },
      limit: 10,
    },
  }

  it('returns 400 when the request body is missing the request wrapper', async () => {
    const response = await agent().post('/search').send({})

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Missing request body or request object',
      status: 'error',
    })
  })

  it('forwards the upstream status and body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ result: { count: 1, playlists: [{ id: 'p1' }] } }))

    const response = await agent().post('/search').send(validBody)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ result: { count: 1, playlists: [{ id: 'p1' }] } })
  })

  it('calls the configured Kong playlist search endpoint', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    await agent().post('/search').send(validBody)

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://kong.test/api/playlist/v1/search',
      validBody,
      expect.anything()
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent().post('/search').send(validBody)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/search').send(validBody)

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      message: 'Internal server error',
      status: 'error',
    })
  })
})

describe('POST /create', () => {
  const validBody = {
    request: {
      playlist: {
        dataSource: { payload: ['c1'], type: 'static' },
        playlistId: 'p1',
        scope: { orgId: 'org-1' },
      },
    },
  }

  it('returns 400 when the request body is missing the request wrapper', async () => {
    const response = await agent().post('/create').send({})

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Missing request body or request object',
      status: 'error',
    })
  })

  it('returns 400 when the playlist data is missing', async () => {
    const response = await agent().post('/create').send({ request: {} })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Missing playlist data in request',
      status: 'error',
    })
  })

  it('forwards the upstream status and body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ id: 'p1', status: 'created' }, 201))

    const response = await agent().post('/create').send(validBody)

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ id: 'p1', status: 'created' })
  })

  it('calls the configured Kong playlist create endpoint', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    await agent().post('/create').send(validBody)

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://kong.test/api/playlist/v1/create',
      validBody,
      expect.anything()
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(409, { error: 'conflict' }))

    const response = await agent().post('/create').send(validBody)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/create').send(validBody)

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      message: 'Internal server error',
      status: 'error',
    })
  })
})

describe('PUT /update', () => {
  const validBody = {
    request: {
      playlist: {
        dataSource: { payload: ['c1'], type: 'static' },
        id: 'uuid-1',
        playlistId: 'p1',
        scope: { orgId: 'org-1' },
      },
    },
  }

  it('returns 400 when the request body is missing the request wrapper', async () => {
    const response = await agent().put('/update').send({})

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Missing request body or request object',
      status: 'error',
    })
  })

  it('returns 400 when the playlist data is missing', async () => {
    const response = await agent().put('/update').send({ request: {} })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Missing playlist data in request',
      status: 'error',
    })
  })

  it('returns 400 when the playlist id is missing', async () => {
    const response = await agent()
      .put('/update')
      .send({ request: { playlist: { playlistId: 'p1' } } })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Missing playlist id for update',
      status: 'error',
    })
  })

  it('forwards the upstream status and body on success', async () => {
    mockAxios.put.mockResolvedValue(upstreamOk({ id: 'uuid-1', status: 'updated' }))

    const response = await agent().put('/update').send(validBody)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'uuid-1', status: 'updated' })
  })

  it('calls the configured Kong playlist update endpoint', async () => {
    mockAxios.put.mockResolvedValue(upstreamOk({}))

    await agent().put('/update').send(validBody)

    expect(mockAxios.put).toHaveBeenCalledWith(
      'https://kong.test/api/playlist/v1/update',
      validBody,
      expect.anything()
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.put.mockRejectedValue(upstreamError(422, { error: 'invalid' }))

    const response = await agent().put('/update').send(validBody)

    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'invalid' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.put.mockRejectedValue(networkError())

    const response = await agent().put('/update').send(validBody)

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      message: 'Internal server error',
      status: 'error',
    })
  })
})
