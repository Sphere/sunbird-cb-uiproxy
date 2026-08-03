/**
 * PHASE 1 — src/utils/proxyCreator.ts (258 statements, 0% covered before this).
 *
 * Every exported function here ultimately calls http-proxy's `.web()` to
 * stream a real socket-level proxy — genuinely not testable by asserting on
 * an HTTP response the way every other file in this session has been.
 *
 * What IS testable, and is where all the actual per-function logic lives, is
 * the URL/target/header COMPUTATION that happens before `.web()` is called —
 * string rewriting on req.originalUrl, conditional branches, header building.
 * `http-proxy` is mocked so `.web()` becomes a spy rather than a real proxy,
 * and each route's handler is captured directly (bypassing Express/supertest
 * entirely) by passing a fake `route` whose `.all(path, handler)` just stores
 * the handler for direct invocation with plain req/res objects.
 *
 * `.on('proxyReq' | 'proxyRes' | 'error', ...)` is called on the proxy
 * instances AT MODULE LOAD TIME, so the mock must support `.on` too.
 */

const mockWeb = jest.fn()
const mockUploadWeb = jest.fn()
let onHandlers: Record<string, Function> = {}
let uploadOnHandlers: Record<string, Function> = {}

jest.mock('http-proxy', () => ({
  createProxyServer: jest.fn((opts) => {
    // The module creates two DISTINCT proxy servers: the shared `proxy` (no
    // opts / a timeout-only opts) and the upload-dedicated `uploadProxy`
    // ({ changeOrigin: true, ignorePath: false, secure: true }). Route calls
    // through `proxyCreator(timeout)` also create fresh instances sharing
    // mockWeb, since only uploadProxy's target matters separately.
    const isUploadProxy = opts && opts.ignorePath === false
    if (isUploadProxy) {
      return {
        on: (event: string, handler: Function) => { uploadOnHandlers[event] = handler },
        web: mockUploadWeb,
      }
    }
    return {
      on: (event: string, handler: Function) => { onHandlers[event] = handler },
      web: mockWeb,
    }
  }),
}))
jest.mock('jwt-decode')
jest.mock('../publicApi_v8/nodebbUser', () => ({ fetchnodebbUserDetails: jest.fn() }))
jest.mock('./dataAlterer', () => ({ returnData: jest.fn((data) => ({ transformed: data })) }))
jest.mock('./logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'realm:user:user-1'),
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('./env', () => ({ CONSTANTS: { SB_API_KEY: 'sb-api-key' } }))

import jwtDecode from 'jwt-decode'
import { fetchnodebbUserDetails } from '../publicApi_v8/nodebbUser'
import { returnData } from './dataAlterer'
import * as proxyCreator from './proxyCreator'

const mockJwtDecode = jwtDecode as jest.Mock
const mockFetchNodebbUser = fetchnodebbUserDetails as jest.Mock
const mockReturnData = returnData as jest.Mock

/**
 * Invokes `routeFactory(fakeRoute, ...args)` and returns the handler that was
 * registered via `route.all('/*', handler)`, so it can be called directly
 * with plain req/res doubles — no Express, no supertest, no real proxying.
 */
// tslint:disable-next-line: no-any
function captureHandler(routeFactory: (route: any, ...rest: any[]) => any, ...args: any[]) {
  let captured: Function | undefined
  // tslint:disable-next-line: no-any
  const fakeRoute: any = { all: (_path: string, handler: Function) => { captured = handler } }
  routeFactory(fakeRoute, ...args)
  if (!captured) {
    throw new Error('route.all was never called — routeFactory did not register a handler')
  }
  return captured
}

// tslint:disable-next-line: no-any
function mockRes(): any {
  const res: Record<string, unknown> = {
    end: jest.fn(),
    // tslint:disable-next-line: no-any
    json: jest.fn(function(this: any) { return this }),
    on: jest.fn(),
    // tslint:disable-next-line: no-any
    send: jest.fn(function(this: any) { return this }),
    // tslint:disable-next-line: no-any
    status: jest.fn(function(this: any) { return this }),
  }
  return res
}

beforeEach(() => {
  mockWeb.mockReset()
  mockUploadWeb.mockReset()
})

describe('module load', () => {
  it('registers proxyReq, proxyRes and upload error handlers without throwing', () => {
    // If this suite runs at all, module-level createProxyServer(...) and the
    // three .on(...) registrations already succeeded via the mock above.
    expect(onHandlers.proxyReq).toBeInstanceOf(Function)
    expect(onHandlers.proxyRes).toBeInstanceOf(Function)
    expect(uploadOnHandlers.error).toBeInstanceOf(Function)
  })

  it('proxyReq handler sets auth headers and forwards a JSON body', () => {
    const proxyReq = { setHeader: jest.fn(), write: jest.fn() }
    const req = { body: { a: 1 } }
    onHandlers.proxyReq(proxyReq, req, {}, {})
    expect(proxyReq.setHeader).toHaveBeenCalledWith('x-authenticated-user-token', 'token-1')
    expect(proxyReq.setHeader).toHaveBeenCalledWith('x-authenticated-userid', 'realm:user:user-1')
    expect(proxyReq.write).toHaveBeenCalledWith(JSON.stringify({ a: 1 }))
  })

  it('upload proxy error handler logs without throwing', () => {
    expect(() => uploadOnHandlers.error(new Error('boom'), {}, {})).not.toThrow()
  })

  it('upload proxy error handler stringifies a non-Error value without throwing', () => {
    expect(() => uploadOnHandlers.error('boom-string', {}, {})).not.toThrow()
  })

  it('proxyRes handler stores the nodebb auth token on the session for the create-user route', () => {
    const proxyRes = { headers: { nodebb_auth_token: 'nb-token-1' } }
    // tslint:disable-next-line: no-any
    const req: any = { originalUrl: '/discussion/user/v1/create', session: {} }
    onHandlers.proxyRes(proxyRes, req, mockRes())
    expect(req.session.nodebb_authorization_token).toBe('nb-token-1')
  })

  it('proxyRes handler does nothing when there is no session on the create-user route', () => {
    const proxyRes = { headers: { nodebb_auth_token: 'nb-token-1' } }
    const req = { originalUrl: '/discussion/user/v1/create' }
    expect(() => onHandlers.proxyRes(proxyRes, req, mockRes())).not.toThrow()
  })

  it('proxyRes handler buffers and transforms a hierarchy edit response before ending it', () => {
    // tslint:disable-next-line: no-any
    const dataHandlers: Record<string, Function> = {}
    const proxyRes = {
      // tslint:disable-next-line: no-any
      on: jest.fn((event: string, handler: Function) => { dataHandlers[event] = handler }),
    }
    const req = { originalUrl: '/content/v3/hierarchy?mode=edit&src=sunbird' }
    const res = mockRes()
    onHandlers.proxyRes(proxyRes, req, res)
    dataHandlers.data(Buffer.from('{"a":1}'))
    dataHandlers.end()
    expect(mockReturnData).toHaveBeenCalledWith({ a: 1 }, null, 'hierarchy')
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ transformed: { a: 1 } }))
  })
})

describe('proxyCreatorRoute', () => {
  it('proxies to the given target URL', () => {
    const handler = captureHandler(proxyCreator.proxyCreatorRoute, 'https://target.test')
    const req = { originalUrl: '/x', url: '/x' }
    handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(req, expect.anything(), { target: 'https://target.test' })
  })

  it('URL-encodes slashes after /download/', () => {
    const handler = captureHandler(proxyCreator.proxyCreatorRoute, 'https://target.test')
    const req = { originalUrl: '/download/a/b/c', url: '/download/a/b/c' }
    handler(req, mockRes())
    expect(req.url).toBe('/download/a%2Fb%2Fc')
  })
})

describe('getContentProxyCreatorRoute', () => {
  it('rewrites an https artifact URL to http and proxies to it', () => {
    const handler = captureHandler(proxyCreator.getContentProxyCreatorRoute)
    const req = { query: { artificatUrl: 'https://content.test/file.mp4' } }
    handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      { target: 'http://content.test/file.mp4' }
    )
  })
})

describe('ilpProxyCreatorRoute', () => {
  it('forwards the request headers to the target + path', () => {
    const handler = captureHandler(proxyCreator.ilpProxyCreatorRoute, 'https://ilp.test')
    const req = { headers: { authorization: 'Bearer x' }, url: '/foo' }
    handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(req, expect.anything(), {
      headers: { authorization: 'Bearer x' },
      target: 'https://ilp.test/foo',
    })
  })
})

describe('proxyCreatorLearner', () => {
  it('short-circuits /batch/create with a mock SUCCESS response, never proxying', () => {
    const handler = captureHandler(proxyCreator.proxyCreatorLearner, 'https://learner.test')
    const req = { originalUrl: '/proxies/v8/learner/batch/create' }
    const res = mockRes()
    handler(req, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ result: expect.objectContaining({ response: 'SUCCESS' }) })
    )
    expect(mockWeb).not.toHaveBeenCalled()
  })

  it('proxies every other path to targetUrl + the stripped path', () => {
    const handler = captureHandler(proxyCreator.proxyCreatorLearner, 'https://learner.test')
    const req = { originalUrl: '/proxies/v8/learner/course/list' }
    handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      expect.objectContaining({ target: 'https://learner.test/course/list' })
    )
  })
})

describe('proxyCreatorSunbird', () => {
  it('appends the nodebb uid as a query param', () => {
    const handler = captureHandler(proxyCreator.proxyCreatorSunbird, 'https://sunbird.test')
    const req = { originalUrl: '/proxies/v8/content/v1/read', session: { nodebbUid: 'nb-1' } }
    handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      expect.objectContaining({ target: 'https://sunbird.test/content/v1/read?_uid=nb-1' })
    )
  })

  it('appends with & when the URL already has a query string', () => {
    const handler = captureHandler(proxyCreator.proxyCreatorSunbird, 'https://sunbird.test')
    const req = {
      originalUrl: '/proxies/v8/content/v1/read?lang=en',
      session: { nodebbUid: 'nb-1' },
    }
    handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      expect.objectContaining({ target: 'https://sunbird.test/content/v1/read?lang=en&_uid=nb-1' })
    )
  })

  it('collapses a duplicated discussion/topic path segment', () => {
    const handler = captureHandler(proxyCreator.proxyCreatorSunbird, 'https://sunbird.test')
    // segments: 0 1 2 3 4 discussion topic topic <-- [5]==[6], should collapse
    const req = {
      originalUrl: '/a/b/c/discussion/topic/topic/extra',
      session: { nodebbUid: 'nb-1' },
    }
    handler(req, mockRes())
    expect(req.originalUrl).toBe('/a/b/c/discussion/topic/extra')
  })
})

describe('proxyCreatorDiscussionSunbird', () => {
  it('decodes the token, resolves the nodebb uid, and proxies', async () => {
    mockJwtDecode.mockReturnValue({ name: 'Test', preferred_username: 'test', sub: 'realm:user:u1' })
    mockFetchNodebbUser.mockResolvedValue('nb-42')
    const handler = captureHandler(proxyCreator.proxyCreatorDiscussionSunbird, 'https://discuss.test')
    const req = { originalUrl: '/proxies/v8/discussion/posts', session: {} }
    await handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      expect.objectContaining({ target: 'https://discuss.test/discussion/posts?_uid=nb-42' })
    )
  })

  it('returns 401 without proxying when no access token is present', async () => {
    const { extractUserToken } = require('../utils/requestExtract')
    extractUserToken.mockReturnValueOnce(undefined)
    const handler = captureHandler(proxyCreator.proxyCreatorDiscussionSunbird, 'https://discuss.test')
    const res = mockRes()
    await handler({ originalUrl: '/proxies/v8/discussion/posts', session: {} }, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(mockWeb).not.toHaveBeenCalled()
  })

  it('logs the raw error and returns 401 when a non-Error value is thrown', async () => {
    mockJwtDecode.mockImplementationOnce(() => { throw 'boom-string' })
    const handler = captureHandler(proxyCreator.proxyCreatorDiscussionSunbird, 'https://discuss.test')
    const res = mockRes()
    await handler({ originalUrl: '/proxies/v8/discussion/posts', session: {} }, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(mockWeb).not.toHaveBeenCalled()
  })

  it('strips a /uid segment from the URL before proxying', async () => {
    mockJwtDecode.mockReturnValue({ name: 'Test', preferred_username: 'test', sub: 'realm:user:u1' })
    mockFetchNodebbUser.mockResolvedValue('nb-99')
    const handler = captureHandler(proxyCreator.proxyCreatorDiscussionSunbird, 'https://discuss.test')
    const req = { originalUrl: '/proxies/v8/discussion/uid/posts', session: {} }
    await handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      expect.objectContaining({ target: 'https://discuss.test/discussion/posts?_uid=nb-99' })
    )
  })

  it('collapses a duplicated discussion/topic path segment before proxying', async () => {
    mockJwtDecode.mockReturnValue({ name: 'Test', preferred_username: 'test', sub: 'realm:user:u1' })
    mockFetchNodebbUser.mockResolvedValue('nb-100')
    const handler = captureHandler(proxyCreator.proxyCreatorDiscussionSunbird, 'https://discuss.test')
    const req = { originalUrl: '/proxies/v8/x/discussion/topic/topic/extra', session: {} }
    await handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      expect.objectContaining({ target: 'https://discuss.test/x/discussion/topic/extra?_uid=nb-100' })
    )
  })

  it('appends the nodebb uid with & when the cleaned URL already has a query string', async () => {
    mockJwtDecode.mockReturnValue({ name: 'Test', preferred_username: 'test', sub: 'realm:user:u1' })
    mockFetchNodebbUser.mockResolvedValue('nb-101')
    const handler = captureHandler(proxyCreator.proxyCreatorDiscussionSunbird, 'https://discuss.test')
    const req = { originalUrl: '/proxies/v8/discussion/posts?foo=bar', session: {} }
    await handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      expect.objectContaining({ target: 'https://discuss.test/discussion/posts?foo=bar&_uid=nb-101' })
    )
  })
})

describe('proxyCreatorKnowledge', () => {
  it('routes hierarchy/add to the private add-hierarchy endpoint', async () => {
    const handler = captureHandler(proxyCreator.proxyCreatorKnowledge, 'https://kb.test')
    const req = { originalUrl: '/proxies/v8/content/v3/hierarchy/add' }
    await handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      expect.objectContaining({ target: 'https://kb.test/private/content/v3/hierarchy/add' })
    )
  })

  it('routes everything else to targetUrl + the stripped path', async () => {
    const handler = captureHandler(proxyCreator.proxyCreatorKnowledge, 'https://kb.test')
    const req = { originalUrl: '/proxies/v8/content/v3/read/do_1' }
    await handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      expect.objectContaining({ target: 'https://kb.test/content/v3/read/do_1' })
    )
  })
})

describe('proxyHierarchyKnowledge', () => {
  it('transforms the body via returnData for a hierarchy/update request', () => {
    const handler = captureHandler(proxyCreator.proxyHierarchyKnowledge, 'https://kb.test')
    const req = { body: { some: 'data' }, originalUrl: '/proxies/v8/content/v3/hierarchy/update' }
    handler(req, mockRes())
    expect(mockReturnData).toHaveBeenCalledWith({ some: 'data' }, null, 'hierarchy')
    expect(req.body).toEqual({ transformed: { some: 'data' } })
  })

  it('KNOWN ISSUE: calls proxy.web TWICE for a hierarchy edit-mode request', () => {
    // The ?mode=edit branch calls proxy.web(...) inside the `if`, then an
    // IDENTICAL unconditional proxy.web(...) call follows immediately after
    // with no `else`/`return` — so this specific URL shape proxies the same
    // request twice. Documented as current behaviour; see
    // docs/PROD-VERIFICATION.md.
    const handler = captureHandler(proxyCreator.proxyHierarchyKnowledge, 'https://kb.test')
    const req = { body: {}, originalUrl: '/proxies/v8/content/v3/hierarchy?mode=edit' }
    handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledTimes(2)
  })

  it('calls proxy.web once for a non-edit-mode request', () => {
    const handler = captureHandler(proxyCreator.proxyHierarchyKnowledge, 'https://kb.test')
    const req = { body: {}, originalUrl: '/proxies/v8/content/v3/read/do_1' }
    handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledTimes(1)
  })
})

describe('proxyCreatorToAppentUserId', () => {
  it("appends the token's userId for a bare /read request", () => {
    const handler = captureHandler(proxyCreator.proxyCreatorToAppentUserId, 'https://kong.test/user/v2/read/')
    const req = { originalUrl: '/proxies/v8/user/v2/read' }
    handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      expect.objectContaining({ target: 'https://kong.test/user/v2/read/user-1' })
    )
  })

  it('appends the explicit userId from the URL otherwise', () => {
    const handler = captureHandler(proxyCreator.proxyCreatorToAppentUserId, 'https://kong.test/user/v2/read/')
    const req = { originalUrl: '/proxies/v8/user/v2/read/explicit-id' }
    handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      expect.objectContaining({ target: 'https://kong.test/user/v2/read/explicit-id' })
    )
  })
})

describe('proxyCreatorQML', () => {
  it('strips the urlType marker and the proxy slug before proxying', () => {
    const handler = captureHandler(proxyCreator.proxyCreatorQML, 'https://qml.test', '/api/')
    const req = { originalUrl: '/proxies/v8/api/quiz/1' }
    handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      expect.objectContaining({ target: 'https://qml.test/quiz/1' })
    )
  })
})

describe('proxyContent', () => {
  it('strips the /private prefix before proxying', () => {
    const handler = captureHandler(proxyCreator.proxyContent, 'https://content.test')
    const req = { originalUrl: '/proxies/v8/private/asset/1' }
    handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      expect.objectContaining({ target: 'https://content.test/asset/1' })
    )
  })
})

describe('proxyContentLearnerVM', () => {
  it('strips the /learnervm/private prefix before proxying', () => {
    const handler = captureHandler(proxyCreator.proxyContentLearnerVM, 'https://vm.test')
    const req = { originalUrl: '/proxies/v8/learnervm/private/asset/1' }
    handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      expect.objectContaining({ target: 'https://vm.test/asset/1' })
    )
  })
})

describe('proxyCreatorDownloadCertificate', () => {
  it('proxies to targetUrl + the segment after the final slash', () => {
    const handler = captureHandler(proxyCreator.proxyCreatorDownloadCertificate, 'https://cert.test/')
    const req = { originalUrl: '/proxies/v8/certs/download/cert-123' }
    handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      expect.objectContaining({ target: 'https://cert.test/cert-123' })
    )
  })
})

describe('proxyCreatorForms', () => {
  it('proxies to the local forms service, stripping the forms slug', () => {
    const handler = captureHandler(proxyCreator.proxyCreatorForms)
    const req = { originalUrl: '/proxies/v8/ext-forms/get' }
    handler(req, mockRes())
    // NOTE: PROXY_SLUG_FORMS ('/proxies/v8/ext-forms') has no trailing slash,
    // and removePrefix leaves the leading '/' on the remainder ('/get'), so
    // concatenating onto 'http://localhost:3003/' produces a double slash.
    // Harmless (most HTTP servers normalise it) but pinned as actual behaviour.
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      { target: 'http://localhost:3003//get' }
    )
  })
})

describe('scormProxyCreatorRoute', () => {
  it('proxies directly to the base URL', () => {
    const handler = captureHandler(proxyCreator.scormProxyCreatorRoute, 'https://scorm.test')
    handler({ originalUrl: '/x' }, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { target: 'https://scorm.test' }
    )
  })
})

describe('proxyCreatorUpload', () => {
  it('strips the action slug before proxying', () => {
    const handler = captureHandler(proxyCreator.proxyCreatorUpload, 'https://upload.test')
    const req = { originalUrl: '/proxies/v8/action/upload/1' }
    handler(req, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      expect.objectContaining({ target: 'https://upload.test/upload/1' })
    )
  })
})

describe('proxyCreatorSunbirdSearch', () => {
  it('proxies directly to the target URL', () => {
    const handler = captureHandler(proxyCreator.proxyCreatorSunbirdSearch, 'https://search.test')
    handler({ originalUrl: '/x' }, mockRes())
    expect(mockWeb).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ target: 'https://search.test' })
    )
  })
})

describe('proxyCreatorEtlFracUpload', () => {
  it('streams via the dedicated upload proxy with auth + content headers', () => {
    const handler = captureHandler(proxyCreator.proxyCreatorEtlFracUpload, 'https://kong.test')
    const req = {
      headers: { 'content-length': '1024', 'content-type': 'multipart/form-data' },
      originalUrl: '/proxies/v8/entity/v1/upload',
    }
    handler(req, mockRes())
    expect(mockUploadWeb).toHaveBeenCalledWith(
      req,
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Length': '1024',
          'Content-Type': 'multipart/form-data',
          'x-authenticated-user-token': 'token-1',
          'x-authenticated-userid': 'realm:user:user-1',
        }),
        target: 'https://kong.test/entity/v1/upload',
      })
    )
    expect(mockWeb).not.toHaveBeenCalled()
  })
})

describe('proxyCreatorEtlFrac', () => {
  it('proxies entity API calls with auth headers', () => {
    const handler = captureHandler(proxyCreator.proxyCreatorEtlFrac, 'https://kong.test')
    const req = { originalUrl: '/proxies/v8/entity/v1/search', send: jest.fn() }
    const res = mockRes()
    handler(req, res)
    expect(mockWeb).toHaveBeenCalledWith(
      req,
      res,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'sb-api-key' }),
        target: 'https://kong.test/entity/v1/search',
      })
    )
  })

  it('wraps res.send to log a success response without altering its output', () => {
    const handler = captureHandler(proxyCreator.proxyCreatorEtlFrac, 'https://kong.test')
    const req = { originalUrl: '/proxies/v8/entity/v1/search' }
    const res = mockRes()
    res.statusCode = 200
    handler(req, res)
    const result = res.send('payload')
    expect(result).toBe(res)
  })

  it('logs entity API errors via the registered res error handler', () => {
    const { logError } = require('./logger')
    const handler = captureHandler(proxyCreator.proxyCreatorEtlFrac, 'https://kong.test')
    const req = { originalUrl: '/proxies/v8/entity/v1/search' }
    const res = mockRes()
    // tslint:disable-next-line: no-any
    const onSpy = jest.fn()
    res.on = onSpy
    handler(req, res)
    // tslint:disable-next-line: no-any
    const errorHandler = onSpy.mock.calls.find((call: any[]) => call[0] === 'error')[1]
    errorHandler(new Error('kong down'))
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('kong down'))
  })

  it("logs 'Unknown' when the res error event carries no message", () => {
    const { logError } = require('./logger')
    const handler = captureHandler(proxyCreator.proxyCreatorEtlFrac, 'https://kong.test')
    const req = { originalUrl: '/proxies/v8/entity/v1/search' }
    const res = mockRes()
    // tslint:disable-next-line: no-any
    const onSpy = jest.fn()
    res.on = onSpy
    handler(req, res)
    // tslint:disable-next-line: no-any
    const errorHandler = onSpy.mock.calls.find((call: any[]) => call[0] === 'error')[1]
    errorHandler({})
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('Unknown'))
  })
})
