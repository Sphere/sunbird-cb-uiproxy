/**
 * PHASE 1 — social.ts is unusually uniform: 24 of its 25 endpoints share ONE
 * shape (require `org`/`rootOrg` headers -> 400 if missing, forward req.body
 * to a fixed upstream URL, forward the upstream status/body back, or forward
 * the upstream error). Table-driven rather than one hand-written block per
 * endpoint, since duplicating the same four assertions 24 times would obscure
 * the one endpoint that is actually different.
 *
 * /post/upload/:contentId is the exception — it uses form-data's callback-style
 * `.submit()`, not axios, and is tested separately below the table.
 */

jest.mock('axios')
jest.mock('form-data')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: { NODE_API_BASE: 'https://social.test', SOCIAL_TIMEOUT: '9999' },
}))

import axios from 'axios'
import FormData from 'form-data'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { socialApi } from './social'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(socialApi)

beforeEach(() => {
  mockAxios.post.mockReset()
  mockAxios.put.mockReset()
  mockAxios.delete.mockReset()
  mockAxiosCallable.mockReset()
})

/** Every endpoint sharing the org/rootOrg-gated proxy shape. */
const SIMPLE_PROXY_ENDPOINTS: Array<{ method: 'post' | 'put'; path: string }> = [
  { method: 'post', path: '/post/publish' },
  { method: 'post', path: '/post/draft' },
  { method: 'put', path: '/edit/tags' },
  { method: 'put', path: '/edit/meta' },
  { method: 'post', path: '/post/delete' },
  { method: 'post', path: '/post/autocomplete' },
  { method: 'post', path: '/post/viewConversation' },
  { method: 'post', path: '/post/viewConversationV2' },
  { method: 'post', path: '/post/timeline' },
  { method: 'post', path: '/post/timelineV2' },
  { method: 'post', path: '/moderator/moderatepost' },
  { method: 'post', path: '/moderator/timeline' },
  { method: 'post', path: '/admin/timeline' },
  { method: 'post', path: '/admin/deletePost' },
  { method: 'post', path: '/admin/reactivatePost' },
  { method: 'post', path: '/viewForum' },
  { method: 'post', path: '/forum/forumtimeline' },
  { method: 'post', path: '/post/activity/create' },
  { method: 'post', path: '/createForum' },
  { method: 'post', path: '/editForum' },
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
    expect(mockAxios.delete).not.toHaveBeenCalled()
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('forwards the upstream response when org/rootOrg are present', async () => {
    const ok = upstreamOk({ ok: true })
    mockAxios.post.mockResolvedValue(ok)
    mockAxios.put.mockResolvedValue(ok)
    mockAxios.delete.mockResolvedValue(ok)
    mockAxiosCallable.mockResolvedValue(ok)

    const response = await agent()[method](path).set('org', 'o1').set('rootOrg', 'r1').send({})

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it('forwards an upstream error status and body', async () => {
    const err = upstreamError(422, { error: 'rejected' })
    mockAxios.post.mockRejectedValue(err)
    mockAxios.put.mockRejectedValue(err)
    mockAxios.delete.mockRejectedValue(err)
    mockAxiosCallable.mockRejectedValue(err)

    const response = await agent()[method](path).set('org', 'o1').set('rootOrg', 'r1').send({})

    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'rejected' })
  })

  it('falls back to 500 on a transport failure', async () => {
    const err = networkError()
    mockAxios.post.mockRejectedValue(err)
    mockAxios.put.mockRejectedValue(err)
    mockAxios.delete.mockRejectedValue(err)
    mockAxiosCallable.mockRejectedValue(err)

    const response = await agent()[method](path).set('org', 'o1').set('rootOrg', 'r1').send({})

    expect(response.status).toBe(500)
  })
})

/**
 * @description CHANGE 33 introduced a single shared proxySocialRoute
 * function behind the table above, parameterized by method/url/
 * extraFields/timeout/label. The table only proves the response shape is
 * unchanged; these tests prove the REQUEST each route builds is unchanged
 * too — the exact extra field key/value each route merges in, which
 * routes set a timeout and which don't, which 2 routes use DELETE, and
 * which 2 routes log with their own label on failure.
 */
describe('proxySocialRoute per-route request construction (CHANGE 33)', () => {
  beforeEach(() => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ ok: true }))
  })

  it('/catalog merges the lowercase `userid` key, not `userId`', async () => {
    await agent().post('/catalog').set('org', 'o1').set('rootOrg', 'r1').send({})

    const callArgs = mockAxiosCallable.mock.calls[0][0]
    expect(callArgs.data.userid).toBe('user-1')
    expect(callArgs.data.userId).toBeUndefined()
    expect(callArgs.url).toBe('https://social.test/catalog/fetch')
    expect(callArgs.method).toBe('POST')
  })

  it('/moderator/moderatepost merges moderatorId', async () => {
    await agent().post('/moderator/moderatepost').set('org', 'o1').set('rootOrg', 'r1').send({})

    expect(mockAxiosCallable.mock.calls[0][0].data.moderatorId).toBe('user-1')
  })

  it('/admin/deletePost merges adminId, calls DELETE, and does not apply the SOCIAL_TIMEOUT override', async () => {
    await agent().post('/admin/deletePost').set('org', 'o1').set('rootOrg', 'r1').send({})

    const callArgs = mockAxiosCallable.mock.calls[0][0]
    expect(callArgs.data.adminId).toBe('user-1')
    expect(callArgs.method).toBe('DELETE')
    // axiosRequestConfig's own default timeout applies; SOCIAL_TIMEOUT (9999) does not override it here
    expect(callArgs.timeout).not.toBe(9999)
  })

  it('/admin/reactivatePost merges adminId and sets the SOCIAL_TIMEOUT timeout', async () => {
    await agent().post('/admin/reactivatePost').set('org', 'o1').set('rootOrg', 'r1').send({})

    const callArgs = mockAxiosCallable.mock.calls[0][0]
    expect(callArgs.data.adminId).toBe('user-1')
    expect(callArgs.timeout).toBe(9999)
  })

  it('/createForum merges forumCreator', async () => {
    await agent().post('/createForum').set('org', 'o1').set('rootOrg', 'r1').send({})

    expect(mockAxiosCallable.mock.calls[0][0].data.forumCreator).toBe('user-1')
  })

  it('/editForum merges forumEditor', async () => {
    await agent().post('/editForum').set('org', 'o1').set('rootOrg', 'r1').send({})

    expect(mockAxiosCallable.mock.calls[0][0].data.forumEditor).toBe('user-1')
  })

  it('/post/timelineV2 uses query.wid when present, ignoring extractUserIdFromRequest', async () => {
    await agent()
      .post('/post/timelineV2')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
      .query({ wid: 'wid-from-query' })
      .send({})

    expect(mockAxiosCallable.mock.calls[0][0].data.userId).toBe('wid-from-query')
  })

  it('/post/timelineV2 falls back to extractUserIdFromRequest when query.wid is absent', async () => {
    await agent().post('/post/timelineV2').set('org', 'o1').set('rootOrg', 'r1').send({})

    expect(mockAxiosCallable.mock.calls[0][0].data.userId).toBe('user-1')
  })

  it('/post/timeline sets the SOCIAL_TIMEOUT timeout with no extra field', async () => {
    await agent().post('/post/timeline').set('org', 'o1').set('rootOrg', 'r1').send({})

    const callArgs = mockAxiosCallable.mock.calls[0][0]
    expect(callArgs.timeout).toBe(9999)
    expect(callArgs.data.userId).toBeUndefined()
  })

  it('/post/publish does not apply the SOCIAL_TIMEOUT override and merges no extra field', async () => {
    await agent().post('/post/publish').set('org', 'o1').set('rootOrg', 'r1').send({})

    const callArgs = mockAxiosCallable.mock.calls[0][0]
    expect(callArgs.timeout).not.toBe(9999)
    expect(Object.keys(callArgs.data).sort()).toEqual(['org', 'rootOrg'])
  })

  it('/edit/meta logs with its own label on failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const { logError } = jest.requireMock('../utils/logger')
    logError.mockClear()

    await agent().put('/edit/meta').set('org', 'o1').set('rootOrg', 'r1').send({})

    expect(logError).toHaveBeenCalledWith('EDIT META ERROR >', expect.anything())
  })

  it('/post/delete logs with its own label on failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const { logError } = jest.requireMock('../utils/logger')
    logError.mockClear()

    await agent().post('/post/delete').set('org', 'o1').set('rootOrg', 'r1').send({})

    expect(logError).toHaveBeenCalledWith('ERROR DELETING POST', expect.anything())
  })

  it('/post/publish does not log on failure (no label)', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const { logError } = jest.requireMock('../utils/logger')
    logError.mockClear()

    await agent().post('/post/publish').set('org', 'o1').set('rootOrg', 'r1').send({})

    expect(logError).not.toHaveBeenCalled()
  })

  it('/edit/tags calls PUT and does not apply the SOCIAL_TIMEOUT override', async () => {
    await agent().put('/edit/tags').set('org', 'o1').set('rootOrg', 'r1').send({})

    const callArgs = mockAxiosCallable.mock.calls[0][0]
    expect(callArgs.method).toBe('PUT')
    expect(callArgs.timeout).not.toBe(9999)
  })

  /**
   * @description Concurrency: this file's 23 routes all funnel through the
   * same shared proxySocialRoute function. Fires 3 concurrent requests to
   * different routes with different extra fields, and confirms each
   * call's own extra field/timeout/method never leaks into another
   * concurrently-running route's call.
   */
  it('concurrent requests to different routes never cross-contaminate their extra fields', async () => {
    await Promise.all([
      agent().post('/catalog').set('org', 'o1').set('rootOrg', 'r1').send({}),
      agent().post('/admin/deletePost').set('org', 'o1').set('rootOrg', 'r1').send({}),
      agent().post('/post/timeline').set('org', 'o1').set('rootOrg', 'r1').send({}),
    ])

    const calls = mockAxiosCallable.mock.calls.map((c) => c[0])
    const catalogCall = calls.find((c) => c.url.endsWith('/catalog/fetch'))
    const deleteCall = calls.find((c) => c.method === 'DELETE')
    const timelineCall = calls.find((c) => c.url.endsWith('/post/timeline'))
    expect(catalogCall.data.userid).toBe('user-1')
    expect(deleteCall.data.adminId).toBe('user-1')
    expect(timelineCall.timeout).toBe(9999)
    expect(timelineCall.data.adminId).toBeUndefined()
    expect(catalogCall.data.adminId).toBeUndefined()
  })
})

describe('POST /post/upload/:contentId', () => {
  // FormData is mocked; `.append()` and `.submit()` are configured per test.
  const mockAppend = jest.fn()
  const mockSubmit = jest.fn()

  beforeEach(() => {
    mockAppend.mockReset()
    mockSubmit.mockReset()
    ;(FormData as unknown as jest.Mock).mockImplementation(() => ({
      append: mockAppend,
      submit: mockSubmit,
    }))
  })

  it('rejects a request missing the org/rootOrg headers', async () => {
    const response = await agent().post('/post/upload/content-1').send({})
    expect(response.status).toBe(400)
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('returns 500 when no file is attached', async () => {
    // No .attach() call means req.files is undefined, so the handler's own
    // `throw new Error('File not found')` is hit — asserting the ERROR PATH,
    // since simulating a real multipart file upload is out of scope here.
    const response = await agent()
      .post('/post/upload/content-1')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
      .send({})

    expect(response.status).toBe(500)
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  // mountRouter does not wire up express-fileupload middleware, so a real
  // multipart .attach() never populates req.files. requestProps is injected
  // directly onto req instead, which is exactly the shape that middleware
  // would have produced.
  const withFile = () =>
    mountRouter(socialApi, {
      requestProps: {
        files: { content: { data: Buffer.from('file-bytes'), mimetype: 'image/png', name: 'photo.png' } },
      },
    })

  it('uploads the attached file and returns the upstream JSON body', async () => {
    mockSubmit.mockImplementation((_url, cb) => {
      const fakeResponse = {
        on: (event: string, handler: (chunk: Buffer) => void) => {
          if (event === 'data') {
            handler(Buffer.from(JSON.stringify({ uploaded: true })))
          }
        },
        statusCode: 200,
      }
      cb(null, fakeResponse)
    })

    const response = await withFile()
      .post('/post/upload/content-1')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
      .send({})

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ uploaded: true })
    expect(mockAppend).toHaveBeenCalledWith(
      'content',
      expect.any(Buffer),
      expect.objectContaining({ filename: 'photo.png' })
    )
  })

  it('returns the upstream error message when the upload fails', async () => {
    mockSubmit.mockImplementation((_url, cb) => {
      cb(new Error('upload rejected'), { statusCode: 400 })
    })

    const response = await withFile()
      .post('/post/upload/content-1')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
      .send({})

    expect(response.status).toBe(200) // handler never sets a status on this branch
    expect(response.text).toBe('upload rejected')
  })
})
