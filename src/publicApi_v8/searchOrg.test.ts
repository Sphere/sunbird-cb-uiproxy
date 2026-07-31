/**
 * PHASE 2 — searchOrg.ts. One route, POST /searchByOrgID, structurally close
 * to home.ts's POST /searchV6 (same searchV6 endpoint, same raw axios.post +
 * processContent mapping, same GENERAL_ERROR_MSG/adminId fallback shape) but
 * with extra org-filter rewriting logic layered on top:
 *
 *  - If any andFilters entry already has a `sourceName` key ("result" true),
 *    that entry is removed (only if some entry's `sourceName` is truthy —
 *    `inp` stays -1 and nothing is spliced when `sourceName` exists but is
 *    falsy) and a NEW entry `{ sourceShortName: [req.body.orgId] }` is
 *    pushed — note: the whole `orgId` value goes in as a single array
 *    element here, not `orgId[0]`.
 *  - Otherwise ("result" false), `{ sourceShortName: [req.body.orgId[0]] }`
 *    is pushed instead — this branch always indexes into orgId.
 *  - Regardless of which branch ran, the final result filter ALWAYS uses
 *    `req.body.orgId[0].toLowerCase()` to keep only matching `sourceName`
 *    entries. That means the "result true" branch and the closing filter
 *    disagree about whether `orgId` is itself the id or an array of ids —
 *    see the reported finding below. Tests here pass `orgId` as an array
 *    (`['orgId1']`), matching what the filter line and the "result false"
 *    branch both assume.
 *
 * Everything from `req.body.searchFilters` down to the final `res.json` is
 * inside ONE try/catch with no early `return`s and no nested try/catch, so
 * every synchronous throw (missing/malformed `searchFilters`, missing
 * `orgId`) and every axios rejection funnel into the same single
 * `catch` -> single response. No double-send, no hang, no zero-response
 * path found — safe to exercise all of the branches below live.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    SEARCH_API_BASE: 'https://search.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { publicOrg } from './searchOrg'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(publicOrg)

const GENERAL_ERROR_MSG = 'Failed due to unknown reason 11'
const ADMIN_ID = 'ec2687b9-7b86-4321-bbc7-8c9509b834ee'

beforeEach(() => {
  mockAxios.post.mockReset()
})

/**
 * @description Verifies the POST /searchByOrgID route correctly rewrites the
 * andFilters org filter (both the sourceName-present and sourceName-absent
 * branches), maps and returns matching results, and falls back to the
 * generic 500 error for upstream failures and malformed request bodies.
 */
describe('POST /searchByOrgID', () => {
  it('should replace an existing sourceName filter with sourceShortName and keep only matching results (branch: sourceName present)', async () => {
    mockAxios.post.mockResolvedValue(
      upstreamOk({
        result: [
          { identifier: 'c1', sourceName: 'orgId1' },
          { identifier: 'c2', sourceName: 'orgOther' },
        ],
      })
    )

    const response = await agent()
      .post('/searchByOrgID')
      .set('rootOrg', 'root1')
      .send({
        orgId: ['orgId1'],
        searchFilters: {
          filters: [{ andFilters: [{ sourceName: ['stale'] }, { other: 'x' }] }],
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.result).toHaveLength(1)
    expect(response.body.result[0].identifier).toBe('c1')
    // processContent-derived field proves the mapping actually ran.
    expect(response.body.result[0].children).toEqual([])

    const sentBody = mockAxios.post.mock.calls[0][1] as {
      filters: Array<{ andFilters: object[] }>
      rootOrg: string
      uuid: string
    }
    expect(sentBody.rootOrg).toBe('root1')
    expect(sentBody.uuid).toBe(ADMIN_ID)
    // the stale sourceName entry was spliced out, `other` survived, and a
    // new sourceShortName entry was appended.
    expect(sentBody.filters[0].andFilters).toEqual([{ other: 'x' }, { sourceShortName: [['orgId1']] }])
  })

  it('should not splice anything when sourceName is present but falsy, and should still append sourceShortName', async () => {
    // `sourceName: undefined` would be dropped entirely by JSON
    // serialization (and thus not satisfy hasOwnProperty at all), so `null`
    // is used here to keep the key present-but-falsy over the wire.
    mockAxios.post.mockResolvedValue(upstreamOk({ result: [] }))

    await agent()
      .post('/searchByOrgID')
      .send({
        orgId: ['orgId1'],
        searchFilters: {
          filters: [{ andFilters: [{ sourceName: null }] }],
        },
      })

    const sentBody = mockAxios.post.mock.calls[0][1] as { filters: Array<{ andFilters: object[] }> }
    // original entry kept (inp stayed -1, nothing spliced) plus the new one
    expect(sentBody.filters[0].andFilters).toEqual([{ sourceName: null }, { sourceShortName: [['orgId1']] }])
  })

  it('should append sourceShortName from orgId[0] and keep only matching results (branch: no sourceName present)', async () => {
    mockAxios.post.mockResolvedValue(
      upstreamOk({
        result: [{ identifier: 'c1', sourceName: 'orgId1' }],
      })
    )

    const response = await agent()
      .post('/searchByOrgID')
      .send({
        orgId: ['orgId1'],
        searchFilters: {
          filters: [{ andFilters: [{ other: 'x' }] }],
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.result).toHaveLength(1)
    expect(response.body.result[0].identifier).toBe('c1')

    const sentBody = mockAxios.post.mock.calls[0][1] as { filters: Array<{ andFilters: object[] }> }
    expect(sentBody.filters[0].andFilters).toEqual([{ other: 'x' }, { sourceShortName: ['orgId1'] }])
  })

  it('should leave a non-array result untouched by processContent but still filter (throws on the missing array, caught)', async () => {
    // response.data.result is not an array, so Array.isArray(contents) is
    // false and the mapping step is skipped; the subsequent `.filter` call
    // on the non-array then throws synchronously, which is still inside the
    // same try block and is safely caught -> 500, not a hang or crash.
    mockAxios.post.mockResolvedValue(upstreamOk({ result: null }))

    const response = await agent()
      .post('/searchByOrgID')
      .send({
        orgId: ['orgId1'],
        searchFilters: {
          filters: [{ andFilters: [{ other: 'x' }] }],
        },
      })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: GENERAL_ERROR_MSG })
  })

  it('should forward the upstream error status and body on failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(400, { error: 'bad request' }))

    const response = await agent()
      .post('/searchByOrgID')
      .send({
        orgId: ['orgId1'],
        searchFilters: {
          filters: [{ andFilters: [{ other: 'x' }] }],
        },
      })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad request' })
  })

  it('should fall back to 500 with the generic message on a network-level failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent()
      .post('/searchByOrgID')
      .send({
        orgId: ['orgId1'],
        searchFilters: {
          filters: [{ andFilters: [{ other: 'x' }] }],
        },
      })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: GENERAL_ERROR_MSG })
  })

  it('should return 500 when searchFilters is missing (synchronous TypeError caught by the try/catch)', async () => {
    const response = await agent().post('/searchByOrgID').send({})

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: GENERAL_ERROR_MSG })
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('should return 500 when filters is empty (synchronous TypeError caught by the try/catch)', async () => {
    // `filters: []` makes `filters[0]` undefined, so reading `.andFilters`
    // off it throws before the `.some(...)` call is even reached.
    const response = await agent()
      .post('/searchByOrgID')
      .send({ orgId: ['orgId1'], searchFilters: { filters: [] } })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: GENERAL_ERROR_MSG })
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('should return 500 when orgId is missing (throws after the await, still caught by the try/catch)', async () => {
    // Both push branches tolerate a missing orgId (undefined is a legal
    // array element), so the axios call still goes out; the throw happens
    // afterwards in the final `.filter`, when `req.body.orgId[0]` reads a
    // property off `undefined`. That is still inside the same try block —
    // safe to exercise live.
    mockAxios.post.mockResolvedValue(upstreamOk({ result: [{ identifier: 'c1', sourceName: 'orgId1' }] }))

    const response = await agent()
      .post('/searchByOrgID')
      .send({ searchFilters: { filters: [{ andFilters: [{ other: 'x' }] }] } })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: GENERAL_ERROR_MSG })
  })
})
