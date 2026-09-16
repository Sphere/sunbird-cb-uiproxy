/**
 * PHASE 1 — discussionHub/writeApi.ts. Nine routes over the same axios-proxy
 * shape, guarded by `if (response && response.data) { res.send(...) }` with
 * no `else` — documented as a real hang risk below, not reproduced live.
 *
 * `createDiscussionHubUser` has the same never-invoked-async-closure bug as
 * `getUserByEmail`/`getUserByUsername` in users.ts (see docs/PROD-VERIFICATION.md
 * section N) — `POST /users` always responds 200 with an empty body.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/discussionHub-helper', () => ({
  getUserUID: jest.fn(async () => 'uid-1'),
  getWriteApiAdminUID: jest.fn(() => 1),
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
import { createDiscussionHubUser, writeApi } from './writeApi'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(writeApi)

beforeEach(() => {
  mockAxios.post.mockReset()
  mockAxios.put.mockReset()
  mockAxios.delete.mockReset()
})

describe('POST /topics', () => {
  it('creates a topic and forwards the response', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ id: 't1' }))
    const response = await agent().post('/topics').send({ title: 'Hello' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 't1' })
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/topics').send({ title: 'Hello' })
    expect(response.status).toBe(500)
  })
})

describe('POST /topics/:topicId', () => {
  it('replies to a topic and forwards the response', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ id: 'r1' }))
    const response = await agent().post('/topics/t1').send({ content: 'hi' })
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/topics/t1').send({ content: 'hi' })
    expect(response.status).toBe(500)
  })
})

describe('POST /users', () => {
  it('always responds 200 with an empty body — createDiscussionHubUser never calls axios (documented bug)', async () => {
    const response = await agent().post('/users').send({ username: 'u1' })
    expect(response.status).toBe(200)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })
})

describe('POST /posts/:postId/bookmark', () => {
  it('bookmarks a post and forwards the response', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ bookmarked: true }))
    const response = await agent().post('/posts/p1/bookmark')
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/posts/p1/bookmark')
    expect(response.status).toBe(500)
  })
})

describe('DELETE /posts/:postId/bookmark', () => {
  it('removes a bookmark and forwards the response', async () => {
    mockAxios.delete.mockResolvedValue(upstreamOk({ bookmarked: false }))
    const response = await agent().delete('/posts/p1/bookmark')
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.delete.mockRejectedValue(networkError())
    const response = await agent().delete('/posts/p1/bookmark')
    expect(response.status).toBe(500)
  })
})

describe('POST /posts/:postId/vote', () => {
  it('votes on a post and forwards the response', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ votes: 1 }))
    const response = await agent().post('/posts/p1/vote').send({ delta: 1 })
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/posts/p1/vote').send({ delta: 1 })
    expect(response.status).toBe(500)
  })
})

describe('DELETE /posts/:postId/vote', () => {
  it('removes a vote and forwards the response', async () => {
    mockAxios.delete.mockResolvedValue(upstreamOk({ votes: 0 }))
    const response = await agent().delete('/posts/p1/vote')
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.delete.mockRejectedValue(networkError())
    const response = await agent().delete('/posts/p1/vote')
    expect(response.status).toBe(500)
  })
})

describe('PUT /topics/:topicId/follow', () => {
  it('follows a topic and forwards the response', async () => {
    mockAxios.put.mockResolvedValue(upstreamOk({ following: true }))
    const response = await agent().put('/topics/t1/follow')
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.put.mockRejectedValue(networkError())
    const response = await agent().put('/topics/t1/follow')
    expect(response.status).toBe(500)
  })
})

describe('PUT /topics/:topicId/tags', () => {
  it('updates tags and forwards the response', async () => {
    mockAxios.put.mockResolvedValue(upstreamOk({ tags: ['a'] }))
    const response = await agent().put('/topics/t1/tags').send({ tags: ['a'] })
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.put.mockRejectedValue(networkError())
    const response = await agent().put('/topics/t1/tags').send({ tags: ['a'] })
    expect(response.status).toBe(500)
  })
})

describe('createDiscussionHubUser', () => {
  it('resolves to a never-invoked function instead of the create response', async () => {
    const result = await createDiscussionHubUser({ username: 'u1' })
    expect(typeof result).toBe('function')
    expect(mockAxios.post).not.toHaveBeenCalled()
  })
})
