/**
 * contentSearchService.ts — NOT a route-handler file. It exports two plain
 * async helper functions, `searchContent` and `searchContentV2`, consumed by
 * mobileAppApi.ts's POST /contentSearch and POST /contentSearchV2 routes
 * (which each wrap the call in their own try/catch and turn a rejection into
 * a 500). There is no Router here, so these tests call the functions
 * directly rather than going through mountRouter/supertest.
 *
 * Both functions follow the identical shape:
 *   try {
 *     const res = await axios({ ...axiosRequestConfigLong, method: 'post', url, data, headers })
 *     return res.data
 *   } catch (error) {
 *     logError('Error in searchContent: ' + JSON.stringify(error))
 *     throw error
 *   }
 *
 * so the safety picture is simple: on success the raw axios response body is
 * returned; on failure the SAME error object is synchronously re-thrown to
 * the caller (mobileAppApi.ts), which is fully try/catch-wrapped there. No
 * double-send / zero-response pattern applies since there is no `res` object
 * at this layer at all.
 *
 * Note (not reproduced live, reported to the requester rather than fixed
 * here): the catch block does `JSON.stringify(error)` before re-throwing.
 * A real axios error can carry circular references (e.g. via
 * error.request/error.config -> http.Agent -> sockets), and JSON.stringify
 * throws "Converting circular structure to JSON" on those. If that happened,
 * the catch block's own JSON.stringify call would throw a NEW TypeError
 * *instead of* reaching `throw error`, masking the original error. It would
 * still propagate up into mobileAppApi.ts's own try/catch (which also does
 * JSON.stringify, but on the new, non-circular TypeError, which is safe), so
 * this does not hang or crash the process — it only masks the logged error.
 * Not exercised live here because reproducing it requires a genuinely
 * circular error object, which is outside what the mockAxios helpers build.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    SB_API_KEY: 'test-sb-api-key',
    SUNBIRD_PROXY_API_BASE: 'https://sunbird-proxy.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { searchContent, searchContentV2 } from './contentSearchService'

const mockAxios = axios as unknown as jest.Mock

beforeEach(() => {
  mockAxios.mockReset()
})

/**
 * @description Verifies the searchContent helper posts the expected request
 * shape (applying filter/limit/offset/sort defaults or forwarding
 * caller-supplied values), resolves with the upstream response body on
 * success, and re-throws the same error object on HTTP or network failures.
 */
describe('searchContent', () => {
  it('should resolve with the upstream response body on success', async () => {
    const payload = { result: { content: [{ id: 'c1' }], count: 1 } }
    mockAxios.mockResolvedValue(upstreamOk(payload))

    const result = await searchContent({
      request: { filters: { channel: 'test' }, limit: 5, offset: 2 },
    })

    expect(result).toEqual(payload)
  })

  it('should post the expected request shape, applying filter/limit/offset/sort defaults', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ result: { content: [] } }))

    await searchContent({})

    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          request: {
            filters: {},
            limit: 20,
            offset: 1,
            sort_by: { lastUpdatedOn: 'desc' },
          },
          sort: [{ lastUpdatedOn: 'desc' }],
        },
        headers: expect.objectContaining({
          Authorization: 'test-sb-api-key',
          'Content-Type': 'application/json',
        }),
        method: 'post',
        url: 'https://sunbird-proxy.test/content/v1/search',
      })
    )
  })

  it('should forward a caller-supplied sort_by instead of the default', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ result: { content: [] } }))

    await searchContent({ request: { sort_by: { name: 'asc' } } })

    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          request: expect.objectContaining({ sort_by: { name: 'asc' } }),
        }),
      })
    )
  })

  it('should re-throw the same error object when the upstream call fails with an HTTP error', async () => {
    const error = upstreamError(502, { error: 'upstream failed' })
    mockAxios.mockRejectedValue(error)

    await expect(
      searchContent({ request: { filters: {} } })
    ).rejects.toBe(error)
  })

  it('should re-throw the same error object on a network-level failure', async () => {
    const error = networkError()
    mockAxios.mockRejectedValue(error)

    await expect(
      searchContent({ request: { filters: {} } })
    ).rejects.toBe(error)
  })
})

/**
 * @description Verifies the searchContentV2 helper posts the expected
 * request shape (defaulting filters.competency and query, or forwarding
 * caller-supplied values), resolves with the upstream response body on
 * success, and re-throws the same error object on HTTP or network failures.
 */
describe('searchContentV2', () => {
  it('should resolve with the upstream response body on success', async () => {
    const payload = { result: { content: [{ id: 'c2' }], count: 1 } }
    mockAxios.mockResolvedValue(upstreamOk(payload))

    const result = await searchContentV2({
      request: { filters: { channel: 'test' }, query: 'leadership' },
    })

    expect(result).toEqual(payload)
  })

  it('should post the expected request shape, defaulting filters.competency to false and query to empty string', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ result: { content: [] } }))

    await searchContentV2({})

    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          request: {
            filters: { competency: false },
            limit: 20,
            offset: 1,
            query: '',
            sort_by: { lastUpdatedOn: 'desc' },
          },
          sort: [{ lastUpdatedOn: 'desc' }],
        },
        headers: expect.objectContaining({
          Authorization: 'test-sb-api-key',
          'Content-Type': 'application/json',
        }),
        method: 'post',
        url: 'https://sunbird-proxy.test/content/v1/search',
      })
    )
  })

  it('should preserve a caller-supplied filters.competency value instead of defaulting it', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ result: { content: [] } }))

    await searchContentV2({ request: { filters: { competency: true } } })

    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          request: expect.objectContaining({
            filters: { competency: true },
          }),
        }),
      })
    )
  })

  it('should forward caller-supplied limit, offset and query', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ result: { content: [] } }))

    await searchContentV2({
      request: { limit: 7, offset: 3, query: 'compliance' },
    })

    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          request: expect.objectContaining({
            limit: 7,
            offset: 3,
            query: 'compliance',
          }),
        }),
      })
    )
  })

  it('should re-throw the same error object when the upstream call fails with an HTTP error', async () => {
    const error = upstreamError(502, { error: 'upstream failed' })
    mockAxios.mockRejectedValue(error)

    await expect(
      searchContentV2({ request: { filters: {} } })
    ).rejects.toBe(error)
  })

  it('should re-throw the same error object on a network-level failure', async () => {
    const error = networkError()
    mockAxios.mockRejectedValue(error)

    await expect(
      searchContentV2({ request: { filters: {} } })
    ).rejects.toBe(error)
  })
})
