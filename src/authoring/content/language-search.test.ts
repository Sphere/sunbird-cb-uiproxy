/**
 * Coverage for src/authoring/content/language-search.ts.
 *
 * Like hierarchy.ts (its sibling in this directory), language-search.ts does
 * not export an Express Router — it exports a single plain async helper,
 * `searchForOtherLanguage(query, uuid, rootOrg)`, consumed by a caller that
 * awaits it inside its own try/catch. There is no `mountRouter()`/HTTP layer
 * to exercise here: these tests call the exported function directly and
 * assert on its resolved value plus the exact axios call shape (url/body),
 * since correct search-body construction and correct extraction of related
 * translation identifiers IS the contract this file exists to provide.
 *
 * SAFETY NOTE: the axios call here IS wrapped in a try/catch that returns
 * `[query]` on any rejection (see language-search.ts lines 42-67), so testing
 * the rejection path live is safe — it resolves normally, it does not throw,
 * hang, or leave an unhandled rejection. This is not a Pattern C situation.
 */

jest.mock('axios')

jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    SEARCH_API_BASE: 'https://search-api.test',
  },
}))

import axios from 'axios'
import { searchForOtherLanguage } from './language-search'

const mockedAxios = axios as jest.Mocked<typeof axios>

const expectedUrl = 'https://search-api.test/v6/search/auth'

beforeEach(() => {
  jest.clearAllMocks()
})

/**
 * @description Verifies searchForOtherLanguage posts the expected search body
 * (query/uuid/rootOrg plus the fixed status/editing filters) to the search
 * API and returns just the original query when the upstream response
 * contains no usable result data.
 */
describe('searchForOtherLanguage - request shape and no-result-data cases', () => {
  it('should post the expected search body to the search API URL', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: {} })

    await searchForOtherLanguage('do_123', 'uuid-1', 'root-1')

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expectedUrl,
      {
        filters: [
          {
            andFilters: [
              {
                isContentEditingDisabled: [false],
                isMetaEditingDisabled: [false],
                status: [
                  'Draft',
                  'InReview',
                  'Reviewed',
                  'QualityReview',
                  'Live',
                  'Deleted',
                  'MarkedForDeletion',
                  'Processing',
                  'Unpublished',
                ],
              },
            ],
          },
        ],
        query: 'do_123',
        rootOrg: 'root-1',
        uuid: 'uuid-1',
      },
      expect.objectContaining({ timeout: expect.any(Number) })
    )
  })

  it('should return only the original query when v.data is falsy', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: undefined })

    const result = await searchForOtherLanguage('do_123', 'uuid-1', 'root-1')

    expect(result).toEqual(['do_123'])
  })

  it('should return only the original query when v.data.result is missing', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: {} })

    const result = await searchForOtherLanguage('do_123', 'uuid-1', 'root-1')

    expect(result).toEqual(['do_123'])
  })

  it('should return only the original query when no result entry matches the query identifier', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { result: [{ identifier: 'do_other' }] },
    })

    const result = await searchForOtherLanguage('do_123', 'uuid-1', 'root-1')

    expect(result).toEqual(['do_123'])
  })

  it('should return only the original query when the matching entry has no translation metadata', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { result: [{ identifier: 'do_123' }] },
    })

    const result = await searchForOtherLanguage('do_123', 'uuid-1', 'root-1')

    expect(result).toEqual(['do_123'])
  })

  it('should return only the original query when hasTranslations/isTranslationOf are present but empty', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        result: [{ identifier: 'do_123', hasTranslations: [], isTranslationOf: [] }],
      },
    })

    const result = await searchForOtherLanguage('do_123', 'uuid-1', 'root-1')

    expect(result).toEqual(['do_123'])
  })
})

/**
 * @description Verifies searchForOtherLanguage collects related-language
 * identifiers from both the hasTranslations and isTranslationOf metadata
 * arrays on the matching result entry, in addition to the original query.
 */
describe('searchForOtherLanguage - translation identifiers collected', () => {
  it('should include identifiers from hasTranslations on the matching entry', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        result: [
          {
            hasTranslations: [
              { identifier: 'do_hi', locale: 'hi' },
              { identifier: 'do_ta', locale: 'ta' },
            ],
            identifier: 'do_123',
          },
        ],
      },
    })

    const result = await searchForOtherLanguage('do_123', 'uuid-1', 'root-1')

    expect(result).toEqual(['do_123', 'do_hi', 'do_ta'])
  })

  it('should include identifiers from isTranslationOf on the matching entry', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        result: [
          {
            identifier: 'do_123',
            isTranslationOf: [{ identifier: 'do_en', locale: 'en' }],
          },
        ],
      },
    })

    const result = await searchForOtherLanguage('do_123', 'uuid-1', 'root-1')

    expect(result).toEqual(['do_123', 'do_en'])
  })

  it('should include identifiers from both hasTranslations and isTranslationOf when both are present', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        result: [
          {
            hasTranslations: [{ identifier: 'do_hi', locale: 'hi' }],
            identifier: 'do_123',
            isTranslationOf: [{ identifier: 'do_en', locale: 'en' }],
          },
        ],
      },
    })

    const result = await searchForOtherLanguage('do_123', 'uuid-1', 'root-1')

    expect(result).toEqual(['do_123', 'do_hi', 'do_en'])
  })
})

/**
 * @description Verifies searchForOtherLanguage falls back to returning only
 * the original query when the upstream axios call rejects, since the
 * function wraps its axios call in a try/catch with exactly that fallback.
 */
describe('searchForOtherLanguage - upstream failure', () => {
  it('should return only the original query when the axios call rejects', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('boom'))

    const result = await searchForOtherLanguage('do_123', 'uuid-1', 'root-1')

    expect(result).toEqual(['do_123'])
  })
})
