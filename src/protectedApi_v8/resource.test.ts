/**
 * resource.ts — one route.
 *
 * GET / builds a redirect URL from the request's Host header and an
 * optional `q` query param:
 *   - If req.query is empty, queryParam stays '' and the handler redirects
 *     to `https://${host}` (isLocal is never set).
 *   - If req.query is non-empty, queryParam is set to req.query.q. When
 *     that string contains 'localhost', isLocal is set and the handler
 *     redirects to queryParam verbatim (no host prefix). Otherwise it
 *     redirects to `https://${host}${queryParam}`.
 *   - res.redirect() is called exactly once on every path; there is no
 *     try/catch because nothing here is expected to reject (no axios/service
 *     call), so the success-shape tests below cover the whole handler.
 *
 * DANGEROUS PATTERN — NOT reproduced live: when req.query is non-empty but
 * has no `q` key (e.g. `GET /?foo=bar`), `queryParam = req.query.q`
 * evaluates to `undefined`, and the very next line calls
 * `queryParam.includes('localhost')` unguarded — no try/catch anywhere in
 * this handler. That throws a TypeError synchronously inside an `async`
 * route handler, which Express 4 does not catch; it becomes an unhandled
 * promise rejection and res.redirect() is never reached, so the request
 * hangs with no response (Pattern B/C territory). Same hazard if `q` is
 * supplied as a nested object (e.g. `?q[x]=1`, parsed as `{x: '1'}`, which
 * also has no `.includes` method). See the report back to the requester for
 * this file/line detail to record in docs/PROD-VERIFICATION.md.
 */

import { mountRouter } from '../test-support/mountRouter'
import { userAuthKeyCloakApi } from './resource'

const agent = () => mountRouter(userAuthKeyCloakApi)

/**
 * @description Verifies that GET / redirects using the request's Host
 * header and the `q` query param: no host-prefixed redirect when the query
 * string is empty, a host-prefixed redirect when `q` doesn't contain
 * 'localhost', and a verbatim redirect to `q` itself when it does.
 */
describe('GET /', () => {
  it('should redirect to https://<host> with no path when there is no query string', async () => {
    const response = await agent().get('/').set('host', 'sphere.test')

    expect(response.status).toBe(302)
    expect(response.header.location).toBe('https://sphere.test')
  })

  it('should redirect to https://<host><q> when q does not contain localhost', async () => {
    const response = await agent()
      .get('/')
      .set('host', 'sphere.test')
      .query({ q: '/page/home' })

    expect(response.status).toBe(302)
    expect(response.header.location).toBe('https://sphere.test/page/home')
  })

  it('should redirect to q verbatim (no host prefix) when q contains localhost', async () => {
    const response = await agent()
      .get('/')
      .set('host', 'sphere.test')
      .query({ q: 'localhost:4000/page/home' })

    expect(response.status).toBe(302)
    expect(response.header.location).toBe('localhost:4000/page/home')
  })

  it('should redirect to https://<host> with no path when q is an empty string', async () => {
    // req.query is non-empty ({ q: '' }), so this exercises the
    // `queryParam.includes(...)` line with a real (empty) string rather
    // than skipping the block entirely — distinct from the no-query-string
    // case above.
    const response = await agent()
      .get('/')
      .set('host', 'sphere.test')
      .query({ q: '' })

    expect(response.status).toBe(302)
    expect(response.header.location).toBe('https://sphere.test')
  })

  // NOTE: GET /?foo=bar (query present, but no `q` key) is NOT tested live.
  // req.query.q is undefined there, and `undefined.includes('localhost')`
  // throws synchronously with no try/catch to catch it — an unhandled
  // rejection that leaves the request hanging with no response. See the
  // file header comment above.
})
