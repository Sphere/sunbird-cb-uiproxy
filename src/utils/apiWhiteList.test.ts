/**
 * PHASE 1 — apiWhiteList.ts (124 uncovered).
 *
 * Pure Express middleware — `isAllowed()` and `apiWhiteListLogger()` each
 * return a `(req, res, next)` function. Called directly with plain req/res/next
 * doubles; no Express app or supertest needed.
 *
 * Uses the REAL API_LIST from ./whitelistApis rather than a mock — it is
 * static authorization config, and faking it would just re-describe the same
 * data less faithfully. '/protected/v8/user/details' is a real entry
 * requiring ROLE_CHECK: [PUBLIC]. Chosen deliberately: many API_LIST paths
 * contain a substring ('/content/', '/assets/', etc.) that checkIsStaticRoute
 * treats as a static asset, bypassing the whitelist logic entirely — this one
 * does not, so it actually exercises the ROLE_CHECK path.
 */

jest.mock('./logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
// CONSTANTS.PORTAL_API_WHITELIST_CHECK defaults to 'false' in env.ts (a plain
// string captured once at module load), which would make isAllowed() call
// next() unconditionally for everything. Forced to 'true' here so the actual
// whitelist logic under test runs. Setting process.env would NOT work — env.ts
// has already evaluated by the time a test could set it.
jest.mock('./env', () => ({
  CONSTANTS: { PORTAL_API_WHITELIST_CHECK: 'true' },
}))

import { apiWhiteListLogger, isAllowed } from './apiWhiteList'

// tslint:disable-next-line: no-any
function mockReqRes(overrides: any = {}) {
  const req = {
    get: jest.fn(() => 'host.test'),
    path: '/',
    query: {},
    session: {},
    ...overrides,
  }
  const res = {
    end: jest.fn(),
    send: jest.fn(),
    setHeader: jest.fn(),
    status: jest.fn(function(this: unknown) { return this }),
  }
  const next = jest.fn()
  return { next, req, res }
}

describe('isAllowed', () => {
  it('calls next() unconditionally for a static asset path', () => {
    const { req, res, next } = mockReqRes({ path: '/assets/logo.png' })
    isAllowed()(req as any, res as any, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('calls next() for the root path', () => {
    const { req, res, next } = mockReqRes({ path: '/' })
    isAllowed()(req as any, res as any, next)
    expect(next).toHaveBeenCalled()
  })

  it('calls next() for any /resource path', () => {
    const { req, res, next } = mockReqRes({ path: '/protected/v8/resource/x' })
    isAllowed()(req as any, res as any, next)
    expect(next).toHaveBeenCalled()
  })

  it('responds 403 for a non-whitelisted path', () => {
    const { req, res, next } = mockReqRes({ path: '/not/a/real/route' })
    isAllowed()(req as any, res as any, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('allows a whitelisted PUBLIC-role route when the session has PUBLIC', async () => {
    const { req, res, next } = mockReqRes({
      path: '/protected/v8/user/details',
      session: { userRoles: ['PUBLIC'] },
    })
    isAllowed()(req as any, res as any, next)
    // ROLE_CHECK resolves via a promise chain; flush microtasks.
    await new Promise((resolve) => setImmediate(resolve))
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('rejects a whitelisted route when the session lacks the required role', async () => {
    const { req, res, next } = mockReqRes({
      path: '/protected/v8/user/details',
      session: { userRoles: [] },
    })
    isAllowed()(req as any, res as any, next)
    await new Promise((resolve) => setImmediate(resolve))
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})

describe('apiWhiteListLogger', () => {
  it('calls next() for the root path without checking session', () => {
    const { req, res, next } = mockReqRes({ path: '/', session: undefined })
    apiWhiteListLogger()(req as any, res as any, next)
    expect(next).toHaveBeenCalled()
  })

  it('calls next() for a static asset path', () => {
    const { req, res, next } = mockReqRes({ path: '/assets/x.png' })
    apiWhiteListLogger()(req as any, res as any, next)
    expect(next).toHaveBeenCalled()
  })

  it('calls next() for a public path', () => {
    const { req, res, next } = mockReqRes({ path: '/public/v8/home' })
    apiWhiteListLogger()(req as any, res as any, next)
    expect(next).toHaveBeenCalled()
  })

  it('calls next() when there is no session at all', () => {
    const { req, res, next } = mockReqRes({ path: '/authApi/x', session: undefined })
    apiWhiteListLogger()(req as any, res as any, next)
    expect(next).toHaveBeenCalled()
  })

  it('responds 419 when the session has no roles', () => {
    const { req, res, next } = mockReqRes({
      path: '/protected/v8/user/details',
      session: {},
    })
    apiWhiteListLogger()(req as any, res as any, next)
    expect(res.status).toHaveBeenCalledWith(419)
    expect(next).not.toHaveBeenCalled()
  })

  it('responds 419 when userRoles is empty', () => {
    const { req, res, next } = mockReqRes({
      path: '/protected/v8/user/details',
      session: { userRoles: [] },
    })
    apiWhiteListLogger()(req as any, res as any, next)
    expect(res.status).toHaveBeenCalledWith(419)
  })

  it('sends a plain logout message for a /reset path when unauthenticated', () => {
    const { req, res, next } = mockReqRes({
      path: '/authApi/reset/session',
      session: {},
    })
    apiWhiteListLogger()(req as any, res as any, next)
    expect(res.send).toHaveBeenCalledWith('You are logged out!')
  })

  it('validates the API when the session has roles', () => {
    const { req, res, next } = mockReqRes({
      path: '/protected/v8/user/details',
      session: { userRoles: ['PUBLIC'] },
    })
    apiWhiteListLogger()(req as any, res as any, next)
    expect(next).toHaveBeenCalled()
  })

  it('responds 403 when a roled session hits an unwhitelisted path', () => {
    const { req, res, next } = mockReqRes({
      path: '/not/a/real/route',
      session: { userRoles: ['PUBLIC'] },
    })
    apiWhiteListLogger()(req as any, res as any, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })
})
