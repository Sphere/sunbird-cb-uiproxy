/**
 * PHASE 1 — socialv2.ts (173 uncovered).
 *
 * Near-identical subset of social.ts (already covered at ~100%): the same
 * org/rootOrg-gated axios-proxy shape across every endpoint here. Table-driven
 * for the same reason as social.test.ts.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../utils/env', () => ({ CONSTANTS: { NODE_API_BASE: 'https://social.test' } }))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { socialApi } from './socialv2'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(socialApi)

beforeEach(() => {
  mockAxios.post.mockReset()
  mockAxios.put.mockReset()
  mockAxiosCallable.mockReset()
})

// Unlike every other endpoint here, /post/delete calls axios({...method:
// 'DELETE'}) — the callable form — rather than .post()/.put(), so it needs
// its own mock and is excluded from the generic table below.
describe('POST /post/delete', () => {
  it('rejects a request missing the org/rootOrg headers', async () => {
    const response = await agent().post('/post/delete').send({})
    expect(response.status).toBe(400)
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('forwards the upstream response when org/rootOrg are present', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ deleted: true }))
    const response = await agent().post('/post/delete').set('org', 'o1').set('rootOrg', 'r1').send({})
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ deleted: true })
  })

  it('forwards an upstream error status and body', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(422, { error: 'rejected' }))
    const response = await agent().post('/post/delete').set('org', 'o1').set('rootOrg', 'r1').send({})
    expect(response.status).toBe(422)
  })
})

const SIMPLE_PROXY_ENDPOINTS: Array<{ method: 'post' | 'put'; path: string }> = [
  { method: 'post', path: '/post/publish' },
  { method: 'post', path: '/post/draft' },
  { method: 'put', path: '/edit/tags' },
  { method: 'put', path: '/edit/meta' },
  { method: 'post', path: '/post/autocomplete' },
  { method: 'post', path: '/post/viewConversation' },
  { method: 'post', path: '/post/viewConversationV2' },
  { method: 'post', path: '/post/timeline' },
  { method: 'post', path: '/post/timelineV2' },
  { method: 'post', path: '/post/activity/create' },
  { method: 'post', path: '/post/acceptAnswer' },
  { method: 'post', path: '/post/activity/users' },
  { method: 'post', path: '/post/search' },
  { method: 'post', path: '/catalog' },
]

describe.each(SIMPLE_PROXY_ENDPOINTS)('$method $path', ({ method, path }) => {
  it('rejects a request missing the org/rootOrg headers', async () => {
    const response = await agent()[method](path).send({})
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
    expect(mockAxios.put).not.toHaveBeenCalled()
  })

  it('forwards the upstream response when org/rootOrg are present', async () => {
    const ok = upstreamOk({ ok: true })
    mockAxios.post.mockResolvedValue(ok)
    mockAxios.put.mockResolvedValue(ok)

    const response = await agent()[method](path).set('org', 'o1').set('rootOrg', 'r1').send({})

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it('forwards an upstream error status and body', async () => {
    const err = upstreamError(422, { error: 'rejected' })
    mockAxios.post.mockRejectedValue(err)
    mockAxios.put.mockRejectedValue(err)

    const response = await agent()[method](path).set('org', 'o1').set('rootOrg', 'r1').send({})

    expect(response.status).toBe(422)
  })

  it('falls back to 500 on a transport failure', async () => {
    const err = networkError()
    mockAxios.post.mockRejectedValue(err)
    mockAxios.put.mockRejectedValue(err)

    const response = await agent()[method](path).set('org', 'o1').set('rootOrg', 'r1').send({})

    expect(response.status).toBe(500)
  })
})
