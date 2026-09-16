/**
 * Coverage for src/authoring/content/index.ts (authApi router).
 *
 * SAFETY NOTES (see docs/PROD-VERIFICATION.md candidates reported alongside
 * this file — not edited here per campaign process):
 *
 * - POST /copy, POST /encode, POST /content/v3/create, GET /content/v3/read/:id,
 *   PATCH /content/v3/update/:id and the trailing catch-all `authApi.all('*', ...)`
 *   all end their axios promise chain with:
 *     .catch((error) => { res.status(error.response.status).send(error.response.data) })
 *   with NO guard on `error.response` existing (contrast with sibling file
 *   protectedApi_v8/content.ts, which always does
 *   `(err && err.response && err.response.status) || 500`). A transport-level
 *   failure (no upstream HTTP response, e.g. DNS/ECONNREFUSED) makes
 *   `error.response` undefined, so `error.response.status` throws *inside*
 *   the .catch callback itself -> the request never sends a response AND the
 *   resulting promise rejection is never handled by anything further in the
 *   chain (the handler is fire-and-forget, it never awaits/returns the axios
 *   chain) -> unhandled promise rejection, which can terminate the Node
 *   process on Node >= 15. This is why every failure-path test below for
 *   those routes uses `upstreamError()` (which always sets `error.response`)
 *   and never `networkError()`.
 *
 * - GET /content/v3/read/:id additionally does `response.data.params.status`
 *   with no defensive check that `params` exists. If upstream ever resolves
 *   with a 2xx body lacking `params`, that access throws inside `.then`,
 *   which IS caught by the chained `.catch` — but that catch then does its
 *   own unguarded `error.response.status` (see above) on a plain TypeError
 *   that has no `.response`, throwing a second time with nothing left to
 *   catch it. This double-fault is not reproduced live in this file; every
 *   mocked resolved response here always includes a `params` object.
 *
 * - POST /upload/s3 and POST /download/s3 are `async` handlers with NO
 *   try/catch anywhere in the function body. Each maps requests through
 *   `uploadJSONData`/`readJSONData` and then explicitly `await`s each
 *   resulting promise in a `for...of` loop. If either rejects, the await
 *   throws inside a try-less async function and Express never awaits the
 *   handler's returned promise, so the rejection is never handled ->
 *   unhandled promise rejection. Only success paths are tested live for
 *   these two routes.
 */

jest.mock('axios')

jest.mock('../../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}))

jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    AUTHORING_BACKEND: 'https://authoring-backend.test',
    CONTENT_API_BASE: 'https://content-api.test',
    SUNBIRD_PROXY_URL: 'https://sunbird-proxy.test',
  },
}))

jest.mock('../../utils/dataAlterer', () => ({
  returnData: jest.fn((data: object) => ({ ...data, mappedByReturnData: true })),
}))

jest.mock('../utils/cdn-url-replacer', () => ({
  replaceCdnUrls: jest.fn((data: unknown) => data),
}))

jest.mock('../utils/header', () => ({
  getOrg: jest.fn(() => 'test-org'),
  getRootOrg: jest.fn(() => 'test-root-org'),
}))

jest.mock('../utils/read-meta-and-json', () => ({
  readJSONData: jest.fn(),
}))

jest.mock('../utils/upload-meta-and-json', () => ({
  uploadJSONData: jest.fn(),
}))

jest.mock('./hierarchy', () => ({
  getHierarchy: jest.fn(),
  getMultipleHierarchyV2: jest.fn(),
}))

jest.mock('./hierarchy-and-content', () => ({
  getHierarchyV2WithContent: jest.fn(),
  getMultipleHierarchyV2WithContent: jest.fn(),
}))

jest.mock('./language-search', () => ({
  searchForOtherLanguage: jest.fn(),
}))

import axios from 'axios'
import { authApi } from './index'
import { getHierarchy, getMultipleHierarchyV2 } from './hierarchy'
import { getHierarchyV2WithContent, getMultipleHierarchyV2WithContent } from './hierarchy-and-content'
import { searchForOtherLanguage } from './language-search'
import { readJSONData } from '../utils/read-meta-and-json'
import { uploadJSONData } from '../utils/upload-meta-and-json'
import { upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockGetHierarchy = getHierarchy as jest.Mock
const mockGetMultipleHierarchyV2 = getMultipleHierarchyV2 as jest.Mock
const mockGetHierarchyV2WithContent = getHierarchyV2WithContent as jest.Mock
const mockGetMultipleHierarchyV2WithContent = getMultipleHierarchyV2WithContent as jest.Mock
const mockSearchForOtherLanguage = searchForOtherLanguage as jest.Mock
const mockReadJSONData = readJSONData as jest.Mock
const mockUploadJSONData = uploadJSONData as jest.Mock

const agent = () => mountRouter(authApi)

describe('GET /hierarchy/:id', () => {
  it('returns the hierarchy on success', async () => {
    mockGetHierarchy.mockResolvedValueOnce({ identifier: 'do_1' })

    const response = await agent().get('/hierarchy/do_1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ identifier: 'do_1' })
  })

  it('returns 400 with the generic error body on failure', async () => {
    mockGetHierarchy.mockRejectedValueOnce(new Error('boom'))

    const response = await agent().get('/hierarchy/do_1')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ msg: 'Some error occurred' })
  })
})

describe('GET /hierarchy/content/:id', () => {
  it('returns the hierarchy+content on success', async () => {
    mockGetHierarchyV2WithContent.mockResolvedValueOnce({ identifier: 'do_1', content: {} })

    const response = await agent().get('/hierarchy/content/do_1')

    expect(response.status).toBe(200)
    expect(response.body.identifier).toBe('do_1')
  })

  it('returns 400 on failure', async () => {
    mockGetHierarchyV2WithContent.mockRejectedValueOnce(new Error('boom'))

    const response = await agent().get('/hierarchy/content/do_1')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ msg: 'Some error occurred' })
  })
})

describe('GET /hierarchy/multiple/:ids', () => {
  it('splits the comma-separated ids and returns the result', async () => {
    mockGetMultipleHierarchyV2.mockResolvedValueOnce([{ identifier: 'do_1' }, { identifier: 'do_2' }])

    const response = await agent().get('/hierarchy/multiple/do_1,do_2')

    expect(response.status).toBe(200)
    expect(mockGetMultipleHierarchyV2).toHaveBeenCalledWith(
      ['do_1', 'do_2'],
      'test-org',
      'test-root-org',
      expect.anything()
    )
    expect(response.body).toHaveLength(2)
  })

  it('returns 400 on failure', async () => {
    mockGetMultipleHierarchyV2.mockRejectedValueOnce(new Error('boom'))

    const response = await agent().get('/hierarchy/multiple/do_1,do_2')

    expect(response.status).toBe(400)
  })
})

describe('GET /hierarchy/multiple/content/:ids', () => {
  it('splits the comma-separated ids and returns the result', async () => {
    mockGetMultipleHierarchyV2WithContent.mockResolvedValueOnce([{ identifier: 'do_1' }])

    const response = await agent().get('/hierarchy/multiple/content/do_1')

    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(1)
  })

  it('returns 400 on failure', async () => {
    mockGetMultipleHierarchyV2WithContent.mockRejectedValueOnce(new Error('boom'))

    const response = await agent().get('/hierarchy/multiple/content/do_1')

    expect(response.status).toBe(400)
  })
})

describe('GET /hierarchy/content/translation/:id', () => {
  it('looks up other-language ids and returns their hierarchy+content', async () => {
    mockSearchForOtherLanguage.mockResolvedValueOnce(['do_2'])
    mockGetMultipleHierarchyV2WithContent.mockResolvedValueOnce([{ identifier: 'do_2' }])

    const response = await agent().get('/hierarchy/content/translation/do_1')

    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(1)
  })

  it('returns 400 when the language search fails', async () => {
    mockSearchForOtherLanguage.mockRejectedValueOnce(new Error('boom'))

    const response = await agent().get('/hierarchy/content/translation/do_1')

    expect(response.status).toBe(400)
  })
})

describe('POST /copy', () => {
  it('forwards the upstream response on success', async () => {
    mockAxiosCallable.mockResolvedValueOnce(upstreamOk({ copied: true }))

    const response = await agent().post('/copy').send({ location: 'a', destination: 'b' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ copied: true })
  })

  it('forwards the upstream error status/body on failure', async () => {
    mockAxiosCallable.mockRejectedValueOnce(upstreamError(502, { error: 'copy failed' }))

    const response = await agent().post('/copy').send({ location: 'a', destination: 'b' })

    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'copy failed' })
  })
})

describe('POST /encode', () => {
  it('forwards the upstream response on success', async () => {
    mockAxiosCallable.mockResolvedValueOnce(upstreamOk({ encoded: true }))

    const response = await agent()
      .post('/encode')
      .send({ text: 'hi', location: 'a/b', fileName: 'f.json' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ encoded: true })
  })

  it('forwards the upstream error status/body on failure', async () => {
    mockAxiosCallable.mockRejectedValueOnce(upstreamError(502, { error: 'encode failed' }))

    const response = await agent()
      .post('/encode')
      .send({ text: 'hi', location: 'a/b', fileName: 'f.json' })

    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'encode failed' })
  })

  // `body.location.split('/')` is called with no check that `location` was
  // provided. Missing it throws synchronously inside the (non-async) handler
  // function itself, which Express's router catches automatically (Layer
  // .handle_request wraps the call in try/catch) and forwards to its default
  // error middleware -> a safe, well-defined 500, not a hang or crash. Worth
  // fixing (a clean 400 would be friendlier) but not a live-test hazard.
  it('falls back to a 500 when location is missing (unvalidated input)', async () => {
    const response = await agent().post('/encode').send({ text: 'hi', fileName: 'f.json' })

    expect(response.status).toBe(500)
  })
})

describe('POST /upload/s3', () => {
  it('uploads each item and returns the combined result', async () => {
    mockUploadJSONData.mockResolvedValueOnce({
      artifactUrl: 'https://cdn.test/a',
      downloadUrl: 'https://cdn.test/a',
      error: null,
    })

    const response = await agent()
      .post('/upload/s3')
      .send([{ identfier: 'id-1', categoryType: 'quiz', mimeType: 'application/json', path: 'p', data: {} }])

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      { identifier: 'id-1', artifactUrl: 'https://cdn.test/a', downloadUrl: 'https://cdn.test/a', error: null },
    ])
  })
})

describe('POST /download/s3', () => {
  it('reads each item and returns the combined result', async () => {
    mockReadJSONData.mockResolvedValueOnce({ some: 'json' })

    const response = await agent()
      .post('/download/s3')
      .send([{ categoryType: 'quiz', mimeType: 'application/json', artifactUrl: 'a', identifier: 'id-1' }])

    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ content: { some: 'json' }, identifier: 'id-1' }])
  })
})

describe('POST /content/v3/create', () => {
  it('forwards the upstream response on success', async () => {
    mockAxiosCallable.mockResolvedValueOnce(upstreamOk({ identifier: 'do_1' }, 201))

    const response = await agent().post('/content/v3/create').send({ request: { content: {} } })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ identifier: 'do_1' })
  })

  it('forwards the upstream error status/body on failure', async () => {
    mockAxiosCallable.mockRejectedValueOnce(upstreamError(400, { error: 'create failed' }))

    const response = await agent().post('/content/v3/create').send({ request: { content: {} } })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'create failed' })
  })
})

describe('GET /content/v3/read/:id', () => {
  it('maps the response through returnData when status is successful', async () => {
    mockAxiosCallable.mockResolvedValueOnce(
      upstreamOk({ params: { status: 'successful' }, result: { content: {} } })
    )

    const response = await agent().get('/content/v3/read/do_1')

    expect(response.status).toBe(200)
    expect(response.body.mappedByReturnData).toBe(true)
  })

  it('skips returnData when status is not successful', async () => {
    mockAxiosCallable.mockResolvedValueOnce(upstreamOk({ params: { status: 'failed' } }))

    const response = await agent().get('/content/v3/read/do_1')

    expect(response.status).toBe(200)
    expect(response.body.mappedByReturnData).toBeUndefined()
    expect(response.body.params).toEqual({ status: 'failed' })
  })

  it('forwards the upstream error status/body on failure', async () => {
    mockAxiosCallable.mockRejectedValueOnce(upstreamError(404, { error: 'not found' }))

    const response = await agent().get('/content/v3/read/do_1')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })
})

describe('PATCH /content/v3/update/:id', () => {
  it('forwards the upstream response on success', async () => {
    mockAxiosCallable.mockResolvedValueOnce(upstreamOk({ updated: true }))

    const response = await agent().patch('/content/v3/update/do_1').send({ request: {} })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ updated: true })
  })

  it('forwards the upstream error status/body on failure', async () => {
    mockAxiosCallable.mockRejectedValueOnce(upstreamError(500, { error: 'update failed' }))

    const response = await agent().patch('/content/v3/update/do_1').send({ request: {} })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'update failed' })
  })
})

describe('catch-all fallthrough route', () => {
  it('proxies an unmatched path to the authoring backend on success', async () => {
    mockAxiosCallable.mockResolvedValueOnce(upstreamOk({ passthrough: true }))

    const response = await agent().get('/some/unmatched/path')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ passthrough: true })
  })

  it('forwards the upstream error status/body on failure', async () => {
    mockAxiosCallable.mockRejectedValueOnce(upstreamError(503, { error: 'backend down' }))

    const response = await agent().get('/some/unmatched/path')

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'backend down' })
  })
})
