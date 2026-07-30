/**
 * PHASE 1 — user/topics.ts.
 *
 * Eight routes, all axios.get/post/patch/delete proxy endpoints (no callable
 * axios({...}) form). Every route has a try/catch wrapping a single awaited
 * axios call, so no double-send / zero-response / unhandled-rejection risk
 * was found — see individual describe blocks for the response-shaping
 * details each route branches on:
 *
 *  - GET /            only sends response.data.result.response.topics when
 *                      present; otherwise falls through to a 500 with the
 *                      raw upstream body (not an error — same try block).
 *  - POST /           plain pass-through, merges userId into the body.
 *  - GET /v2           userId comes from req.query.wid (a plain property
 *                      read, not a function call) OR extractUserIdFromRequest;
 *                      sends user_interest when it's an array, else 200 [].
 *  - DELETE /          validates rootOrg header before calling upstream.
 *  - PATCH /addMultiple, PATCH /   identical shape, just different endpoints.
 *  - GET /suggested, GET /autocomplete   read-only proxies, no validation
 *                      branch, single response.data passthrough.
 */

jest.mock('axios')
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    INTEREST_API_BASE: 'https://interest.test',
    SB_EXT_API_BASE: 'https://sbext.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { topicsApi } from './topics'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(topicsApi)
const withRootOrg = (req: ReturnType<typeof agent>) => req.set('rootOrg', 'r1')

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
  mockAxios.patch.mockReset()
  mockAxios.delete.mockReset()
})

describe('GET /', () => {
  it('returns the topics when present in the nested response shape', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({ result: { response: { topics: [{ id: 't1' }] } } })
    )
    const response = await agent().get('/')
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 't1' }])
  })

  it('returns 500 with the raw upstream body when topics are missing', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ result: {} }))
    const response = await agent().get('/')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ result: {} })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await agent().get('/')
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /', () => {
  it('adds the topic and forwards the upstream data', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ added: true }))
    const response = await agent().post('/').send({ topic: 'math' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ added: true })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(400, { error: 'bad request' }))
    const response = await agent().post('/').send({ topic: 'math' })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad request' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/').send({ topic: 'math' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /v2', () => {
  it('returns the user_interest array when present', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ user_interest: [{ id: 'i1' }] }))
    const response = await agent().get('/v2')
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'i1' }])
  })

  it('uses req.query.wid over the session-derived user id when provided', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ user_interest: [] }))
    const response = await agent().get('/v2').query({ wid: 'explicit-user' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it('returns 200 [] when user_interest is not an array', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ user_interest: undefined }))
    const response = await agent().get('/v2')
    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await agent().get('/v2')
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/v2')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('DELETE /', () => {
  it('deletes the interests and forwards the upstream status and body', async () => {
    mockAxios.delete.mockResolvedValue(upstreamOk({ deleted: true }, 200))
    const response = await withRootOrg(agent().delete('/')).send({ ids: ['t1'] })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ deleted: true })
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().delete('/').send({ ids: ['t1'] })
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.delete.mockRejectedValue(upstreamError(403, { error: 'forbidden' }))
    const response = await withRootOrg(agent().delete('/')).send({ ids: ['t1'] })
    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'forbidden' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.delete.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().delete('/')).send({ ids: ['t1'] })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('PATCH /addMultiple', () => {
  it('adds multiple interests and forwards the upstream data', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ added: 2 }))
    const response = await withRootOrg(agent().patch('/addMultiple')).send({ ids: ['t1', 't2'] })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ added: 2 })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.patch.mockRejectedValue(upstreamError(409, { error: 'conflict' }))
    const response = await withRootOrg(agent().patch('/addMultiple')).send({ ids: ['t1'] })
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.patch.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().patch('/addMultiple')).send({ ids: ['t1'] })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('PATCH /', () => {
  it('modifies the interests and forwards the upstream data', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ modified: true }))
    const response = await withRootOrg(agent().patch('/')).send({ ids: ['t1'] })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ modified: true })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.patch.mockRejectedValue(upstreamError(400, { error: 'bad request' }))
    const response = await withRootOrg(agent().patch('/')).send({ ids: ['t1'] })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad request' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.patch.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().patch('/')).send({ ids: ['t1'] })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /suggested', () => {
  it('returns the suggested interests', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ suggested: [{ id: 's1' }] }))
    const response = await agent()
      .get('/suggested')
      .set('rootOrg', 'r1')
      .set('org', 'o1')
      .set('locale', 'en')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ suggested: [{ id: 's1' }] })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await agent().get('/suggested')
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/suggested')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /autocomplete', () => {
  it('returns the autocomplete suggestions for the given query', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'a1' }]))
    const response = await agent().get('/autocomplete').query({ query: 'mat' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'a1' }])
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await agent().get('/autocomplete').query({ query: 'mat' })
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/autocomplete').query({ query: 'mat' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
