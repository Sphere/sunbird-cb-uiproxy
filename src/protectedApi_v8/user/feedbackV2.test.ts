/**
 * PHASE 1 — user/feedbackV2.ts.
 *
 * Axios-proxy endpoints, each guarded by a rootOrg header check (except the
 * shared sendSentimentNeutralFeedback middleware used by /content-request and
 * /service-request, and the plain routes below — all of them check rootOrg).
 * Response shaping is either `res.send(response.data)` directly off the
 * awaited axios call, or `.then((r) => r.data)` chained onto the axios call —
 * both produce the same observable response body.
 *
 * NOTE — real routing bug found while reading the file (NOT reproduced as a
 * "missing return" hang; it's safe to exercise live because only one response
 * is ever sent). `GET /:feedbackId` is registered (line 220) BEFORE
 * `GET /categories` (line 277). Express matches GET routes in registration
 * order, and `/:feedbackId` matches the literal path `/categories` (with
 * feedbackId === 'categories'). So `GET /categories` is dead code — it can
 * never be reached; every request to it actually hits the `/:feedbackId`
 * handler instead and calls a completely different upstream URL
 * (`/feedback/categories?user_Id=...` instead of `/config`). See the
 * 'GET /categories (routing bug)' describe block below, which demonstrates
 * this against the real router.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: { FEEDBACK_API_BASE: 'https://feedback.test' },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { feedbackV2Api } from './feedbackV2'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(feedbackV2Api)
const withRootOrg = (req: ReturnType<typeof agent>) => req.set('rootOrg', 'r1')

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
  mockAxios.patch.mockReset()
})

describe('POST /platform', () => {
  it('submits platform feedback', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ submitted: true }))
    const response = await withRootOrg(agent().post('/platform')).send({
      text: 'great app',
      type: 'general',
      role: 'learner',
    })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ submitted: true })
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/platform').send({ text: 'x', type: 'general' })
    expect(response.status).toBe(400)
  })

  it('returns 500 on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().post('/platform')).send({ text: 'x', type: 'general' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })

  it('forwards the upstream status and body on an upstream error', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(422, { error: 'bad feedback' }))
    const response = await withRootOrg(agent().post('/platform')).send({ text: 'x', type: 'general' })
    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'bad feedback' })
  })

  it('includes optional rootFeedbackId and category when provided', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ submitted: true }))
    const response = await withRootOrg(agent().post('/platform')).send({
      text: 'reply',
      type: 'general',
      role: 'learner',
      rootFeedbackId: 'root-1',
      category: 'bug',
    })
    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ rootFeedbackId: 'root-1', category: 'bug' }),
      expect.anything()
    )
  })
})

describe('POST /content/:contentId', () => {
  it('submits content feedback', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ submitted: true }))
    const response = await withRootOrg(agent().post('/content/c1')).send({
      text: 'nice course',
      type: 'content',
      role: 'learner',
    })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ submitted: true })
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/content/c1').send({ text: 'x', type: 'content' })
    expect(response.status).toBe(400)
  })

  it('returns 500 on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().post('/content/c1')).send({ text: 'x', type: 'content' })
    expect(response.status).toBe(500)
  })

  it('includes optional rootFeedbackId and sentiment when provided', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ submitted: true }))
    const response = await withRootOrg(agent().post('/content/c1')).send({
      text: 'reply',
      type: 'content',
      role: 'learner',
      rootFeedbackId: 'root-1',
      sentiment: 'positive',
    })
    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ rootFeedbackId: 'root-1', sentiment: 'positive' }),
      expect.anything()
    )
  })
})

describe('POST /content-request', () => {
  it('submits a content request via the shared middleware', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ submitted: true }))
    const response = await withRootOrg(agent().post('/content-request')).send({
      text: 'please add X',
      type: 'content-request',
      role: 'learner',
    })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ submitted: true })
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/content-request').send({ text: 'x', type: 'content-request' })
    expect(response.status).toBe(400)
  })

  it('returns 500 on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().post('/content-request')).send({
      text: 'x',
      type: 'content-request',
    })
    expect(response.status).toBe(500)
  })

  it('includes optional rootFeedbackId and category when provided', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ submitted: true }))
    const response = await withRootOrg(agent().post('/content-request')).send({
      text: 'reply',
      type: 'content-request',
      role: 'learner',
      rootFeedbackId: 'root-1',
      category: 'bug',
    })
    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ rootFeedbackId: 'root-1', category: 'bug' }),
      expect.anything()
    )
  })
})

describe('POST /service-request', () => {
  it('submits a service request via the shared middleware', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ submitted: true }))
    const response = await withRootOrg(agent().post('/service-request')).send({
      text: 'please fix Y',
      type: 'service-request',
      role: 'learner',
    })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ submitted: true })
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/service-request').send({ text: 'x', type: 'service-request' })
    expect(response.status).toBe(400)
  })
})

describe('GET /feedback-summary', () => {
  it('returns the feedback summary for the current user', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ total: 5 }))
    const response = await withRootOrg(agent().get('/feedback-summary'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ total: 5 })
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/feedback-summary')
    expect(response.status).toBe(400)
  })

  it('returns 500 on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/feedback-summary'))
    expect(response.status).toBe(500)
  })
})

describe('POST /search', () => {
  it('returns search results', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([{ id: 'f1' }]))
    const response = await withRootOrg(agent().post('/search')).send({
      query: 'bug',
      filters: {},
      viewedBy: 'user-1',
      all: false,
      from: 0,
      size: 10,
    })
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'f1' }])
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/search').send({ query: 'bug' })
    expect(response.status).toBe(400)
  })

  it('returns 500 on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().post('/search')).send({ query: 'bug' })
    expect(response.status).toBe(500)
  })
})

describe('GET /:feedbackId', () => {
  it('returns the feedback thread', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'fb1', messages: [] }))
    const response = await withRootOrg(agent().get('/fb1'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'fb1', messages: [] })
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/fb1')
    expect(response.status).toBe(400)
  })

  it('returns 500 on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/fb1'))
    expect(response.status).toBe(500)
  })
})

describe('PATCH /:feedbackId', () => {
  it('updates the feedback status', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await withRootOrg(agent().patch('/fb1')).query({ category: 'bug' }).send({
      status: 'resolved',
    })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ updated: true })
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().patch('/fb1').send({ status: 'resolved' })
    expect(response.status).toBe(400)
  })

  it('returns 500 on a network failure', async () => {
    mockAxios.patch.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().patch('/fb1')).send({ status: 'resolved' })
    expect(response.status).toBe(500)
  })
})

describe('GET /categories (routing bug)', () => {
  // BUG (see file header): GET /:feedbackId is registered before GET
  // /categories, so this request is actually swallowed by the /:feedbackId
  // handler with feedbackId='categories'. It calls
  // `${FEEDBACK_API_BASE}/v1/feedback/categories?user_Id=user-1` — never the
  // intended `${FEEDBACK_API_BASE}/v1/config` endpoint. This is safe to
  // exercise live (exactly one response is sent), so we assert the actual
  // (buggy) behavior here rather than skipping it.
  it('is actually handled by the :feedbackId route, not the categories handler', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ notActuallyCategories: true }))
    const response = await withRootOrg(agent().get('/categories'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ notActuallyCategories: true })
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/feedback/categories?user_Id='),
      expect.anything()
    )
  })

  it('rejects a request missing rootOrg (via the shadowing :feedbackId route)', async () => {
    const response = await agent().get('/categories')
    expect(response.status).toBe(400)
  })
})
