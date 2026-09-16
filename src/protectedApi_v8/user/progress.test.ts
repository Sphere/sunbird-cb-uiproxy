/**
 * PHASE 1 — user/progress.ts.
 *
 * Three routes: GET /:contentId (uses extractUserIdFromRequest, axios.get),
 * GET / (org/rootOrg header validation, callable axios({...}) form, uses
 * extractUserId), POST / (same validation, axios.post, uses extractUserId).
 * All three wrap their single axios call in a try/catch with a single
 * response on every path (the org/rootOrg validation branch returns
 * immediately after res.status(400).send(...)), so every path here is safe
 * to exercise live.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({
  logError: jest.fn(),
  logErrorHeading: jest.fn(),
  logInfo: jest.fn(),
}))
jest.mock('../../utils/requestExtract', () => ({
  extractUserId: jest.fn(() => 'user-1'),
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    LEARNING_HISTORY_API_BASE: 'https://learning-history.test',
    PROGRESS_API_BASE: 'https://progress.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { progressApi } from './progress'

const mockAxiosMethods = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(progressApi)
const withOrg = (req: ReturnType<typeof agent>) => req.set('org', 'o1').set('rootOrg', 'r1')

beforeEach(() => {
  mockAxiosMethods.get.mockReset()
  mockAxiosMethods.post.mockReset()
  mockAxiosCallable.mockReset()
})

describe('GET /:contentId', () => {
  it('returns the upstream progress-meta data', async () => {
    mockAxiosMethods.get.mockResolvedValue(upstreamOk({ progress: 42 }))
    const response = await agent().get('/c1').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ progress: 42 })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxiosMethods.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await agent().get('/c1')
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('returns 500 with the generic error body on a network failure', async () => {
    mockAxiosMethods.get.mockRejectedValue(networkError())
    const response = await agent().get('/c1')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /', () => {
  it('rejects a request missing both org and rootOrg', async () => {
    const response = await agent().get('/')
    expect(response.status).toBe(400)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/').set('org', 'o1')
    expect(response.status).toBe(400)
  })

  it('rejects a request missing org', async () => {
    const response = await agent().get('/').set('rootOrg', 'r1')
    expect(response.status).toBe(400)
  })

  it('returns the upstream progress hash', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ hash: 'abc' }))
    const response = await withOrg(agent().get('/'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ hash: 'abc' })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await withOrg(agent().get('/'))
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('returns 500 with the generic error body on a network failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /', () => {
  it('rejects a request missing both org and rootOrg', async () => {
    const response = await agent().post('/').send({})
    expect(response.status).toBe(400)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/').set('org', 'o1').send({})
    expect(response.status).toBe(400)
  })

  it('forwards the created progress hash', async () => {
    mockAxiosMethods.post.mockResolvedValue(upstreamOk({ updated: true }, 200))
    const response = await withOrg(agent().post('/')).send({ contentId: 'c1', progress: 1 })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ updated: true })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxiosMethods.post.mockRejectedValue(upstreamError(409, { error: 'conflict' }))
    const response = await withOrg(agent().post('/')).send({})
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('returns 500 with the generic error body on a network failure', async () => {
    mockAxiosMethods.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/')).send({})
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
