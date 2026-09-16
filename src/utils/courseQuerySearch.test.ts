/**
 * searchCoursesByQuery — shared query-branch behind publicSearch.ts's and
 * ratingsSearch.ts's byte-identical '/getCourses' query handling
 * (CHANGE 33). Exercised directly here, independent of either call site's
 * own test file.
 */

jest.mock('axios')
jest.mock('./logger', () => ({ logInfo: jest.fn() }))
jest.mock('./env', () => ({
  CONSTANTS: { SUNBIRD_PROXY_API_BASE: 'https://proxy.test' },
}))

import axios from 'axios'
import { searchCoursesByQuery } from './courseQuerySearch'

const mockAxiosCallable = axios as unknown as jest.Mock

function mockResponse() {
  return { json: jest.fn(), status: jest.fn(function status(this: any) { return this }) } as any
}

function mockPool(rows: Array<{ id: string }> = []) {
  return { query: jest.fn(async () => ({ rows })) }
}

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

/**
 * @description Verifies a successful primary+secondary search sends the
 * deduplicated, merged result with a 200.
 */
it('sends deduplicated merged results on a successful search', async () => {
  mockAxiosCallable
    .mockResolvedValueOnce({
      data: { result: { content: [{ identifier: 'c1' }], facets: ['f1'] } },
    })
    .mockResolvedValueOnce({
      data: { result: { content: [{ identifier: 'c1' }, { identifier: 'c2' }] } },
    })
  const res = mockResponse()
  const pool = mockPool([{ id: 'comp-1' }])

  await searchCoursesByQuery(
    res,
    pool,
    { request: { query: 'react' } },
    {},
    [],
    { lastUpdatedOn: 'desc' }
  )

  expect(res.status).toHaveBeenCalledWith(200)
  const payload = res.json.mock.calls[0][0]
  expect(payload.responseCode).toBe('OK')
  expect(payload.result.content.map((c: any) => c.identifier).sort()).toEqual(['c1', 'c2'])
  expect(payload.result.facets).toEqual(['f1'])
})

/**
 * @description Verifies the null-result shape (empty content, count 0) is
 * sent with a 200 when both primary and secondary searches return nothing.
 */
it('sends the null response shape when no courses are found', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { result: { content: [] } } })
  const res = mockResponse()
  const pool = mockPool([])

  await searchCoursesByQuery(res, pool, { request: { query: 'nothing' } }, {}, [], {})

  expect(res.status).toHaveBeenCalledWith(200)
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ result: expect.objectContaining({ content: [], count: 0 }) })
  )
})

/**
 * @description Verifies a 500 with the fixed message is sent when the
 * secondary (competency-filtered) search call rejects.
 */
it('sends a 500 when the secondary competency search rejects', async () => {
  mockAxiosCallable
    .mockResolvedValueOnce({ data: { result: { content: [], facets: [] } } })
    .mockRejectedValueOnce(new Error('network down'))
  const res = mockResponse()
  const pool = mockPool([{ id: 'comp-1' }])

  await searchCoursesByQuery(res, pool, { request: { query: 'react' } }, {}, [], {})

  expect(res.status).toHaveBeenCalledWith(500)
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Something went wrong while fetching competency filtered data' })
  )
})

/**
 * @description Verifies a 400 with the fixed message is sent when the
 * Postgres competency lookup itself rejects.
 */
it('sends a 400 when the postgres competency lookup rejects', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { result: { content: [], facets: [] } } })
  const res = mockResponse()
  const pool = { query: jest.fn().mockRejectedValue(new Error('db down')) }

  await searchCoursesByQuery(res, pool, { request: { query: 'react' } }, {}, [], {})

  expect(res.status).toHaveBeenCalledWith(400)
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Something went wrong while connecting search service' })
  )
})

/**
 * @description Concurrency: this helper is shared between publicSearch.ts
 * and ratingsSearch.ts, whose routes can receive different search queries
 * at the same time, each with its own pool/response. Fires 2 concurrent
 * searches with axios routing its response by the requested query, and
 * confirms each call's OWN response gets its OWN results.
 */
it('concurrent searches for different queries never cross-send results', async () => {
  mockAxiosCallable.mockImplementation((config) => {
    const isReact = JSON.stringify(config.data).includes('react')
    return Promise.resolve({
      data: { result: { content: [{ identifier: isReact ? 'react-course' : 'vue-course' }], facets: [] } },
    })
  })
  const resA = mockResponse()
  const resB = mockResponse()
  const poolA = mockPool([])
  const poolB = mockPool([])

  await Promise.all([
    searchCoursesByQuery(resA, poolA, { request: { query: 'react' } }, {}, [], {}),
    searchCoursesByQuery(resB, poolB, { request: { query: 'vue' } }, {}, [], {}),
  ])

  expect(resA.json.mock.calls[0][0].result.content[0].identifier).toBe('react-course')
  expect(resB.json.mock.calls[0][0].result.content[0].identifier).toBe('vue-course')
})
