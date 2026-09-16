/**
 * PHASE 1 — user/history.ts.
 *
 * Three routes, all using the callable `axios({...})` form (not
 * axios.get/post), each guarded by an org+rootOrg header check with a
 * `return` after the 400 — no double-send risk. All three catch blocks use
 * the safe `err && err.response && err.response.status` guard, so they are
 * safe to exercise live for both upstream-error and network-error cases.
 *
 * GET /:contentId additionally delegates to the real `getContentDetails`
 * export from ../content (a different route file with its own heavy
 * dependencies), so that module is mocked wholesale here — these tests are
 * about the history route layer, not content.ts's own logic.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: { CONTINUE_LEARNING_API_BASE: 'https://continue.test' },
}))
jest.mock('../content', () => ({
  getContentDetails: jest.fn(),
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { getContentDetails } from '../content'
import { historyApi } from './history'

const mockAxios = axios as unknown as jest.Mock
const mockGetContentDetails = getContentDetails as jest.Mock
const agent = () => mountRouter(historyApi)
const withOrgHeaders = (req: ReturnType<typeof agent>) => req.set('org', 'o1').set('rootOrg', 'r1')

beforeEach(() => {
  mockAxios.mockReset()
  mockGetContentDetails.mockReset()
})

describe('GET /', () => {
  it('returns the shaped continue-learning list', async () => {
    mockAxios.mockResolvedValue(
      upstreamOk({
        pageState: 'next-page',
        results: [
          {
            appIcon: 'http://private-cdn.example.com/path/icon.png',
            artifactUrl: 'http://private-cdn.example.com/path/video.mp4',
            contentType: 'Course',
            resourceType: 'Learning',
          },
        ],
      })
    )
    const response = await withOrgHeaders(agent().get('/'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      contents: [
        {
          appIcon: '/apis/proxies/v8/path/icon.png',
          artifactUrl: '/apis/proxies/v8/path/video.mp4',
          contentType: 'Course',
          resourceType: 'Learning',
          displayContentType: 'Learning',
        },
      ],
      hasMore: true,
      pageState: 'next-page',
    })
  })

  it('returns an empty contents list when results is not an array', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))
    const response = await withOrgHeaders(agent().get('/'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ contents: [], hasMore: false })
  })

  it('rejects a request missing the org header', async () => {
    const response = await agent().get('/').set('rootOrg', 'r1')
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('rejects a request missing the rootOrg header', async () => {
    const response = await agent().get('/').set('org', 'o1')
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await withOrgHeaders(agent().get('/'))
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await withOrgHeaders(agent().get('/'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /:contentId', () => {
  it('merges continue-learning data with the content details', async () => {
    mockAxios.mockResolvedValue(
      upstreamOk({
        results: [
          {
            continueLearningData: {
              data: { progress: 50 },
              resourceId: 'res-1',
            },
          },
        ],
      })
    )
    mockGetContentDetails.mockResolvedValue({ identifier: 'res-1', name: 'Course 1' })
    const response = await withOrgHeaders(agent().get('/c1'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      identifier: 'res-1',
      name: 'Course 1',
      continueData: { progress: 50 },
    })
    expect(mockGetContentDetails).toHaveBeenCalledWith('res-1', 'r1', 'o1', 'user-1', 'minimal')
  })

  it('returns null when there is no continue-learning history for the content', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ results: [] }))
    const response = await withOrgHeaders(agent().get('/c1'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual(null)
    expect(mockGetContentDetails).not.toHaveBeenCalled()
  })

  it('rejects a request missing org/rootOrg headers', async () => {
    const response = await agent().get('/c1')
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await withOrgHeaders(agent().get('/c1'))
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await withOrgHeaders(agent().get('/c1'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /continue', () => {
  it('forwards the player continuity update', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ saved: true }))
    const response = await withOrgHeaders(agent().post('/continue')).send({ progress: 10 })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ saved: true })
  })

  it('rejects a request missing org/rootOrg headers', async () => {
    const response = await agent().post('/continue').send({ progress: 10 })
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.mockRejectedValue(upstreamError(409, { error: 'conflict' }))
    const response = await withOrgHeaders(agent().post('/continue')).send({ progress: 10 })
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await withOrgHeaders(agent().post('/continue')).send({ progress: 10 })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
