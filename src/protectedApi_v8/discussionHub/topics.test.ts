/**
 * PHASE 1 — discussionHub/topics.ts. Six GET routes, all axios.get proxies
 * wrapped in try/catch with the standard `res.status(err.response.status ||
 * 500).send(err.response.data || {})` failure shape.
 *
 * Unlike the sibling files in this directory (users.ts, writeApi.ts), no
 * `return async () => {...}` never-invoked-closure bug and no un-`else`'d
 * `if (response && response.data)` hang risk were found here — every route
 * has a real try/catch and a single unconditional `res.send(response.data)`
 * on the success path. No live-test-unsafe patterns identified.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../authoring/utils/header', () => ({
  getRootOrg: jest.fn(() => 'root-org'),
}))
jest.mock('../../utils/discussionHub-helper', () => ({
  getUserUID: jest.fn(async () => 'uid-1'),
  getWriteApiToken: jest.fn(() => 'write-api-token'),
}))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    DISCUSSION_CATEGORY_LIST: 'cid%5B%5D=1',
    DISCUSSION_HUB_API_BASE: 'https://discussion.test',
  },
}))

import axios from 'axios'
import { getUserUID } from '../../utils/discussionHub-helper'
import { CONSTANTS } from '../../utils/env'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { topicsApi } from './topics'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockGetUserUID = getUserUID as jest.MockedFunction<typeof getUserUID>
const agent = () => mountRouter(topicsApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockGetUserUID.mockReset()
  mockGetUserUID.mockResolvedValue('uid-1')
})

describe('GET /recent', () => {
  it('proxies with default page and appends the category list', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ topics: ['a'] }))
    const response = await agent().get('/recent')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ topics: ['a'] })
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/recent?page=1&cid%5B%5D=1'),
      expect.objectContaining({ headers: { rootOrg: 'root-org' } })
    )
  })

  it('forwards the page query param', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ topics: [] }))
    const response = await agent().get('/recent?page=3')
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/recent?page=3'),
      expect.anything()
    )
  })

  it('omits the category list segment when not configured', async () => {
    const original = CONSTANTS.DISCUSSION_CATEGORY_LIST
    // tslint:disable-next-line: no-any
    ;(CONSTANTS as any).DISCUSSION_CATEGORY_LIST = ''
    mockAxios.get.mockResolvedValue(upstreamOk({ topics: [] }))
    const response = await agent().get('/recent')
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/recent?page=1',
      expect.anything()
    )
    // tslint:disable-next-line: no-any
    ;(CONSTANTS as any).DISCUSSION_CATEGORY_LIST = original
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/recent')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('returns 500 on a network failure with no upstream response', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/recent')
    expect(response.status).toBe(500)
  })
})

describe('GET /top', () => {
  it('proxies the request', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ topics: ['top1'] }))
    const response = await agent().get('/top')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ topics: ['top1'] })
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/top',
      expect.objectContaining({ headers: { rootOrg: 'root-org' } })
    )
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/top')
    expect(response.status).toBe(500)
  })
})

describe('GET /popular', () => {
  it('proxies with default page', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ topics: ['p1'] }))
    const response = await agent().get('/popular')
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/popular?page=1',
      expect.anything()
    )
  })

  it('forwards the page query param', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ topics: [] }))
    const response = await agent().get('/popular?page=2')
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/popular?page=2',
      expect.anything()
    )
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/popular')
    expect(response.status).toBe(500)
  })
})

describe('GET /unread', () => {
  it('resolves the user uid then proxies with the auth token', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ count: 3 }))
    const response = await agent().get('/unread')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ count: 3 })
    expect(mockGetUserUID).toHaveBeenCalledWith('user-1')
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/unread?_uid=uid-1',
      expect.objectContaining({ headers: { authorization: 'write-api-token' } })
    )
  })

  it('returns 500 when the upstream call fails', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/unread')
    expect(response.status).toBe(500)
  })

  it('returns 500 when resolving the user uid itself fails', async () => {
    mockGetUserUID.mockRejectedValue(new Error('uid lookup failed'))
    const response = await agent().get('/unread')
    expect(response.status).toBe(500)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })
})

describe('GET /unread/total', () => {
  it('resolves the user uid then proxies with the auth token', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ total: 7 }))
    const response = await agent().get('/unread/total')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ total: 7 })
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/unread/total?_uid=uid-1',
      expect.objectContaining({ headers: { authorization: 'write-api-token' } })
    )
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/unread/total')
    expect(response.status).toBe(500)
  })
})

describe('GET /:tid', () => {
  it('proxies with default page, empty sort and the resolved uid', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 't1' }))
    const response = await agent().get('/t1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 't1' })
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/topic/t1?page=1&_uid=uid-1&sort=',
      expect.objectContaining({ headers: { authorization: 'write-api-token' } })
    )
  })

  it('forwards page and sort query params', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 't1' }))
    const response = await agent().get('/t1?page=2&sort=oldest')
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/topic/t1?page=2&_uid=uid-1&sort=oldest',
      expect.anything()
    )
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/t1')
    expect(response.status).toBe(500)
  })

  it('does not shadow the literal /recent, /top, /popular, /unread routes', async () => {
    // Sanity check on route registration order: the param route is
    // registered last in topics.ts, so literal-path routes above still win.
    mockAxios.get.mockResolvedValue(upstreamOk({ topics: [] }))
    const response = await agent().get('/recent')
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/recent'),
      expect.anything()
    )
    expect(response.status).toBe(200)
  })
})
