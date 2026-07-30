/**
 * PHASE 1 — navigator.ts. Seven routes, all reading upstream "navigator"
 * JSON blobs and reshaping them (rewriting *_image fields via
 * appendProxiesUrl, real/unmocked). Only GET /roles wraps its body in a
 * try/catch; every other route awaits axios directly with no try/catch and
 * no .catch(), so an axios rejection becomes an unhandled promise rejection
 * that Express 4 does NOT turn into a response — the request just hangs.
 * Per the safety process, those rejection paths are documented below and
 * NOT exercised live (docs/PROD-VERIFICATION.md, added separately).
 *
 * Real bugs found while reading this file (documented, not exercised for
 * their buggy/hanging behaviour beyond what's noted per describe block):
 *
 * 1. GET /role/:roleId/:variantId (lines 49-69): no try/catch around
 *    `await axios.get(...)` (unhandled-rejection hang). Independently,
 *    lines 53-55 — `if (!nsoData.data) { res.status(nsoData.status).send(...) }`
 *    — has no `return`; when nsoData.data is falsy, control falls through
 *    into `findRoleVariant(nsoData.data.nso_data, ...)`, which throws
 *    `TypeError: Cannot read properties of undefined (reading 'nso_data')`
 *    — again an unhandled rejection/hang, reachable just by the upstream
 *    resolving with a falsy `data` (no error status needed).
 *
 * 2. GET /lp (lines 71-104) and GET /fp (lines 127-155): same
 *    missing-try/catch shape (unhandled-rejection hang on axios rejection).
 *    Also: `Number(req.query.pageNumber) || 0` converts a non-numeric query
 *    value to 0 BEFORE the `isNaN(pageNumber)` check runs (`NaN || 0` is
 *    `0`, which is not NaN), so that "should be integers" 400 branch can
 *    never fire — invalid pageNumber/pageSize silently falls back to
 *    defaults instead of being rejected.
 *
 * 3. GET /lp/:lpId (lines 106-125): same missing-try/catch shape
 *    (unhandled-rejection hang on axios rejection).
 *
 * 4. GET /topics (lines 157-180): same missing-try/catch shape (unhandled-
 *    rejection hang on axios rejection). Also line 177: when
 *    `topics.size === 0` the handler calls `res.status(204)` with no
 *    `.send()`/`.end()` — the response is never finished and the request
 *    hangs. Separately, the falsy-data guard on line 162 checks
 *    `!lpData.data` (the whole payload) but the else branch immediately
 *    does `lpData.data.lp_data.forEach(...)` — an upstream response whose
 *    `data` is truthy but has no `lp_data` field (e.g. `{}`) is NOT caught
 *    by the guard and throws `TypeError: Cannot read properties of
 *    undefined (reading 'forEach')` with no try/catch, another unhandled-
 *    rejection hang. Confirmed by hitting it accidentally in this suite —
 *    it hung the affected test for the full 30s Jest timeout before
 *    failing.
 *
 * 5. GET /bpm (lines 182-192): same missing-try/catch shape (unhandled-
 *    rejection hang on axios rejection).
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    WEB_HOST_PROXY: 'https://web-host-proxy.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { navigatorApi } from './navigator'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(navigatorApi)

beforeEach(() => {
  mockAxios.get.mockReset()
})

const IMG_PREFIX = '/apis/proxies/v8/web-hosted/navigator/images/'

function buildRole(overrides: object = {}) {
  return {
    courses_available: true,
    role_description: 'A role description',
    role_id: 'role-1',
    role_image: 'role1.png',
    role_name: 'Role One',
    roles_defined: true,
    variants: [
      {
        group: [],
        variant_description: 'variant desc',
        variant_id: 'var-1',
        variant_image: 'variant1.png',
        variant_name: 'Variant One',
      },
    ],
    ...overrides,
  }
}

function buildNsoData() {
  return [
    { arm_id: 1, arm_name: 'Accelerate', roles: [buildRole()] },
    { arm_id: 2, arm_name: 'Assure', roles: [] },
    { arm_id: 3, arm_name: 'Experience', roles: [] },
    { arm_id: 4, arm_name: 'Innovate', roles: [] },
    { arm_id: 5, arm_name: 'Insight', roles: [] },
  ]
}

describe('GET /roles', () => {
  it('returns the five offering categories with role images rewritten', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ nso_data: buildNsoData() }))
    const response = await agent().get('/roles')
    expect(response.status).toBe(200)
    expect(Object.keys(response.body).sort()).toEqual(
      ['Accelerate', 'Assure', 'Experience', 'Innovate', 'Insight'].sort()
    )
    expect(response.body.Accelerate.roles[0].role_image).toBe(`${IMG_PREFIX}role1.png`)
    // transformNsoData strips these fields off every variant on the way in.
    expect(response.body.Accelerate.roles[0].variants[0].variant_image).toBeUndefined()
  })

  it('forwards the upstream status/body on a failure response', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'upstream failed' }))
    const response = await agent().get('/roles')
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'upstream failed' })
  })

  it('returns 500 with a generic body on a network-level failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/roles')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /role/:roleId/:variantId', () => {
  // Real bug (see file header, item 1): this route has no try/catch, so a
  // rejected axios.get() would become an unhandled promise rejection and
  // hang the request instead of producing a response. NOT exercised live.
  //
  // Also NOT exercised live: mocking axios to resolve with a falsy `data`
  // (e.g. upstreamOk(null)) hits the missing-`return` bug on line 53-55 and
  // throws synchronously inside the async handler with no catch — same
  // unhandled-rejection hang.

  it('returns the matching variant with its image rewritten', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ nso_data: buildNsoData() }))
    const response = await agent().get('/role/role-1/var-1')
    expect(response.status).toBe(200)
    expect(response.body.variant_id).toBe('var-1')
    expect(response.body.variant_image).toBe(`${IMG_PREFIX}variant1.png`)
  })

  it('returns 404 when the role id does not match', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ nso_data: buildNsoData() }))
    const response = await agent().get('/role/no-such-role/var-1')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Role Id incorrect' })
  })

  it('returns 404 when the variant id does not match', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ nso_data: buildNsoData() }))
    const response = await agent().get('/role/role-1/no-such-variant')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Variant Id incorrect' })
  })
})

function buildLp(overrides: object = {}) {
  return {
    capstone_description: 'capstone desc',
    linked_program: 'linked',
    lp_alternate: [],
    lp_capstone: 'capstone',
    lp_description: 'lp desc',
    lp_external_certification: [],
    lp_id: 1,
    lp_image: 'lp1.png',
    lp_internal_certification: [],
    lp_name: 'LP One',
    lp_playground: [],
    lp_recommendation: 'reco',
    profiles: [
      {
        attached: true,
        courses: [],
        courses_list: [],
        profile_description: 'pd',
        profile_display_name: 'P1',
        profile_id: 1,
        profile_image: 'p1.png',
        profile_name: 'Profile One',
        profile_time: 1,
        technology: ['Java', 'Node'],
      },
    ],
    ...overrides,
  }
}

describe('GET /lp', () => {
  it('returns 400 when pageNumber/pageSize are out of range for the data set', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({ lp_data: [buildLp({ lp_id: 1 }), buildLp({ lp_id: 2 })] })
    )
    const response = await agent().get('/lp?pageNumber=5&pageSize=10000')
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'Out of Range Error.' })
  })

  it('returns the full page of learning paths with images rewritten', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({ lp_data: [buildLp({ lp_id: 1 }), buildLp({ lp_id: 2 })] })
    )
    const response = await agent().get('/lp')
    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(2)
    expect(response.body[0].lp_image).toBe(`${IMG_PREFIX}lp1.png`)
  })

  it('filters by topics when a topics query param is supplied', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({
        lp_data: [
          buildLp({ lp_id: 1 }),
          buildLp({ lp_id: 2, profiles: [{ ...buildLp().profiles[0], technology: ['Python'] }] }),
        ],
      })
    )
    const response = await agent().get('/lp?topics=Java')
    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(1)
    expect(response.body[0].lp_id).toBe(1)
  })

  it('returns the upstream status with a fetch-error body when lp_data is missing', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({}, 200))
    const response = await agent().get('/lp')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ error: 'ERROR_FETCHING_LP_DATA' })
  })

  // Documents the dead-validation bug (see file header, item 2): a
  // non-numeric pageNumber does NOT produce the intended 400 — it silently
  // falls back to the default (0) and the request succeeds.
  it('silently defaults an invalid pageNumber instead of rejecting it (documented bug)', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ lp_data: [buildLp({ lp_id: 1 })] }))
    const response = await agent().get('/lp?pageNumber=not-a-number')
    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(1)
  })

  // Real bug (see file header, item 2): no try/catch here either, so a
  // rejected axios.get() would hang the request. NOT exercised live.
})

describe('GET /lp/:lpId', () => {
  it('returns the matching learning path with its image rewritten', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ lp_data: [buildLp({ lp_id: 1 })] }))
    const response = await agent().get('/lp/1')
    expect(response.status).toBe(200)
    expect(response.body.lp_image).toBe(`${IMG_PREFIX}lp1.png`)
  })

  it('returns 404 for an id that does not match any learning path', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ lp_data: [buildLp({ lp_id: 1 })] }))
    const response = await agent().get('/lp/999')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'Incorrect Learning Path Id' })
  })

  it('returns the upstream status with a fetch-error body when data is falsy', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk(null, 200))
    const response = await agent().get('/lp/1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ error: 'ERROR_FETCHING_LP_DATA' })
  })

  // Real bug (see file header, item 3): no try/catch, so a rejected
  // axios.get() would hang the request. NOT exercised live.
})

function buildFs(overrides: object = {}) {
  return {
    fs_course: [],
    fs_desc: 'fs desc',
    fs_external_certification: [],
    fs_id: 1,
    fs_image: 'fs1.png',
    fs_internal_certification: [],
    fs_linked_program: 'linked',
    fs_name: 'FS One',
    fs_playground: [],
    ...overrides,
  }
}

describe('GET /fp', () => {
  it('returns 400 when pageNumber/pageSize are out of range for the data set', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({ fs_data: [buildFs({ fs_id: 1 }), buildFs({ fs_id: 2 })] })
    )
    const response = await agent().get('/fp?pageNumber=5&pageSize=10000')
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'Out of Range Error.' })
  })

  it('returns the full page of full-stack data with images rewritten', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({ fs_data: [buildFs({ fs_id: 1 }), buildFs({ fs_id: 2 })] })
    )
    const response = await agent().get('/fp')
    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(2)
    expect(response.body[0].fs_image).toBe(`${IMG_PREFIX}fs1.png`)
  })

  it('returns the upstream status with an error body when fs data is falsy', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk(null, 200))
    const response = await agent().get('/fp')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ error: 'Error fetching fullstack data' })
  })

  // Documents the same dead-validation bug as /lp (see file header, item 2).
  it('silently defaults an invalid pageNumber instead of rejecting it (documented bug)', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ fs_data: [buildFs({ fs_id: 1 })] }))
    const response = await agent().get('/fp?pageNumber=not-a-number')
    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(1)
  })

  // Real bug (see file header, item 2): no try/catch, so a rejected
  // axios.get() would hang the request. NOT exercised live.
})

describe('GET /topics', () => {
  it('returns the deduplicated, trimmed technology list', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({
        lp_data: [
          buildLp({
            lp_id: 1,
            profiles: [{ ...buildLp().profiles[0], technology: [' Java ', 'Node', 'Java'] }],
          }),
        ],
      })
    )
    const response = await agent().get('/topics')
    expect(response.status).toBe(200)
    expect(response.body.sort()).toEqual(['Java', 'Node'].sort())
  })

  it('returns the upstream status with a fetch-error body when data is falsy', async () => {
    // NOTE: this route checks `!lpData.data` (the whole payload), unlike
    // /lp and /fp which check the extracted array field — so the only safe
    // way to hit this branch live is a falsy `data` itself (e.g. `null`).
    // `upstreamOk({}, 200)` would be truthy here and fall through to
    // `lpData.data.lp_data.forEach(...)` on `undefined`, which throws with
    // no try/catch (same unhandled-rejection hang noted in the file header).
    mockAxios.get.mockResolvedValue(upstreamOk(null, 200))
    const response = await agent().get('/topics')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ error: 'ERROR_FETCHING_LP_DATA' })
  })

  // Real bug (see file header, item 4): no try/catch (rejection hang), AND
  // when the computed topics set is empty the handler does
  // `res.status(204)` with no `.send()`/`.end()` — the response is never
  // finished and the request hangs. Reachable with e.g. lp_data containing
  // profiles whose technology arrays are all empty. NOT exercised live
  // either way.
})

describe('GET /bpm', () => {
  it('returns the upstream bpm data as-is', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ steps: ['a', 'b'] }))
    const response = await agent().get('/bpm')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ steps: ['a', 'b'] })
  })

  it('returns 404 when axios resolves with a falsy response', async () => {
    // tslint:disable-next-line: no-any
    mockAxios.get.mockResolvedValueOnce(undefined as any)
    const response = await agent().get('/bpm')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Json not found' })
  })

  // Real bug (see file header, item 5): no try/catch, so a rejected
  // axios.get() would hang the request. NOT exercised live.
})
