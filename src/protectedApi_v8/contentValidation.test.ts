/**
 * contentValidation.ts — every route follows the exemplar shape (see
 * counter.test.ts): axios call -> forward status+data, or forward the
 * upstream error status via the shared `(err.response.status||500)` catch
 * block. Only /checkProfanity/:contentId/:userId has a validation branch
 * (missing rootorg/org/wid header, or missing params), and it `return`s
 * immediately after sending its 400, so there is no double-send risk.
 * No route is missing a try/catch, so all failure paths are safe to test live.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    CONTENT_VALIDATION_API_BASE: 'https://content-validation.test',
    KONG_API_BASE: 'https://kong.test',
    PROFANITY_SERVICE_API_BASE: 'https://profanity.test',
    SB_API_KEY: 'sb-api-key',
  },
}))

import axios from 'axios'
import { contentValidationApi } from './contentValidation'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(contentValidationApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

describe('GET /checkProfanity/:contentId/:userId', () => {
  const withHeaders = (req: ReturnType<typeof agent>) =>
    req.set('rootorg', 'r1').set('org', 'o1').set('wid', 'w1')

  it('forwards the upstream status and body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ profane: false }))

    const response = await withHeaders(agent().get('/checkProfanity/c1/u1'))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ profane: false })
  })

  it('rejects a request missing rootorg', async () => {
    const response = await agent().get('/checkProfanity/c1/u1').set('org', 'o1').set('wid', 'w1')

    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('rejects a request missing org', async () => {
    const response = await agent().get('/checkProfanity/c1/u1').set('rootorg', 'r1').set('wid', 'w1')

    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('rejects a request missing wid', async () => {
    const response = await agent().get('/checkProfanity/c1/u1').set('rootorg', 'r1').set('org', 'o1')

    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(422, { error: 'invalid content' }))

    const response = await withHeaders(agent().get('/checkProfanity/c1/u1'))

    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'invalid content' })
  })

  it('falls back to 500 when the failure carries no upstream response', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await withHeaders(agent().get('/checkProfanity/c1/u1'))

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /checkTextProfanity', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ profane: false }))

    const response = await agent().post('/checkTextProfanity').send({ text: 'hello' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ profane: false })
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(400, { error: 'bad text' }))

    const response = await agent().post('/checkTextProfanity').send({ text: 'hello' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad text' })
  })

  it('falls back to 500 when the failure carries no upstream response', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/checkTextProfanity').send({ text: 'hello' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /validatePdfContent', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ valid: true }))

    const response = await agent().post('/validatePdfContent').send({ url: 'https://file.test/a.pdf' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ valid: true })
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(502, { error: 'upstream failed' }))

    const response = await agent().post('/validatePdfContent').send({ url: 'https://file.test/a.pdf' })

    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'upstream failed' })
  })

  it('falls back to 500 when the failure carries no upstream response', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/validatePdfContent').send({ url: 'https://file.test/a.pdf' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /startPdfProfanity', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ started: true }))

    const response = await agent().post('/startPdfProfanity').send({ url: 'https://file.test/a.pdf' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ started: true })
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(403, { error: 'forbidden' }))

    const response = await agent().post('/startPdfProfanity').send({ url: 'https://file.test/a.pdf' })

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'forbidden' })
  })

  it('falls back to 500 when the failure carries no upstream response', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/startPdfProfanity').send({ url: 'https://file.test/a.pdf' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /getPdfProfanity', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ profane: false }))

    const response = await agent().post('/getPdfProfanity').send({ url: 'https://file.test/a.pdf' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ profane: false })
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent().post('/getPdfProfanity').send({ url: 'https://file.test/a.pdf' })

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('falls back to 500 when the failure carries no upstream response', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/getPdfProfanity').send({ url: 'https://file.test/a.pdf' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /getPdfProfanityForContent/:contentId', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ status: 'complete' }))

    const response = await agent()
      .get('/getPdfProfanityForContent/c1')
      .set('rootorg', 'r1')
      .set('wid', 'w1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'complete' })
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(400, { error: 'bad content id' }))

    const response = await agent()
      .get('/getPdfProfanityForContent/c1')
      .set('rootorg', 'r1')
      .set('wid', 'w1')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad content id' })
  })

  it('falls back to 500 when the failure carries no upstream response', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent()
      .get('/getPdfProfanityForContent/c1')
      .set('rootorg', 'r1')
      .set('wid', 'w1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
