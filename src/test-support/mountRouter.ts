/**
 * Mounts an exported Express Router on a bare app for testing.
 *
 * Route handlers in this codebase export a Router (e.g. `export const counterApi
 * = Router()`), so a test can exercise the real handler over real HTTP without
 * booting src/server.ts — which would open sockets, connect to Cassandra and
 * wire up Keycloak.
 *
 * Uses supertest, already a devDependency; no new package is required.
 *
 *   const agent = mountRouter(counterApi)
 *   await agent.get('/').expect(200)
 *
 * Assert on the HTTP RESPONSE (status + body), not on how the handler reached
 * it. Tests that assert call counts on mocked axios tend to restate the
 * implementation rather than protect behaviour.
 */

import express, { Router } from 'express'
import http from 'http'
import supertest from 'supertest'

export interface MountOptions {
  /** Values merged onto req.session, for handlers that read session state. */
  // tslint:disable-next-line: no-any
  session?: any
  /** Values merged onto the request object itself, e.g. kauth for Keycloak. */
  // tslint:disable-next-line: no-any
  requestProps?: any
  /**
   * Mount path, matching where server.ts actually mounts this router (e.g.
   * '/proxies/v8'). Only needed when a handler derives behaviour from
   * req.originalUrl or req.baseUrl — e.g. proxies_v8.ts's removePrefix()
   * assumes '/proxies/v8/...' is present. Defaults to '/' (flat mount), which
   * is correct for the common case of routers whose handlers only use
   * req.path / req.params / req.query.
   */
  basePath?: string
}

/**
 * Reused across repeated no-override `mountRouter(router)` calls (the
 * overwhelming majority of call sites — most test files call `agent()` fresh
 * per `it()` block). Without this, supertest spins up a brand-new
 * ephemeral-port server via `listen(0)` and tears it down via `close()` for
 * EVERY request, since it only reuses an already-listening server when one is
 * passed in. At suite scale (1000+ tests) that's 1000+ listen/close cycles in
 * a few seconds, which produced rare cross-talk between concurrently
 * churning servers — see "Known flakiness" in docs/sonarqube.md. Keying by
 * (router, basePath) and reusing one long-lived server cuts that down to
 * roughly one per test file.
 *
 * Deliberately never explicitly closed: `agent()` is normally called from
 * inside `it()` blocks, and Jest hook registration (`afterAll` etc.) is only
 * valid during the collection phase, not from a running test — registering
 * it lazily on first use hangs the runner. Each cached server is reclaimed
 * when the process exits; the tradeoff (a handful of open handles at process
 * exit vs. 1000+ listen/close races mid-run) is the right one here.
 *
 * Calls that pass `session`/`requestProps` are deliberately NOT cached —
 * those exist to get isolated request-scoped state (fresh jest.fn() mocks
 * per test), so they keep the original fresh-app-per-call behavior.
 */
const sharedServers = new WeakMap<Router, Map<string, http.Server>>()

function getSharedServer(router: Router, basePath: string, app: express.Express): http.Server {
  let byBasePath = sharedServers.get(router)
  if (!byBasePath) {
    byBasePath = new Map()
    sharedServers.set(router, byBasePath)
  }
  let server = byBasePath.get(basePath)
  if (!server) {
    server = app.listen(0)
    byBasePath.set(basePath, server)
  }
  return server
}

export function mountRouter(router: Router, options: MountOptions = {}) {
  const app = express()
  app.use(express.json())

  // Injected before the router so handlers see session/kauth exactly as they
  // would behind the real session and Keycloak middleware.
  if (options.session || options.requestProps) {
    app.use((req, _res, next) => {
      if (options.session) {
        // tslint:disable-next-line: no-any
        (req as any).session = { ...((req as any).session || {}), ...options.session }
      }
      if (options.requestProps) {
        Object.assign(req, options.requestProps)
      }
      next()
    })
  }

  app.use(options.basePath || '/', router)

  if (options.session || options.requestProps) {
    return supertest(app)
  }

  const server = getSharedServer(router, options.basePath || '/', app)
  return supertest(server)
}
