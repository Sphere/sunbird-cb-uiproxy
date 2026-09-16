/**
 * Coverage for src/authoring/content/hierarchy.ts.
 *
 * Unlike most files in this campaign, hierarchy.ts does not export an Express
 * Router — it exports three plain async helper functions consumed by
 * src/authoring/content/index.ts (see that file's `authApi.get('/hierarchy/...')`
 * handlers, each of which awaits one of these inside its own try/catch). So
 * there is no `mountRouter()`/HTTP layer to exercise here: these tests call
 * the exported functions directly and assert on their resolved/rejected
 * value plus the exact axios call shape (url/body/config), since correct URL
 * construction (org/rootOrg query params, version path, id) IS the contract
 * this file exists to provide.
 *
 * SAFETY NOTE (see docs/PROD-VERIFICATION.md candidates reported alongside
 * this file — not edited here per campaign process):
 *
 * - None of getHierarchy/getHierarchyV2/getMultipleHierarchyV2 has a
 *   try/catch around its axios call. That is safe to test live here (and
 *   not a Pattern C hang) because these are plain async functions returned
 *   to a caller that awaits them — a rejection just rejects the returned
 *   promise, which this test's own `await`/`.rejects` handles directly.
 *   Pattern C only applies where the promise is fire-and-forgotten (e.g. an
 *   Express handler that never awaits/returns the chain); that is not the
 *   shape here, and it is exactly why index.ts's callers each wrap their
 *   `await getHierarchy*(...)` call in a try/catch of their own.
 */

jest.mock('axios')

jest.mock('../../utils/logger', () => ({
  logInfo: jest.fn(),
}))

jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    AUTHORING_BACKEND: 'https://authoring-backend.test',
  },
}))

jest.mock('../utils/header', () => ({
  getHeaders: jest.fn(),
}))

import axios from 'axios'
import { Request } from 'express'
import { DEFAULT_META } from '../constants/default-meta'
import { getHeaders } from '../utils/header'
import { getHierarchy, getHierarchyV2, getMultipleHierarchyV2 } from './hierarchy'

const mockedAxios = axios as jest.Mocked<typeof axios>
const mockGetHeaders = getHeaders as jest.Mock

const req = {} as Request
const stubHeadersConfig = { headers: { authorization: 'stub' } }

beforeEach(() => {
  mockGetHeaders.mockReturnValue(stubHeadersConfig)
})

/**
 * @description Verifies getHierarchy resolves with the upstream hierarchy
 * data and builds the expected org/rootOrg query URL, and that it rejects
 * with the upstream error when the request fails.
 */
describe('getHierarchy', () => {
  it('should resolve with the upstream data when the request succeeds', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { identifier: 'do_1' } })

    const result = await getHierarchy('do_1', 'org-1', 'root-1', req)

    expect(result).toEqual({ identifier: 'do_1' })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://authoring-backend.test/action/content/hierarchy/do_1?org=org-1&rootOrg=root-1',
      stubHeadersConfig
    )
    expect(mockGetHeaders).toHaveBeenCalledWith(req)
  })

  it('should reject with the upstream error when the request fails', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('boom'))

    await expect(getHierarchy('do_1', 'org-1', 'root-1', req)).rejects.toThrow('boom')
  })
})

/**
 * @description Verifies getHierarchyV2 resolves with the upstream v2
 * hierarchy data and posts the DEFAULT_META fields to the expected
 * org/rootOrg query URL, and that it rejects when the request fails.
 */
describe('getHierarchyV2', () => {
  it('should resolve with the upstream data when the request succeeds', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { identifier: 'do_1', children: [] } })

    const result = await getHierarchyV2('do_1', 'org-1', 'root-1', req)

    expect(result).toEqual({ identifier: 'do_1', children: [] })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://authoring-backend.test/action/content/v2/hierarchy/do_1?org=org-1&rootOrg=root-1',
      { fields: DEFAULT_META },
      stubHeadersConfig
    )
  })

  it('should reject with the upstream error when the request fails', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('boom'))

    await expect(getHierarchyV2('do_1', 'org-1', 'root-1', req)).rejects.toThrow('boom')
  })
})

/**
 * @description Verifies getMultipleHierarchyV2 resolves with the upstream
 * array of hierarchy data for multiple identifiers and posts the expected
 * body/URL, and that it rejects with the upstream error when the request
 * fails.
 */
describe('getMultipleHierarchyV2', () => {
  it('should resolve with the upstream data array when the request succeeds', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: [{ identifier: 'do_1' }, { identifier: 'do_2' }],
    })

    const result = await getMultipleHierarchyV2(['do_1', 'do_2'], 'org-1', 'root-1', req)

    expect(result).toEqual([{ identifier: 'do_1' }, { identifier: 'do_2' }])
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://authoring-backend.test/action/content/multiple/hierarchy?org=org-1&rootOrg=root-1',
      { identifier: ['do_1', 'do_2'], fields: DEFAULT_META },
      stubHeadersConfig
    )
  })

  it('should reject with the upstream error when the request fails', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('boom'))

    await expect(
      getMultipleHierarchyV2(['do_1', 'do_2'], 'org-1', 'root-1', req)
    ).rejects.toThrow('boom')
  })
})
