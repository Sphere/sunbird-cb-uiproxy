/**
 * Coverage for src/authoring/utils/fetch-related-content.ts.
 *
 * This file is NOT an Express-route file — it exports a single plain async
 * function `fetchTranslatedContents(query, uuid, rootOrg = 'iGOT')` that is
 * awaited by its callers (not mounted on a Router, no `res` object exists in
 * this file at all). So these tests call the exported function directly and
 * assert on its resolved return value plus the exact axios call shape
 * (url/body/config), per the "plain functions" style used in
 * ./cdn-url-replacer.test.ts and ../content/hierarchy.test.ts.
 *
 * SAFETY NOTE: fetchTranslatedContents wraps its axios.post call in a
 * try/catch that only calls logError on failure — it never rethrows, and
 * there is no res/Router involved, so there is no Pattern A/B/C/D/E/F hang,
 * crash, or bypass risk here. Both the success path and the axios-rejection
 * path always resolve (never reject), so both are safe to exercise live.
 *
 * Only CONSTANTS.SB_EXT_API_BASE is referenced by fetch-related-content.ts,
 * so the '../../utils/env' mock below supplies only that key. The file also
 * imports axiosRequestConfig from '../../configs/request.config', which
 * itself reads CONSTANTS.TIMEOUT at import time; with TIMEOUT absent from
 * the mock it simply falls back to the module's own default (10000) — no
 * crash, and axiosRequestConfig is not part of this file's contract so it is
 * left unmocked and asserted on structurally.
 */

jest.mock('axios')

jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    SB_EXT_API_BASE: 'https://sb-ext.test',
  },
}))

jest.mock('../../utils/logger', () => ({
  logError: jest.fn(),
}))

import axios from 'axios'
import { logError } from '../../utils/logger'
import { fetchTranslatedContents } from './fetch-related-content'

const mockedAxios = axios as jest.Mocked<typeof axios>
const mockLogError = logError as jest.Mock

beforeEach(() => {
  mockLogError.mockClear()
})

/**
 * @description Verifies fetchTranslatedContents builds the expected search
 * request body/URL, always includes the original query as the first id, and
 * appends related ids from isTranslationOf/hasTranslations when the upstream
 * response contains a matching content entry.
 */
describe('fetchTranslatedContents', () => {
  it('should post the expected search body to the authsearch5 endpoint', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      result: { response: { result: [] } },
    })

    await fetchTranslatedContents('do_1', 'uuid-1', 'myOrg')

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://sb-ext.test/authsearch5',
      { request: { query: 'do_1', rootOrg: 'myOrg', uuid: 'uuid-1' } },
      expect.objectContaining({ timeout: expect.any(Number) })
    )
  })

  it('should default rootOrg to iGOT when not provided', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      result: { response: { result: [] } },
    })

    await fetchTranslatedContents('do_1', 'uuid-1')

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://sb-ext.test/authsearch5',
      { request: { query: 'do_1', rootOrg: 'iGOT', uuid: 'uuid-1' } },
      expect.anything()
    )
  })

  it('should append isTranslationOf and hasTranslations identifiers when a matching content entry is found', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      result: {
        response: {
          result: [
            {
              hasTranslations: [{ identifier: 'trans_1', locale: 'hi' }, { identifier: 'trans_2', locale: 'ta' }],
              identifier: 'do_1',
              isTranslationOf: [{ identifier: 'orig_1', locale: 'en' }],
            },
          ],
        },
      },
    })

    const ids = await fetchTranslatedContents('do_1', 'uuid-1')

    expect(ids).toEqual(['do_1', 'orig_1', 'trans_1', 'trans_2'])
  })

  it('should return only the query id when isTranslationOf and hasTranslations are absent on the matching entry', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      result: {
        response: {
          result: [{ identifier: 'do_1' }],
        },
      },
    })

    const ids = await fetchTranslatedContents('do_1', 'uuid-1')

    expect(ids).toEqual(['do_1'])
  })

  it('should return only the query id when isTranslationOf and hasTranslations are empty arrays', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      result: {
        response: {
          result: [{ hasTranslations: [], identifier: 'do_1', isTranslationOf: [] }],
        },
      },
    })

    const ids = await fetchTranslatedContents('do_1', 'uuid-1')

    expect(ids).toEqual(['do_1'])
  })

  it('should return only the query id when no result entry matches the query identifier', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      result: {
        response: {
          result: [{ identifier: 'some_other_id' }],
        },
      },
    })

    const ids = await fetchTranslatedContents('do_1', 'uuid-1')

    expect(ids).toEqual(['do_1'])
  })

  it('should return only the query id when the response result array is empty', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      result: { response: { result: [] } },
    })

    const ids = await fetchTranslatedContents('do_1', 'uuid-1')

    expect(ids).toEqual(['do_1'])
  })

  it('should return only the query id when result.response.result is missing entirely', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      result: { response: {} },
    })

    const ids = await fetchTranslatedContents('do_1', 'uuid-1')

    expect(ids).toEqual(['do_1'])
  })

  it('should return only the query id when the axios response has no result field at all', async () => {
    mockedAxios.post.mockResolvedValueOnce({})

    const ids = await fetchTranslatedContents('do_1', 'uuid-1')

    expect(ids).toEqual(['do_1'])
  })

  it('should catch a rejected axios call, log the error, and still return the query id', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('network down'))

    const ids = await fetchTranslatedContents('do_1', 'uuid-1')

    expect(ids).toEqual(['do_1'])
    expect(mockLogError).toHaveBeenCalledTimes(1)
    expect(mockLogError.mock.calls[0][0]).toContain(
      'Authoring tool Search for related content failed. Error :'
    )
  })
})
