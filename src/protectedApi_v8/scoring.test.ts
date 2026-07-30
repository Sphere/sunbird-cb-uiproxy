/**
 * scoring.ts — seven routes over two axios call shapes:
 *
 *  - the callable `axios({...})` form: POST /comments/create,
 *    GET /comments/course, PUT /comments/update, GET /comments/getAllComments
 *  - the `axios.post`/`axios.get` form: POST /calculate, POST /fetch,
 *    GET /getTemplate/:templateId — these three additionally validate the
 *    `rootorg`/`org` headers before calling upstream.
 *
 * extractUserToken (src/utils/requestExtract.ts) is mocked wholesale like the
 * sibling network.test.ts does, rather than exercised for real: its real
 * implementation only reads `req.kauth && req.kauth.grant...` which is safe
 * (short-circuits to undefined when kauth is absent), but mocking keeps the
 * outgoing-header assertions deterministic.
 *
 * Every route here is wrapped in its own try/catch with a single validation
 * `return` before any response is sent, and no route derives a callable off
 * something that might be a plain object (e.g. req.query as a function) — so
 * every path below is safe to exercise live. No dangerous patterns found.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    KONG_API_BASE: 'https://kong.test',
    SB_API_KEY: 'sb-key-1',
    SCORING_SERVICE_API_BASE: 'https://scoring-service.test',
    TIMEOUT: '10000',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { scoringApi } from './scoring'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(scoringApi)

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

describe('POST /comments/create', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ id: 'c1' }, 201))

    const response = await agent().post('/comments/create').send({ text: 'hi' })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ id: 'c1' })
  })

  it('calls the configured comments-create endpoint', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({}))

    await agent().post('/comments/create').send({ text: 'hi' })

    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { text: 'hi' },
        method: 'POST',
        url: 'https://scoring-service.test/api/comments/create',
      })
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(400, { error: 'bad request' }))

    const response = await agent().post('/comments/create').send({ text: 'hi' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad request' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent().post('/comments/create').send({ text: 'hi' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /comments/course', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk([{ id: 'c1' }]))

    const response = await agent().get('/comments/course').query({ courseId: 'course1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'c1' }])
  })

  it('passes the courseId query param through to upstream', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk([]))

    await agent().get('/comments/course').query({ courseId: 'course1' })

    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        params: { courseId: 'course1' },
        url: 'https://scoring-service.test/api/comments/course',
      })
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent().get('/comments/course').query({ courseId: 'course1' })

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent().get('/comments/course').query({ courseId: 'course1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('PUT /comments/update', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ updated: true }))

    const response = await agent()
      .put('/comments/update')
      .query({ commentsId: 'comment1' })
      .send({ text: 'updated' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ updated: true })
  })

  it('passes the commentsId query param and body through to upstream', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({}))

    await agent()
      .put('/comments/update')
      .query({ commentsId: 'comment1' })
      .send({ text: 'updated' })

    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { text: 'updated' },
        method: 'PUT',
        params: { commentsId: 'comment1' },
        url: 'https://scoring-service.test/api/comments/update',
      })
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(409, { error: 'conflict' }))

    const response = await agent()
      .put('/comments/update')
      .query({ commentsId: 'comment1' })
      .send({ text: 'updated' })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent()
      .put('/comments/update')
      .query({ commentsId: 'comment1' })
      .send({ text: 'updated' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /comments/getAllComments', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk([{ id: 'c1' }, { id: 'c2' }]))

    const response = await agent()
      .get('/comments/getAllComments')
      .query({ commentsId: 'comment1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'c1' }, { id: 'c2' }])
  })

  it('passes the commentsId query param through to upstream', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk([]))

    await agent().get('/comments/getAllComments').query({ commentsId: 'comment1' })

    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        params: { commentsId: 'comment1' },
        url: 'https://scoring-service.test/api/comments/getall',
      })
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(500, { error: 'server error' }))

    const response = await agent()
      .get('/comments/getAllComments')
      .query({ commentsId: 'comment1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'server error' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent()
      .get('/comments/getAllComments')
      .query({ commentsId: 'comment1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /calculate', () => {
  it('rejects a request missing both org headers', async () => {
    const response = await agent().post('/calculate').send({ score: 10 })

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('rejects a request missing only the org header', async () => {
    const response = await agent().post('/calculate').set('rootorg', 'r1').send({ score: 10 })

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('rejects a request missing only the rootorg header', async () => {
    const response = await agent().post('/calculate').set('org', 'o1').send({ score: 10 })

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('forwards the upstream status and body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ score: 10 }))

    const response = await agent()
      .post('/calculate')
      .set('org', 'o1')
      .set('rootorg', 'r1')
      .send({ score: 10 })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ score: 10 })
  })

  it('calls the configured calculate-score endpoint with org headers', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    await agent().post('/calculate').set('org', 'o1').set('rootorg', 'r1').send({ score: 10 })

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://kong.test/scoring/v1/add',
      { score: 10 },
      expect.objectContaining({
        headers: expect.objectContaining({
          org: 'o1',
          rootOrg: 'r1',
        }),
      })
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(422, { error: 'invalid score' }))

    const response = await agent()
      .post('/calculate')
      .set('org', 'o1')
      .set('rootorg', 'r1')
      .send({ score: 10 })

    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'invalid score' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent()
      .post('/calculate')
      .set('org', 'o1')
      .set('rootorg', 'r1')
      .send({ score: 10 })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /fetch', () => {
  it('rejects a request missing org headers', async () => {
    const response = await agent().post('/fetch').send({})

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('forwards the upstream status and body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ score: 42 }))

    const response = await agent().post('/fetch').set('org', 'o1').set('rootorg', 'r1').send({})

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ score: 42 })
  })

  it('calls the configured fetch-score endpoint with org headers', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    await agent().post('/fetch').set('org', 'o1').set('rootorg', 'r1').send({})

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://kong.test/scoring/v1/fetch',
      {},
      expect.objectContaining({
        headers: expect.objectContaining({
          org: 'o1',
          rootOrg: 'r1',
        }),
      })
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent().post('/fetch').set('org', 'o1').set('rootorg', 'r1').send({})

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/fetch').set('org', 'o1').set('rootorg', 'r1').send({})

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /getTemplate/:templateId', () => {
  it('rejects a request missing org headers', async () => {
    const response = await agent().get('/getTemplate/template1')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('forwards the upstream status and body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'template1' }))

    const response = await agent()
      .get('/getTemplate/template1')
      .set('org', 'o1')
      .set('rootorg', 'r1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'template1' })
  })

  it('calls the configured getTemplate endpoint with the templateId interpolated', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({}))

    await agent().get('/getTemplate/template1').set('org', 'o1').set('rootorg', 'r1')

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://kong.test/scoring/v1/getTemplate/template1',
      expect.objectContaining({
        headers: expect.objectContaining({
          org: 'o1',
          rootOrg: 'r1',
        }),
      })
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'template not found' }))

    const response = await agent()
      .get('/getTemplate/template1')
      .set('org', 'o1')
      .set('rootorg', 'r1')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'template not found' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent()
      .get('/getTemplate/template1')
      .set('org', 'o1')
      .set('rootorg', 'r1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
