/**
 * PHASE 2 — khub.ts. Six routes, uniform axios-proxy shape, every send()
 * returns immediately — no double-send risk anywhere in this file.
 */

jest.mock('axios')
jest.mock('../utils/env', () => ({
  CONSTANTS: { KHUB_SEARCH_BASE: 'https://khub.test' },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { knowledgeHubApi } from './khub'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(knowledgeHubApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

describe('GET /fetchRelatedResources/:contentId/:contentType', () => {
  it('forwards related resources', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ result: { response: { status: 200, items: [] } } }))
    const response = await agent()
      .get('/fetchRelatedResources/c1/Course')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
    expect(response.status).toBe(200)
  })

  it('rejects a request missing org/rootOrg', async () => {
    const response = await agent().get('/fetchRelatedResources/c1/Course')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent()
      .get('/fetchRelatedResources/c1/Course')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
    expect(response.status).toBe(500)
  })
})

describe('GET /home/', () => {
  it('forwards the search-home results', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ items: [] }))
    const response = await agent().get('/home/?size=10')
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/home/')
    expect(response.status).toBe(500)
  })
})

describe('GET /search/:query/:from/:size/:category', () => {
  it('forwards search results', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ items: [] }))
    const response = await agent().get('/search/react/0/10/course')
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/search/react/0/10/course')
    expect(response.status).toBe(500)
  })
})

describe('GET /item/:id', () => {
  it('forwards a single item lookup', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'i1' }))
    const response = await agent().get('/item/i1')
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/item/i1')
    expect(response.status).toBe(500)
  })
})

describe('GET /moreLike/:category/:itemId/:source', () => {
  it('forwards more-like-this results', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ items: [] }))
    const response = await agent().get('/moreLike/course/i1/khub')
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/moreLike/course/i1/khub')
    expect(response.status).toBe(500)
  })
})

describe('POST /topic', () => {
  it('forwards a topic add/delete request', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ ok: true }))
    const response = await agent().post('/topic').send({ topic: 't1' })
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/topic').send({ topic: 't1' })
    expect(response.status).toBe(500)
  })
})
