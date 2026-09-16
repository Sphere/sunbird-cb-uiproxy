/**
 * PHASE 1 — user/share.ts.
 *
 * Three routes:
 *  - POST /: axios.post to CONSTANTS.SB_EXT_API_BASE + '/v1/Notification/Send'.
 *    Standard try/catch, single response either way. Safe to test live.
 *  - POST /content: org/rootOrg header validation (400 on missing), then
 *    either forwards the body as-is (default) or reshapes it into a
 *    Ford-specific payload when rootOrg === 'Ford', via the callable
 *    `axios({...})` form. The Ford branch reads deeply nested fields off
 *    req.body (`data['target-data'].identifier`, etc.) with no guards, but
 *    that access happens INSIDE the route's own try block, so a malformed
 *    body throws synchronously and is caught by the same catch — a single
 *    500 response, no double-send/hang risk. Safe to test live including the
 *    malformed-body case.
 *  - GET /shared: rootOrg header validation (400 on missing), then the
 *    callable `axios({...})` GET form; response.data.shareDetails is mapped
 *    through the real processContent() (not mocked, matching the convention
 *    in content.test.ts) when it is an array, else contents defaults to [].
 *    catch always resolves to a single res.status(500).json(error) — no
 *    double-send risk.
 *
 * All three catch blocks are reached by exactly one response send, so every
 * success/failure branch below is exercised live per the safety process; no
 * skipped tests were needed for this file.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    NOTIFICATIONS_API_BASE: 'https://notifications.test',
    SB_EXT_API_BASE: 'https://sbext.test',
    SB_EXT_API_BASE_2: 'https://sbext2.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { shareApi } from './share'

const mockAxiosMethods = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(shareApi)

beforeEach(() => {
  mockAxiosMethods.post.mockReset()
  mockAxiosCallable.mockReset()
})

describe('POST /', () => {
  it('shares and returns the upstream result payload', async () => {
    mockAxiosMethods.post.mockResolvedValue(upstreamOk({ result: { shared: true } }))
    const response = await agent().post('/').send({ recipients: ['u2'] })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ shared: true })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxiosMethods.post.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await agent().post('/').send({})
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('returns 500 on a network failure with no upstream response', async () => {
    mockAxiosMethods.post.mockRejectedValue(networkError())
    const response = await agent().post('/').send({})
    expect(response.status).toBe(500)
  })
})

describe('POST /content', () => {
  const withOrg = (req: ReturnType<typeof agent>) =>
    req.set('org', 'o1').set('rootOrg', 'r1').set('locale', 'en')

  it('forwards the body as-is for a non-Ford rootOrg', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ notified: true }))
    const response = await withOrg(agent().post('/content')).send({ some: 'payload' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ notified: true })
  })

  it('rejects a request missing the org header', async () => {
    const response = await agent().post('/content').set('rootOrg', 'r1').send({})
    expect(response.status).toBe(400)
  })

  it('rejects a request missing the rootOrg header', async () => {
    const response = await agent().post('/content').set('org', 'o1').send({})
    expect(response.status).toBe(400)
  })

  it('reshapes the body into the Ford-specific payload when rootOrg is Ford', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ notified: true }))
    const response = await agent()
      .post('/content')
      .set('org', 'o1')
      .set('rootOrg', 'Ford')
      .set('wid', 'actor-1')
      .send({
        'recipients': { sharedWith: ['u2'] },
        'tag-value-pair': { '#message': 'hello', '#targetUrl': 'https://x.test' },
        'target-data': { identifier: 'c1' },
      })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ notified: true })
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content_id: 'c1',
          share_message: 'hello',
          shared_by: 'user-1',
          shared_with: ['u2'],
          targetUrl: 'https://x.test',
        }),
        method: 'POST',
        url: 'https://sbext2.test/v1/content-share',
      })
    )
  })

  // rootOrg === 'Ford' with a body missing the expected nested shape throws
  // synchronously while building the reshaped payload (e.g.
  // data['target-data'].identifier on an undefined 'target-data'). That
  // throw happens inside this route's own try block, so it's caught by the
  // same catch and produces exactly one response — safe to exercise live.
  it('returns 500 when a Ford-shaped body is missing the expected nested fields', async () => {
    const response = await agent()
      .post('/content')
      .set('org', 'o1')
      .set('rootOrg', 'Ford')
      .send({})
    expect(response.status).toBe(500)
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(409, { error: 'conflict' }))
    const response = await withOrg(agent().post('/content')).send({ some: 'payload' })
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('returns 500 on a network failure with no upstream response', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/content')).send({ some: 'payload' })
    expect(response.status).toBe(500)
  })
})

describe('GET /shared', () => {
  it('returns processed shared contents on success', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({
        shareDetails: [
          {
            appIcon: 'http://private-abc.internal/icon.png',
            children: [],
            identifier: 'c1',
          },
        ],
      })
    )
    const response = await agent()
      .get('/shared')
      .set('rootOrg', 'r1')
      .query({ page: 1, size: 10 })
    expect(response.status).toBe(200)
    expect(response.body.hasMore).toBe(false)
    expect(response.body.contents).toHaveLength(1)
    // processContent() ran: the private-host prefix is rewritten.
    expect(response.body.contents[0].appIcon).toBe('/apis/proxies/v8/icon.png')
  })

  it('returns an empty contents list when shareDetails is missing', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({}))
    const response = await agent().get('/shared').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ contents: [], hasMore: false })
  })

  it('returns an empty contents list when shareDetails is not an array', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ shareDetails: 'not-an-array' }))
    const response = await agent().get('/shared').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ contents: [], hasMore: false })
  })

  it('rejects a request missing the rootOrg header', async () => {
    const response = await agent().get('/shared')
    expect(response.status).toBe(400)
  })

  it('responds 500 with the raw error body on an upstream failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().get('/shared').set('rootOrg', 'r1')
    expect(response.status).toBe(500)
  })
})
