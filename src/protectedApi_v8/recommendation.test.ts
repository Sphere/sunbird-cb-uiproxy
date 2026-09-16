/**
 * PHASE 1 — recommendation.ts. Five routes over three axios call shapes:
 * the callable `axios({...})` form (/, /usageBased), `axios.get` (/interestBased,
 * /keyword's interest lookup, /:recommendationType), and `axios.post`
 * (/keyword's search call). `processContent`/`shuffleContent` are real, pure
 * helpers — used directly rather than mocked.
 *
 * Real bug found while reading /:recommendationType (documented in
 * docs/PROD-VERIFICATION.md, not exercised for its buggy value here):
 * `params.url += 'isExternal=false'` sets a bogus `params.url` query param
 * (`params` never had a `url` field) instead of appending to the request URL.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractUserEmailFromRequest: jest.fn(() => 'user@test.com'),
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    RECOMMENDATION_API_BASE: 'https://reco.test',
    SB_EXT_API_BASE: 'https://ext.test',
    SB_EXT_API_BASE_2: 'https://ext2.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { recommendationApi } from './recommendation'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(recommendationApi)

const contentResult = (items: object[]) => ({
  result: { response: { result: items } },
})

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

describe('GET /', () => {
  it('returns shuffled, processed content for an org', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk(contentResult([{ identifier: 'c1' }])))
    const response = await agent().get('/').set('org', 'o1').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(response.body.contents).toHaveLength(1)
    expect(response.body.hasMore).toBe(false)
  })

  it('rejects a request missing org/rootOrg', async () => {
    const response = await agent().get('/')
    expect(response.status).toBe(400)
  })

  it('applies filters from the query string', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk(contentResult([])))
    const filters = encodeURIComponent(JSON.stringify({ recommendationCategory: 'custom' }))
    const response = await agent().get(`/?filters=${filters}`).set('org', 'o1').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('type=custom') })
    )
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().get('/').set('org', 'o1').set('rootOrg', 'r1')
    expect(response.status).toBe(500)
  })

  it('falls back to empty contents when the upstream result shape is malformed', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: {} }))
    const response = await agent().get('/').set('org', 'o1').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ contents: [], hasMore: false })
  })
})

describe('GET /interestBased', () => {
  it('returns processed interest-based content', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk(contentResult([{ identifier: 'c1' }])))
    const response = await agent().get('/interestBased').set('org', 'o1').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(response.body.contents).toHaveLength(1)
  })

  it('rejects a request missing org/rootOrg', async () => {
    const response = await agent().get('/interestBased')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/interestBased').set('org', 'o1').set('rootOrg', 'r1')
    expect(response.status).toBe(500)
  })

  it('falls back to empty contents when the upstream result shape is malformed', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ result: {} }))
    const response = await agent().get('/interestBased').set('org', 'o1').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ contents: [], hasMore: false })
  })
})

describe('GET /keyword', () => {
  it('searches by the user interest keywords and returns processed content', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ user_interest: ['react', 'node'] }))
    mockAxios.post.mockResolvedValue(upstreamOk({ result: [{ identifier: 'c1' }] }))
    const response = await agent().get('/keyword').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(response.body.contents).toHaveLength(1)
  })

  it('still searches (with an empty query) when user_interest is an empty array', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ user_interest: [] }))
    mockAxios.post.mockResolvedValue(upstreamOk({ result: [{ identifier: 'c1' }] }))
    const response = await agent().get('/keyword').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ query: '' }),
      expect.anything()
    )
  })

  it('returns empty content when user_interest is missing entirely', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({}))
    const response = await agent().get('/keyword').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(response.body.contents).toEqual([])
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/keyword').set('rootOrg', 'r1')
    expect(response.status).toBe(500)
  })
})

describe('GET /usageBased', () => {
  it('returns processed usage-based content', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: { response: [{ identifier: 'c1' }] } }))
    const response = await agent().get('/usageBased').set('org', 'o1').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(response.body.contents).toHaveLength(1)
  })

  it('rejects a request missing org/rootOrg', async () => {
    const response = await agent().get('/usageBased')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().get('/usageBased').set('org', 'o1').set('rootOrg', 'r1')
    expect(response.status).toBe(500)
  })
})

describe('GET /:recommendationType', () => {
  it('returns processed content for an arbitrary recommendation type', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ result: { response: [{ identifier: 'c1' }] } }))
    const response = await agent().get('/trending').set('org', 'o1').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(response.body.contents).toHaveLength(1)
  })

  it('rejects a request missing org/rootOrg', async () => {
    const response = await agent().get('/trending')
    expect(response.status).toBe(400)
  })

  it('applies the iGOT exclusion list for "latest" on the iGOT org', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ result: { response: [] } }))
    const response = await agent().get('/latest').set('org', 'iGOT Ltd').set('rootOrg', 'iGOT')
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ params: expect.objectContaining({ learningMode: 'Self-Paced' }) })
    )
  })

  it('honours an explicit excludeContentType for "latest" on a non-iGOT org', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ result: { response: [] } }))
    const response = await agent()
      .get('/latest?excludeContentType=Course')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ params: expect.objectContaining({ excludeContentType: 'Course' }) })
    )
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/trending').set('org', 'o1').set('rootOrg', 'r1')
    expect(response.status).toBe(500)
  })
})
