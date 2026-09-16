/**
 * searchUser.ts — NOT a route-handler file. It exports one plain async
 * helper, `fetchUser(searchValue, searchType)`. Confirmed via repo-wide grep
 * that it has no live callers: ssoLogin.ts and emailOrMobileLoginSignIn.ts
 * each hit the same LEARNER_SERVICE_API_BASE search endpoint, but through
 * their own inline axios calls, not through this function. There is no
 * Router here, so these tests call the function directly rather than going
 * through mountRouter/supertest.
 *
 * The function's shape:
 *   try {
 *     const userSearchResponse = await axios({ ...axiosRequestConfig, data, headers, method: 'POST', url })
 *     logInfo('Search response  : ', userSearchResponse.data.result)
 *     return userSearchResponse            // the FULL axios response object, not .data
 *   } catch (error) {
 *     logInfo('error of user search' + error)
 *     // no return statement -> implicitly returns undefined, error is swallowed
 *   }
 *
 * Two things worth flagging (not bugs that hang/crash, so reproduced live
 * rather than skipped):
 *   1. On success it returns the whole axios response object (status,
 *      headers, data, ...), not `response.data` like sibling helpers
 *      (e.g. contentSearchService.ts's searchContent). Callers must reach
 *      into `.data` themselves.
 *   2. On failure it does NOT re-throw (unlike contentSearchService.ts) —
 *      it swallows the error entirely and the function resolves to
 *      `undefined`. Callers cannot distinguish "not found" from "upstream
 *      failed" from the return value alone; both look like undefined/absent
 *      data. This is a real behavioral quirk but not a hang/crash/security
 *      bypass, so it's safe to exercise live and is covered below rather
 *      than being held out for docs/PROD-VERIFICATION.md.
 *
 * The catch block only does string concatenation (`'error of user search' +
 * error`), never touches `error.response.x` unguarded, so there is no
 * Pattern-D crash risk here.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logInfo: jest.fn(), logError: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    LEARNER_SERVICE_API_BASE: 'https://learner-service.test',
    SB_API_KEY: 'test-sb-api-key',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { fetchUser } from './searchUser'

const mockAxios = axios as unknown as jest.Mock

beforeEach(() => {
  mockAxios.mockReset()
})

/**
 * @description Verifies fetchUser posts the expected request shape (filters
 * keyed by searchType, lowercased searchValue, empty query, Authorization
 * header, POST method, learner-service search URL), resolves with the full
 * axios response object on success, and resolves to undefined (swallowing
 * the error) on both HTTP and network-level failures.
 */
describe('fetchUser', () => {
  it('should resolve with the full axios response object on success', async () => {
    const response = upstreamOk({ result: { response: { content: [{ id: 'u1' }] } } })
    mockAxios.mockResolvedValue(response)

    const result = await fetchUser('9999999999', 'phone')

    expect(result).toEqual(response)
  })

  it('should post the expected request shape with the searchType as the filter key', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ result: {} }))

    await fetchUser('SomeValue', 'phone')

    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          request: {
            filters: { phone: 'somevalue' },
            query: '',
          },
        },
        headers: { Authorization: 'test-sb-api-key' },
        method: 'POST',
        url: 'https://learner-service.test/private/user/v1/search',
      })
    )
  })

  it('should lowercase the searchValue before building the filter', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ result: {} }))

    await fetchUser('User@EXAMPLE.com', 'email')

    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          request: expect.objectContaining({
            filters: { email: 'user@example.com' },
          }),
        }),
      })
    )
  })

  it('should use searchType as the dynamic filter key for a different searchType', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ result: {} }))

    await fetchUser('jdoe', 'userName')

    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          request: expect.objectContaining({
            filters: { userName: 'jdoe' },
          }),
        }),
      })
    )
  })

  it('should resolve to undefined, swallowing the error, when the upstream call fails with an HTTP error', async () => {
    mockAxios.mockRejectedValue(upstreamError(502, { error: 'upstream failed' }))

    const result = await fetchUser('9999999999', 'phone')

    expect(result).toBeUndefined()
  })

  it('should resolve to undefined, swallowing the error, on a network-level failure', async () => {
    mockAxios.mockRejectedValue(networkError())

    const result = await fetchUser('9999999999', 'phone')

    expect(result).toBeUndefined()
  })
})
