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

  it('responds 403 with the FORBIDDEN error body for a non-whitelisted path', () => {
    const { req, res, next } = mockReqRes({ path: '/not/a/real/route' })
    isAllowed()(req as any, res as any, next)
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        responseCode: 'FORBIDDEN',
        result: {},
        params: expect.objectContaining({ err: 'FORBIDDEN_ERROR', status: 'failed' }),
      }),
    )
    expect(res.end).toHaveBeenCalled()
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

  // '/reset' is a real API_LIST.URL entry with `checksNeeded: []` (one of only
  // three such entries in the whole config; the other two are the /v1/form
  // routes). This exercises the `_.isEmpty(URL_RULE_OBJ.checksNeeded)` branch
  // that calls next() directly, without building any check promises at all —
  // distinct from the ROLE_CHECK-resolves path already covered above.
  it('calls next() immediately for a whitelisted route whose config needs no checks', () => {
    const { req, res, next } = mockReqRes({ path: '/reset', session: {} })
    isAllowed()(req as any, res as any, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  // NOTE (left uncovered on purpose, not a live-test candidate):
  // urlChecks.ROLE_CHECK's `_.includes(rolesForURL, 'ALL') && data.length > 0`
  // branch (source line 61) can only be reached if some API_LIST entry's
  // ROLE_CHECK array contains the literal string 'ALL'. Checked the full
  // whitelistApis.ts (ROLE enum + every ROLE_CHECK usage): no entry ever
  // uses 'ALL' as a role. So this branch is unreachable via any real,
  // currently-configured route and cannot be exercised live without either
  // editing whitelistApis.ts (a shared data file, out of scope here) or
  // fabricating a fake API_LIST entry (which would misrepresent what the
  // live config actually does). Dead code under the current config, not a
  // access-control bypass — data.length > 0 with 'ALL' would still require a
  // non-empty session role list, it just never gets the chance to run.

  // '/authContent/:do_id' is a real URL_PATTERN entry mapped (via
  // pathToRegexp) back onto the literal '/authContent/:do_id' key in
  // API_LIST.URL (a PUBLIC_ROLE_RULE route). A concrete request path like
  // '/authContent/do_123' never appears verbatim in API_LIST.URL, so this
  // is the only way to reach it: exercises the URL_PATTERN rewrite loop
  // (source lines 223-230) that the tests above never trigger, since they
  // all use paths already whitelisted verbatim.
  it('resolves a dynamic path through URL_PATTERN to its whitelisted rule', async () => {
    const { req, res, next } = mockReqRes({
      path: '/authContent/do_123',
      session: { userRoles: ['PUBLIC'] },
    })
    isAllowed()(req as any, res as any, next)
    await new Promise((resolve) => setImmediate(resolve))
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('rejects a dynamic path resolved through URL_PATTERN when the role is missing', async () => {
    const { req, res, next } = mockReqRes({
      path: '/authContent/do_123',
      session: { userRoles: [] },
    })
    isAllowed()(req as any, res as any, next)
    await new Promise((resolve) => setImmediate(resolve))
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  // req.session is entirely absent (not just an empty object) for this
  // whitelisted-but-role-checked route. `_.get(req, 'session.userRoles')`
  // returns undefined, falling to the `: []` fallback in ROLE_CHECK — a
  // distinct branch from the `session: { userRoles: [] }` case above, which
  // takes the truthy-but-empty-array path through the same ternary instead.
  it('rejects a whitelisted role-checked route when there is no session object at all', async () => {
    const { req, res, next } = mockReqRes({
      path: '/protected/v8/user/details',
      session: undefined,
    })
    isAllowed()(req as any, res as any, next)
    await new Promise((resolve) => setImmediate(resolve))
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  // NOTE (left uncovered on purpose, not a live-test candidate):
  // executeChecks' (source lines 111-136) own internal branches beyond the
  // two already exercised above (the ROLE_CHECK-resolves next() path and the
  // ROLE_CHECK-rejects respond403 path) are unreachable through any real
  // request:
  //   - line 111's `checksToExecute: any = []` default parameter never
  //     applies — executeChecks is a private, unexported function with
  //     exactly one call site (isAllowed(), source line 253), which always
  //     passes an explicit array built from urlChecksNeeded.forEach(...).
  //   - line 117's `if (pSuccess) { ... } else { throw ... }` false branch
  //     (line 125) requires Promise.allSettled(...) to resolve to a falsy
  //     value. Verified directly in Node: Promise.allSettled always resolves
  //     to an array (truthy), even for an empty input array — there is no
  //     real `checksToExecute` value that makes this resolve falsy.
  //   - lines 133-135's outer try/catch only catches a *synchronous* throw
  //     from calling `(Promise as any).allSettled(...)` itself, not a
  //     rejection anywhere inside the .then()/.catch() chain (rejections
  //     there — e.g. from the line 120/125 throws — are already caught by
  //     the inner `.catch((pError) => ...)` on line 129, which also calls
  //     respond403, verified with `Promise.allSettled(null)` in Node:
  //     it rejects into the inner catch, not the outer one).
  // Reaching any of these three would require mocking Promise.allSettled
  // itself to lie about its own resolution behavior, which would test a
  // fabricated runtime rather than this file's real logic — consistent with
  // this suite's existing convention (see the SCOPE_CHECK note below) of
  // documenting genuinely unreachable-under-live-config branches rather than
  // forcing an artificial test around them.

  // NOTE (left uncovered on purpose, not a live-test candidate):
  // urlChecks.SCOPE_CHECK (source lines 70-94) is likewise unreachable via
  // any real route today. It IS wired into one config entry's data
  // ('/protected/v8/workallocation/getWorkOrderById/:workOrderId' has a
  // SCOPE_CHECK: [MDO_ADMIN] property), but isAllowed() only ever invokes a
  // urlChecks.<CHECK> function when it appears in that entry's
  // `checksNeeded` array — and that route's checksNeeded is `[CHECK.ROLE]`
  // only, never `[CHECK.SCOPE]`. Grepping the entire 1928-line
  // whitelistApis.ts confirms checksNeeded is always either `[CHECK.ROLE]`
  // or `[]` — CHECK.SCOPE never appears in any checksNeeded array anywhere.
  // So SCOPE_CHECK's own logic is entirely dead code under the live config:
  // that route is effectively protected by ROLE_CHECK: [PUBLIC] alone, and
  // the org-scoped MDO_ADMIN restriction its data suggests was intended is
  // never enforced. Flagging this as a real finding (see final report) —
  // not something to "fix" by writing a test that pretends it runs.
})

// The module-level `jest.mock('./env', ...)` above forces
// PORTAL_API_WHITELIST_CHECK to 'true' for every test in this file, which is
// necessary so the ROLE_CHECK/SCOPE_CHECK/whitelist logic above actually
// runs instead of always short-circuiting to next(). To cover the opposite
// branch (whitelist checking disabled entirely), this describe uses the same
// jest.resetModules() + require() pattern already established in
// firebase-manager.test.ts to load a fresh copy of the module with a
// different CONSTANTS value, scoped to just this one test. The already-bound
// `isAllowed`/`apiWhiteListLogger` imported at the top of this file are
// plain object references captured at initial module load, so they keep
// their original ('true') closure regardless of resetModules() being called
// later — this does not affect any other test in this file.
describe('isAllowed with API whitelist checking turned off', () => {
  it('calls next() unconditionally when PORTAL_API_WHITELIST_CHECK is not "true"', () => {
    jest.resetModules()
    jest.doMock('./env', () => ({
      CONSTANTS: { PORTAL_API_WHITELIST_CHECK: 'false' },
    }))
    // tslint:disable-next-line: no-var-requires
    const { isAllowed: isAllowedWhenDisabled } = require('./apiWhiteList')
    const { req, res, next } = mockReqRes({ path: '/not/a/real/route' })
    isAllowedWhenDisabled()(req as any, res as any, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
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

  it('calls next() for an /admin/selfService path without checking session', () => {
    const { req, res, next } = mockReqRes({ path: '/admin/selfService/x', session: undefined })
    apiWhiteListLogger()(req as any, res as any, next)
    expect(next).toHaveBeenCalled()
  })

  it('calls next() for a /socket.io path without checking session', () => {
    const { req, res, next } = mockReqRes({ path: '/socket.io/x', session: undefined })
    apiWhiteListLogger()(req as any, res as any, next)
    expect(next).toHaveBeenCalled()
  })

  it('calls next() for a /resource path even with an unauthenticated session', () => {
    const { req, res, next } = mockReqRes({ path: '/protected/v8/resource/x', session: {} })
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

  // Exercises the else-branch of respond419 (any non-'/reset' path), which
  // builds a 'location' header via redirectToLogin(req) using req.get('host').
  it('sends a 419 body with a redirect location built from the request host for a non-reset path', () => {
    const { req, res, next } = mockReqRes({
      path: '/protected/v8/user/details',
      session: {},
      get: jest.fn(() => 'my.host.example'),
    })
    apiWhiteListLogger()(req as any, res as any, next)
    expect(res.setHeader).toHaveBeenCalledWith(
      'location',
      'https://my.host.example/protected/v8/resource/',
    )
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        responseCode: 'UNAUTHORIZED',
        redirectUrl: 'https://my.host.example/protected/v8/resource/',
        params: expect.objectContaining({ err: 'UNAUTHORIZED_ERROR', status: 'failed' }),
      }),
    )
    expect(res.end).toHaveBeenCalled()
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
