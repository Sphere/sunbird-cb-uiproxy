/**
 * bulkUserSsoMapping.ts — one route (POST /provider) that parses an
 * uploaded CSV and, for every data row, fires off a Kong user-search
 * lookup.
 *
 * Real bug found while reading this file (documented in
 * docs/PROD-VERIFICATION.md by the requester, not edited here):
 *  - `result.forEach(async (csvElement) => {...})` is called INSIDE the
 *    outer `for` loop that builds `result`, instead of after it. On row i
 *    it re-iterates over all i already-pushed rows, so row 1 is looked up
 *    once, row 2 triggers lookups for rows 1 and 2 again, etc. — an O(n^2)
 *    number of redundant Kong search calls for an n-row CSV. This is a
 *    performance/correctness bug (duplicate upstream calls, not a
 *    hang/crash) so it IS safe to exercise live; kept the fixture CSVs to
 *    at most 2 data rows to keep the redundant-call count small.
 *
 * The HTTP response itself does NOT wait on any of these lookups — it is
 * sent synchronously right after the parsing loop, based only on
 * `result.length` — so upstream success/failure of the search calls never
 * changes the response. The `successUserIds` field in the 200 response
 * is always `[]`: the array it's initialized from (`createdUserId`) is
 * declared but never pushed to anywhere in the file.
 *
 * Each per-row lookup has its own try/catch around the axios call, so a
 * rejection there is caught and logged, not an unhandled rejection — safe
 * to test live via a rejected axios mock.
 *
 * No file attached: `req.files.userData.data` throws synchronously,
 * caught by the route's outer try/catch, which sends a single 500 — safe
 * to test live.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logInfo: jest.fn() }))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    KONG_API_BASE: 'https://kong.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { bulkUserSsoMappingApi } from './bulkUserSsoMapping'

const mockAxiosCallable = axios as unknown as jest.Mock

const csvOneRow = ['type,username', 'phone,9999999999'].join('\n')
const csvTwoRows = ['type,username', 'phone,9999999999', 'email,a@example.com'].join('\n')
const csvHeaderOnly = 'type,username'

function agentWithFile(csv: string) {
  return mountRouter(bulkUserSsoMappingApi, {
    // tslint:disable-next-line: no-any
    requestProps: { files: { userData: { data: Buffer.from(csv, 'utf8') } } } as any,
  })
}

// Lets the fire-and-forget per-row lookups (started synchronously inside
// the route, but resolved on a later microtask) run to completion so their
// try/catch branches are actually exercised for coverage purposes. The
// HTTP response itself does not depend on this settling.
const settle = () => new Promise((resolve) => setImmediate(resolve))

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

/**
 * @description Verifies POST /provider handles missing files, empty CSVs,
 * and single/multi-row CSVs, asserting that the HTTP response always
 * resolves synchronously with an empty successUserIds array regardless of
 * the outcome of the fire-and-forget per-row Kong user-search lookups.
 */
describe('POST /provider', () => {
  it('should respond 500 synchronously when no file is attached', async () => {
    const response = await mountRouter(bulkUserSsoMappingApi).post('/provider')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Could not upload the file: ' })
  })

  it('should respond 404 when the CSV has a header row but no data rows', async () => {
    const response = await agentWithFile(csvHeaderOnly).post('/provider')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      message: 'No Data found in bulk upload ! plz check if UserId present.',
      status: 'warning',
    })
  })

  it('should respond 200 with an always-empty successUserIds for a CSV with one data row', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({
        result: {
          response: {
            content: [{ userId: 'user-1' }],
            count: 1,
            organisations: [{ organisationId: 'org-1' }],
          },
        },
      }),
    )
    const response = await agentWithFile(csvOneRow).post('/provider')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      message: 'Bulk Upload is Completed ! ',
      status: 'success',
      successUserIds: [],
    })
    await settle()
  })

  it('should still respond 200 when the upstream Kong search reports zero matches (count === 0 branch)', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: { response: { count: 0 } } }))
    const response = await agentWithFile(csvOneRow).post('/provider')
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('success')
    await settle()
  })

  it('should still respond 200 even when every upstream user-search call fails (caught and logged per-row)', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agentWithFile(csvOneRow).post('/provider')
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('success')
    await settle()
  })

  it('should respond 200 for a multi-row CSV, independent of upstream search outcome', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({
        result: {
          response: {
            content: [{ userId: 'user-2' }],
            count: 1,
            organisations: [{ organisationId: 'org-2' }],
          },
        },
      }),
    )
    const response = await agentWithFile(csvTwoRows).post('/provider')
    expect(response.status).toBe(200)
    expect(response.body.successUserIds).toEqual([])
    await settle()
  })
})
