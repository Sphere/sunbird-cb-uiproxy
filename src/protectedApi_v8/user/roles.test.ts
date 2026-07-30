/**
 * PHASE 1 — user/roles.ts.
 *
 * Two call shapes: axios.get/axios.post for direct proxy endpoints, and the
 * callable `axios({...})` form for PATCH /. Most GET routes delegate to the
 * exported helper getUserRoles(), which SWALLOWS axios errors internally
 * (returns ['author'] on any failure) rather than throwing — so the route
 * handlers' own catch blocks are unreachable for those routes when the
 * failure originates from the upstream call. That's documented below rather
 * than treated as a bug: it is safe to exercise live (single response, no
 * ERR_HTTP_HEADERS_SENT risk), it just means those catch branches show as
 * uncovered.
 *
 * updateRolesV2Mock (not a route — an exported helper used by
 * admin/userRegistration.ts) is tested by calling it directly, not over
 * HTTP. See the describe block below for a real bug found in its shape.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logObject: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({ CONSTANTS: { ROLES_API_BASE: 'https://roles.test' } }))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { getUserRoles, rolesApi, updateRolesV2Mock } from './roles'

const mockAxiosMethods = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(rolesApi)
const withRootOrg = (req: ReturnType<typeof agent>) => req.set('rootOrg', 'r1')

beforeEach(() => {
  mockAxiosMethods.get.mockReset()
  mockAxiosMethods.post.mockReset()
  mockAxiosCallable.mockReset()
})

describe('getUserRoles (exported helper)', () => {
  it('returns the upstream roles data', async () => {
    mockAxiosMethods.get.mockResolvedValue(upstreamOk(['admin']))
    await expect(getUserRoles('u1', 'r1')).resolves.toEqual(['admin'])
  })

  it('falls back to ["author"] when the upstream call fails', async () => {
    mockAxiosMethods.get.mockRejectedValue(networkError())
    await expect(getUserRoles('u1', 'r1')).resolves.toEqual(['author'])
  })
})

describe('GET /', () => {
  it("returns the requesting user's roles", async () => {
    mockAxiosMethods.get.mockResolvedValue(upstreamOk(['admin']))
    const response = await withRootOrg(agent().get('/'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual(['admin'])
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/')
    expect(response.status).toBe(400)
  })

  // getUserRoles() catches its own axios errors and resolves to ['author'],
  // so the route's own catch/500-fallback branch is unreachable via an
  // upstream failure here — the request still succeeds with a 200. Safe to
  // run live: getUserRoles never rethrows, so res.json() is only ever called
  // once.
  it('still responds 200 with the ["author"] fallback when upstream fails', async () => {
    mockAxiosMethods.get.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual(['author'])
  })
})

describe('GET /allRoles', () => {
  it('returns roles for the fixed masteruser', async () => {
    mockAxiosMethods.get.mockResolvedValue(upstreamOk(['admin', 'author']))
    const response = await withRootOrg(agent().get('/allRoles'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual(['admin', 'author'])
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/allRoles')
    expect(response.status).toBe(400)
  })
})

describe('GET /getRolesV2/:userId', () => {
  it('returns roles for the given user id', async () => {
    mockAxiosMethods.get.mockResolvedValue(upstreamOk(['author']))
    const response = await withRootOrg(agent().get('/getRolesV2/u2'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual(['author'])
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/getRolesV2/u2')
    expect(response.status).toBe(400)
  })
})

describe('GET /:userId', () => {
  it('returns roles for the given user id', async () => {
    mockAxiosMethods.get.mockResolvedValue(upstreamOk(['admin']))
    const response = await withRootOrg(agent().get('/u3'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual(['admin'])
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/u3')
    expect(response.status).toBe(400)
  })
})

describe('GET /getUsersV2/:role', () => {
  it('returns the users for the given role', async () => {
    mockAxiosMethods.get.mockResolvedValue(upstreamOk([{ id: 'u1' }]))
    const response = await withRootOrg(agent().get('/getUsersV2/admin'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'u1' }])
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/getUsersV2/admin')
    expect(response.status).toBe(400)
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxiosMethods.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await withRootOrg(agent().get('/getUsersV2/admin'))
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('returns 500 on a network failure', async () => {
    mockAxiosMethods.get.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/getUsersV2/admin'))
    expect(response.status).toBe(500)
  })
})

describe('POST /updateRolesV2', () => {
  it('forwards the role update, including action_by from the wid header', async () => {
    mockAxiosMethods.post.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await withRootOrg(agent().post('/updateRolesV2'))
      .set('wid', 'actor-1')
      .send({ operation: 'add', roles: ['admin'], users: ['u1'] })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ updated: true })
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/updateRolesV2').send({})
    expect(response.status).toBe(400)
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxiosMethods.post.mockRejectedValue(upstreamError(409, { error: 'conflict' }))
    const response = await withRootOrg(agent().post('/updateRolesV2')).send({})
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('returns 500 on a network failure', async () => {
    mockAxiosMethods.post.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().post('/updateRolesV2')).send({})
    expect(response.status).toBe(500)
  })
})

describe('PATCH /', () => {
  it('forwards the role patch', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ patched: true }))
    const response = await withRootOrg(agent().patch('/')).send({ operation: 'remove' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ patched: true })
  })

  it('responds with {} when the upstream returns no data', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk(undefined))
    const response = await withRootOrg(agent().patch('/')).send({ operation: 'remove' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({})
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().patch('/').send({})
    expect(response.status).toBe(400)
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(403, { error: 'forbidden' }))
    const response = await withRootOrg(agent().patch('/')).send({})
    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'forbidden' })
  })

  it('returns 500 on a network failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().patch('/')).send({})
    expect(response.status).toBe(500)
  })
})

describe('updateRolesV2Mock (exported helper, not an HTTP route)', () => {
  // Real bug (documented, not reproduced against any live HTTP response —
  // this helper is never wired to res.send/res.json, so it's safe to call
  // directly): updateRolesV2Mock() is `async` and its body is just
  // `return async () => {...}` — it resolves to a NEW, uninvoked function
  // rather than performing the update. Its only caller,
  // src/protectedApi_v8/admin/userRegistration.ts:486-496, does:
  //   await updateRolesV2Mock(actionByWid, updateRolesReq, rootOrg)
  //     .catch((err) => { ...; return 'Roles could not be updated' })
  // `await`-ing the outer call only unwraps the outer promise to get the
  // inner function itself — the inner function is never called, so the
  // axios.post role-update request inside it never fires, and the
  // `.catch` can never trigger since the outer promise cannot reject with a
  // string. Net effect: in production, new-user role assignment via this
  // path silently never happens, and no error is ever logged for it.
  // MUST VERIFY IN PROD checklist item: confirm whether roles for newly
  // registered users (admin/userRegistration.ts performNewUserSteps) are
  // actually applied via a different mechanism, since this call site cannot
  // be doing it.
  it('resolves to a function rather than performing the update', async () => {
    const result = await updateRolesV2Mock('actor-1', { roles: ['admin'] }, 'r1')
    expect(typeof result).toBe('function')
  })

  it('the returned function resolves to ERROR_NO_ORG_DATA when rootOrg is falsy', async () => {
    const fn = await updateRolesV2Mock('actor-1', { roles: ['admin'] }, '')
    await expect(fn()).resolves.toBe('ERROR_NO_ORG_DATA')
  })

  it('the returned function posts the update and resolves to the axios response when invoked', async () => {
    mockAxiosMethods.post.mockResolvedValue(upstreamOk({ updated: true }))
    const fn = await updateRolesV2Mock('actor-1', { roles: ['admin'] }, 'r1')
    const result = await fn()
    expect(result).toMatchObject({ data: { updated: true } })
  })

  it('the returned function swallows a post failure and resolves to the error itself', async () => {
    mockAxiosMethods.post.mockRejectedValue(networkError('boom'))
    const fn = await updateRolesV2Mock('actor-1', { roles: ['admin'] }, 'r1')
    const result = await fn()
    expect(result).toBeInstanceOf(Error)
  })
})
