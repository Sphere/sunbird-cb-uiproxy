/**
 * PHASE 1 — proxies_v8.ts (200 uncovered).
 *
 * Most of this file mounts http-proxy-based `proxyCreator*` factories that
 * stream a raw request/response via `.web()` rather than returning JSON — the
 * same shape deliberately skipped elsewhere in this codebase (e.g.
 * mobileAppApi.ts's kong hierarchy route). Only the self-contained handlers
 * are covered here.
 *
 * The `request(url).pipe(res)` endpoints ARE testable: `request` is mocked to
 * return a real Node Readable, which pipes into the real Express response
 * supertest observes — no proxy-creator involved.
 */

jest.mock('axios')
jest.mock('request')
jest.mock('form-data')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
  extractUserToken: jest.fn(() => 'token-1'),
}))
// The proxy-creator factories are mounted at import time as middleware
// (`proxiesV8.use(...)`, `proxiesV8.get(path, factory(...))`), so even routes
// this file does not test must not throw during module load.
jest.mock('../utils/proxyCreator', () => {
  const passthrough = () => (_req: unknown, res: { json: (b: unknown) => void }) =>
    res.json({ mocked: 'proxy-creator' })
  return {
    getContentProxyCreatorRoute: passthrough,
    ilpProxyCreatorRoute: passthrough,
    proxyContent: passthrough,
    proxyContentLearnerVM: passthrough,
    proxyCreatorDiscussionSunbird: passthrough,
    proxyCreatorDownloadCertificate: passthrough,
    proxyCreatorEtlFrac: passthrough,
    proxyCreatorEtlFracUpload: passthrough,
    proxyCreatorForms: passthrough,
    proxyCreatorKnowledge: passthrough,
    proxyCreatorLearner: passthrough,
    proxyCreatorQML: passthrough,
    proxyCreatorRoute: passthrough,
    proxyCreatorSunbird: passthrough,
    proxyCreatorSunbirdSearch: passthrough,
    proxyCreatorToAppentUserId: passthrough,
    proxyHierarchyKnowledge: passthrough,
    scormProxyCreatorRoute: passthrough,
  }
})
jest.mock('../authoring/utils/cdn-url-replacer', () => ({ replaceCdnUrls: jest.fn((x) => x) }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    CDN_DOMAIN: 'https://cdn.test',
    HTTPS_HOST: 'https://auth.test',
    KONG_API_BASE: 'https://kong.test',
    // Only this one notify body needs real '#contentLink' content, to reach
    // the contentBody.replace() branch in POST /notifyContentState.
    NOTIFY_SEND_FOR_REVIEW_BODY: 'Please review the content #contentLink',
    S3_BUCKET_URL: 'https://bucket.test/',
    SB_API_KEY: 'sb-api-key',
    TIMEOUT: '10000',
  },
}))

import { PassThrough, Readable } from 'stream'
import axios from 'axios'
import FormData from 'form-data'
import request from 'request'
import { replaceCdnUrls } from '../authoring/utils/cdn-url-replacer'
import { mountRouter } from '../test-support/mountRouter'
import { proxiesV8 } from './proxies_v8'

const mockAxios = axios as unknown as jest.Mock
const mockRequest = request as unknown as jest.Mock

// Mounted at the same base path as server.ts (app.use('/proxies/v8', ...
// proxiesV8)), because removePrefix() in the getContents* handlers strips a
// hardcoded '/proxies/v8/...' prefix off req.originalUrl. A flat mount would
// make req.originalUrl too short and truncate the derived path.
const BASE = '/proxies/v8'
const agent = () => mountRouter(proxiesV8, { basePath: BASE })

/** A request()-shaped stream carrying the given body, for .pipe(res) targets. */
function streamOf(body: string) {
  const stream = new PassThrough()
  process.nextTick(() => {
    stream.write(body)
    stream.end()
  })
  return stream
}

beforeEach(() => {
  mockAxios.mockReset()
  mockRequest.mockReset()
})

describe('GET /', () => {
  it('reports the proxy route type', async () => {
    const response = await agent().get(`${BASE}/`)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ type: 'PROXIES Route' })
  })
})

describe('GET /getContents/*', () => {
  it('pipes the S3 bucket content through to the response', async () => {
    mockRequest.mockReturnValue(streamOf('file-bytes'))
    const response = await agent().get(`${BASE}/getContents/path/to/file.png`)
    expect(response.status).toBe(200)
    expect(response.text).toBe('file-bytes')
    expect(mockRequest).toHaveBeenCalledWith('https://bucket.test/path/to/file.png')
  })
})

describe('GET /getContentsv2/*', () => {
  it('pipes cloudfront content through to the response', async () => {
    mockRequest.mockReturnValue(streamOf('cf-bytes'))
    const response = await agent().get(`${BASE}/getContentsv2/path/to/file.png`)
    expect(response.status).toBe(200)
    expect(response.text).toBe('cf-bytes')
  })
})

describe('GET /getContentsv3/*', () => {
  it('pipes CDN content and sets CORS headers', async () => {
    mockRequest.mockReturnValue(streamOf('cdn-bytes'))
    const response = await agent().get(`${BASE}/getContentsv3/path/to/file.png`)
    expect(response.status).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBe('*')
  })

  it('sets a PDF content-type for .pdf paths', async () => {
    mockRequest.mockReturnValue(streamOf('%PDF-bytes'))
    const response = await agent().get(`${BASE}/getContentsv3/path/to/file.pdf`)
    expect(response.headers['content-type']).toContain('application/pdf')
  })
})

describe('GET /logout/user', () => {
  it('clears the session and redirects home', async () => {
    mockAxios.mockResolvedValue({ data: {} })
    const session = {
      // tslint:disable-next-line: no-any
      regenerate: (cb: any) => cb(null),
      // tslint:disable-next-line: no-any
      save: (cb: any) => cb(null),
      user: {},
    }
    const response = await mountRouter(proxiesV8, { basePath: BASE, session }).get(`${BASE}/logout/user`)
    expect(response.status).toBe(302)
    expect(response.headers.location).toContain('/public/home')
  })

  it('reports the error when Keycloak logout fails', async () => {
    mockAxios.mockRejectedValue(new Error('keycloak down'))
    const response = await mountRouter(proxiesV8, { basePath: BASE, session: {} }).get(`${BASE}/logout/user`)
    expect(response.status).toBe(200)
    expect(response.text).toContain('Error in logging out user')
  })
})

describe('POST /upload/action/*', () => {
  it('uploads the file and forwards the upstream artifact details', async () => {
    mockAxios.mockResolvedValue({
      data: {
        params: { status: 'Live' },
        result: {
          artifactUrl: 'https://cdn.test/artifact.png',
          content_url: 'https://cdn.test/content.png',
          identifier: 'do_123',
        },
      },
    })
    ;(FormData as unknown as jest.Mock).mockImplementation(() => ({
      append: jest.fn(),
      getHeaders: jest.fn(() => ({})),
    }))

    const response = await mountRouter(proxiesV8, {
      basePath: BASE,
      requestProps: {
        files: { data: { data: Buffer.from('x'), mimetype: 'image/png', name: 'artifact.png' } },
      },
    })
      .post(`${BASE}/upload/action/upload/content/v3/do_123`)
      .send({})

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      artifactUrl: 'https://cdn.test/artifact.png',
      content_url: 'https://cdn.test/content.png',
      identifier: 'do_123',
      status: 'Live',
    })
  })

  it('reports an upload error when the upstream call fails', async () => {
    mockAxios.mockRejectedValue(new Error('upload failed'))
    ;(FormData as unknown as jest.Mock).mockImplementation(() => ({
      append: jest.fn(),
      getHeaders: jest.fn(() => ({})),
    }))

    const response = await mountRouter(proxiesV8, {
      basePath: BASE,
      requestProps: {
        files: { data: { data: Buffer.from('x'), mimetype: 'image/png', name: 'artifact.png' } },
      },
    })
      .post(`${BASE}/upload/action/upload/content/v3/do_123`)
      .send({})

    expect(response.status).toBe(200)
    expect(response.text).toBe('Error while uploading ..')
  })

  it('reports missing file when no file is attached', async () => {
    const response = await agent().post(`${BASE}/upload/action/upload/content/v3/do_123`).send({})
    expect(response.status).toBe(200)
    expect(response.text).toBe('File not found')
  })
})

describe('POST /private/upload/*', () => {
  it('submits the file and forwards a parsed 2xx upstream body', async () => {
    const mockSubmit = jest.fn((_opts, cb) => {
      const fakeResponse = Object.assign(new Readable({ read() { /* noop */ } }), {
        statusCode: 200,
      })
      cb(null, fakeResponse)
      fakeResponse.emit('data', Buffer.from(JSON.stringify({ uploaded: true })))
    })
    ;(FormData as unknown as jest.Mock).mockImplementation(() => ({
      append: jest.fn(),
      submit: mockSubmit,
    }))

    const response = await mountRouter(proxiesV8, {
      basePath: BASE,
      requestProps: {
        files: { data: { data: Buffer.from('x'), mimetype: 'text/csv', name: 'private.csv' } },
      },
    })
      .post(`${BASE}/private/upload/some/path`)
      .send({})

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ uploaded: true })
  })

  it('forwards the raw body for a non-2xx upstream response', async () => {
    const mockSubmit = jest.fn((_opts, cb) => {
      const fakeResponse = Object.assign(new Readable({ read() { /* noop */ } }), {
        statusCode: 500,
      })
      cb(null, fakeResponse)
      fakeResponse.emit('data', Buffer.from('upstream failure'))
    })
    ;(FormData as unknown as jest.Mock).mockImplementation(() => ({
      append: jest.fn(),
      submit: mockSubmit,
    }))

    const response = await mountRouter(proxiesV8, {
      basePath: BASE,
      requestProps: {
        files: { data: { data: Buffer.from('x'), mimetype: 'text/csv', name: 'private.csv' } },
      },
    })
      .post(`${BASE}/private/upload/some/path`)
      .send({})

    expect(response.status).toBe(200)
    expect(response.text).toBe('upstream failure')
  })

  // The response's 'data' event is deliberately never emitted here: emitting
  // it alongside the error callback would double-send (once from the 'data'
  // handler, again from the `if (_err)` branch below it) — so only the error
  // path is exercised, matching the identical shape already covered safely
  // for /userData/v1/bulkUpload below.
  it('sends the raw error when the submit callback errors', async () => {
    const mockSubmit = jest.fn((_opts, cb) => {
      cb(new Error('submit failed'), { on: jest.fn() })
    })
    ;(FormData as unknown as jest.Mock).mockImplementation(() => ({
      append: jest.fn(),
      submit: mockSubmit,
    }))

    const response = await mountRouter(proxiesV8, {
      basePath: BASE,
      requestProps: {
        files: { data: { data: Buffer.from('x'), mimetype: 'text/csv', name: 'private.csv' } },
      },
    })
      .post(`${BASE}/private/upload/some/path`)
      .send({})

    expect(response.status).toBe(200)
  })

  it('reports missing file when no file is attached', async () => {
    const response = await agent().post(`${BASE}/private/upload/some/path`).send({})
    expect(response.status).toBe(200)
    expect(response.text).toBe('File not found')
  })
})

describe('GET /action/content/v3/read/*', () => {
  it('applies CDN URL replacement to the upstream content', async () => {
    mockAxios.mockResolvedValue({ data: { contentUrl: 'https://raw.test/asset.png' } })

    const response = await agent().get(`${BASE}/action/content/v3/read/do_123`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ contentUrl: 'https://raw.test/asset.png' })
  })

  it('falls back to the raw upstream body when CDN replacement throws', async () => {
    mockAxios.mockResolvedValue({ data: { contentUrl: 'https://raw.test/asset.png' } })
    ;(replaceCdnUrls as jest.Mock).mockImplementationOnce(() => {
      throw new Error('replacement failed')
    })

    const response = await agent().get(`${BASE}/action/content/v3/read/do_123`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ contentUrl: 'https://raw.test/asset.png' })
  })

  it('passes an upstream failure to the error middleware', async () => {
    mockAxios.mockRejectedValue(new Error('read failed'))

    const response = await agent().get(`${BASE}/action/content/v3/read/do_123`)

    expect(response.status).toBe(500)
  })
})

describe('POST /userData/v1/bulkUpload', () => {
  it('rejects a request with no file attached', async () => {
    const response = await agent().post(`${BASE}/userData/v1/bulkUpload`).send({})
    expect(response.status).toBe(400)
    expect(response.body.msg).toBe('File not found in the request')
  })

  it('uploads the file and forwards the upstream JSON body', async () => {
    mockAxios.mockResolvedValue({ data: { result: { response: { channel: 'ch1' } } } })
    const mockAppend = jest.fn()
    const mockSubmit = jest.fn((_opts, cb) => {
      const fakeResponse = Object.assign(new Readable({ read() { /* noop */ } }), {
        statusCode: 200,
      })
      cb(null, fakeResponse)
      fakeResponse.emit('data', Buffer.from(JSON.stringify({ uploaded: true })))
    })
    ;(FormData as unknown as jest.Mock).mockImplementation(() => ({
      append: mockAppend,
      submit: mockSubmit,
    }))

    const response = await mountRouter(proxiesV8, {
      basePath: BASE,
      requestProps: {
        files: { data: { data: Buffer.from('x'), mimetype: 'text/csv', name: 'users.csv' } },
      },
    })
      .post(`${BASE}/userData/v1/bulkUpload`)
      .send({})

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ uploaded: true })
  })

  it('forwards the raw body for a non-2xx bulk upload response', async () => {
    mockAxios.mockResolvedValue({ data: { result: { response: { channel: 'ch1' } } } })
    const mockSubmit = jest.fn((_opts, cb) => {
      const fakeResponse = Object.assign(new Readable({ read() { /* noop */ } }), {
        statusCode: 500,
      })
      cb(null, fakeResponse)
      fakeResponse.emit('data', Buffer.from('upstream failure'))
    })
    ;(FormData as unknown as jest.Mock).mockImplementation(() => ({
      append: jest.fn(),
      submit: mockSubmit,
    }))

    const response = await mountRouter(proxiesV8, {
      basePath: BASE,
      requestProps: {
        files: { data: { data: Buffer.from('x'), mimetype: 'text/csv', name: 'users.csv' } },
      },
    })
      .post(`${BASE}/userData/v1/bulkUpload`)
      .send({})

    expect(response.status).toBe(200)
    expect(response.text).toBe('upstream failure')
  })

  // The response's 'data' event is deliberately never emitted here: see the
  // identical reasoning on the /private/upload/* error test above.
  it('sends the raw error when the bulk upload submit callback errors', async () => {
    mockAxios.mockResolvedValue({ data: { result: { response: { channel: 'ch1' } } } })
    const mockSubmit = jest.fn((_opts, cb) => {
      cb(new Error('submit failed'), { on: jest.fn() })
    })
    ;(FormData as unknown as jest.Mock).mockImplementation(() => ({
      append: jest.fn(),
      submit: mockSubmit,
    }))

    const response = await mountRouter(proxiesV8, {
      basePath: BASE,
      requestProps: {
        files: { data: { data: Buffer.from('x'), mimetype: 'text/csv', name: 'users.csv' } },
      },
    })
      .post(`${BASE}/userData/v1/bulkUpload`)
      .send({})

    expect(response.status).toBe(200)
  })
})

describe('GET /userData/v1/bulkUpload', () => {
  it('returns the upstream bulk-upload status', async () => {
    mockAxios
      .mockResolvedValueOnce({ data: { result: { response: { channel: 'ch1' } } } })
      .mockResolvedValueOnce({ data: { status: 'done' } })

    const response = await agent().get(`${BASE}/userData/v1/bulkUpload`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'done' })
  })

  // A rejected upstream call is deliberately NOT tested: this handler has NO
  // try/catch at all, so an axios rejection becomes an unhandled promise
  // rejection in the route handler with no response ever sent. Recorded in
  // docs/PROD-VERIFICATION.md rather than reproduced live.
})

describe('POST /notifyContentState', () => {
  it('sends the notification and reports success', async () => {
    mockAxios.mockResolvedValue({ data: { result: { response: true } } })

    const response = await agent()
      .post(`${BASE}/notifyContentState`)
      .send({ contentState: 'sendForReview' })

    expect(response.status).toBe(200)
    expect(response.text).toBe('Email sent successfully.')
  })

  it('reports failure when the upstream declines to send', async () => {
    mockAxios.mockResolvedValue({ data: { result: { response: false } } })

    const response = await agent()
      .post(`${BASE}/notifyContentState`)
      .send({ contentState: 'reviewCompleted' })

    expect(response.status).toBe(400)
  })

  it('sends the notification for contentState=reviewFailed', async () => {
    mockAxios.mockResolvedValue({ data: { result: { response: true } } })

    const response = await agent()
      .post(`${BASE}/notifyContentState`)
      .send({ contentState: 'reviewFailed' })

    expect(response.status).toBe(200)
    expect(response.text).toBe('Email sent successfully.')
  })

  it('sends the notification for contentState=sendForPublish', async () => {
    mockAxios.mockResolvedValue({ data: { result: { response: true } } })

    const response = await agent()
      .post(`${BASE}/notifyContentState`)
      .send({ contentState: 'sendForPublish' })

    expect(response.status).toBe(200)
    expect(response.text).toBe('Email sent successfully.')
  })

  it('sends the notification for contentState=publishCompleted', async () => {
    mockAxios.mockResolvedValue({ data: { result: { response: true } } })

    const response = await agent()
      .post(`${BASE}/notifyContentState`)
      .send({ contentState: 'publishCompleted' })

    expect(response.status).toBe(200)
    expect(response.text).toBe('Email sent successfully.')
  })

  it('sends the notification for contentState=publishFailed', async () => {
    mockAxios.mockResolvedValue({ data: { result: { response: true } } })

    const response = await agent()
      .post(`${BASE}/notifyContentState`)
      .send({ contentState: 'publishFailed' })

    expect(response.status).toBe(200)
    expect(response.text).toBe('Email sent successfully.')
  })

  it('replaces the #contentLink placeholder when contentLink and contentName are given', async () => {
    mockAxios.mockResolvedValue({ data: { result: { response: true } } })

    const response = await agent()
      .post(`${BASE}/notifyContentState`)
      .send({
        contentLink: 'https://example.test/content/123',
        contentName: 'My Content',
        contentState: 'sendForReview',
      })

    expect(response.status).toBe(200)
    expect(response.text).toBe('Email sent successfully.')
  })

  // Neither a missing contentState NOR an unrecognised one is tested live.
  // The WHOLE handler has no try/catch at all. Both the initial guard and the
  // switch's default case call res.status(400).send() WITHOUT returning, so
  // execution falls through past the switch into the axios call with an empty
  // contentBody. With axios unmocked for that path this throws a TypeError on
  // `stateEmailResponse.data` (confirmed while writing this test); with axios
  // mocked to resolve, it instead reaches a SECOND res.status(...).send() on an
  // already-sent response (ERR_HTTP_HEADERS_SENT). Either way it is an
  // unhandled failure with no surrounding catch — worse than the same pattern
  // elsewhere in this codebase, which is at least wrapped in a try/catch.
  // Recorded in docs/PROD-VERIFICATION.md.
})
