/**
 * Coverage for src/authoring/content/hierarchy-and-content.ts.
 *
 * Like its sibling hierarchy.ts, this file exports plain async helper
 * functions (getHierarchyV2WithContent, getMultipleHierarchyV2WithContent) —
 * not an Express Router. It has no direct dependency on `../../utils/env`
 * (grepped: no `CONSTANTS` reference in this file at all), so no env mock is
 * needed here. It composes two collaborators: `./hierarchy`
 * (getHierarchyV2 / getMultipleHierarchyV2) and
 * `../utils/read-meta-and-json` (readJSONData), both of which are mocked
 * wholesale so these tests isolate the composition/aggregation logic that is
 * this file's actual contract.
 *
 * SAFETY NOTE (candidate for docs/PROD-VERIFICATION.md, not edited here per
 * campaign process): neither function has a try/catch around its awaited
 * calls. That is safe to test live here (not a Pattern C hang) because both
 * are plain async functions whose returned promise is awaited directly by
 * this test's own `await`/`.rejects` — there is no fire-and-forget path.
 */

jest.mock('./hierarchy', () => ({
  getHierarchyV2: jest.fn(),
  getMultipleHierarchyV2: jest.fn(),
}))

jest.mock('../utils/read-meta-and-json', () => ({
  readJSONData: jest.fn(),
}))

import { Request } from 'express'
import { readJSONData } from '../utils/read-meta-and-json'
import { getHierarchyV2, getMultipleHierarchyV2 } from './hierarchy'
import {
  getHierarchyV2WithContent,
  getMultipleHierarchyV2WithContent,
} from './hierarchy-and-content'

const mockGetHierarchyV2 = getHierarchyV2 as jest.Mock
const mockGetMultipleHierarchyV2 = getMultipleHierarchyV2 as jest.Mock
const mockReadJSONData = readJSONData as jest.Mock

const req = {} as Request

beforeEach(() => {
  jest.clearAllMocks()
})

/**
 * @description Verifies getHierarchyV2WithContent fetches a single
 * hierarchy via getHierarchyV2, feeds the resolved content into
 * readJSONData, and resolves with both the content and derived data. Also
 * verifies it rejects when either the hierarchy fetch or the JSON read
 * fails, without either call being made unnecessarily.
 */
describe('getHierarchyV2WithContent', () => {
  it('should resolve with the fetched content and its derived data when both calls succeed', async () => {
    const content = { identifier: 'do_1', artifactUrl: 'https://s3/do_1.json' }
    mockGetHierarchyV2.mockResolvedValueOnce(content)
    mockReadJSONData.mockResolvedValueOnce({ pageJson: [] })

    const result = await getHierarchyV2WithContent('do_1', 'org-1', 'root-1', req)

    expect(result).toEqual({ content, data: { pageJson: [] } })
    expect(mockGetHierarchyV2).toHaveBeenCalledWith('do_1', 'org-1', 'root-1', req)
    expect(mockReadJSONData).toHaveBeenCalledWith(content)
  })

  it('should resolve with null data when readJSONData resolves null (e.g. no artifactUrl)', async () => {
    const content = { identifier: 'do_1' }
    mockGetHierarchyV2.mockResolvedValueOnce(content)
    mockReadJSONData.mockResolvedValueOnce(null)

    const result = await getHierarchyV2WithContent('do_1', 'org-1', 'root-1', req)

    expect(result).toEqual({ content, data: null })
  })

  it('should reject and skip readJSONData when getHierarchyV2 fails', async () => {
    mockGetHierarchyV2.mockRejectedValueOnce(new Error('hierarchy boom'))

    await expect(
      getHierarchyV2WithContent('do_1', 'org-1', 'root-1', req)
    ).rejects.toThrow('hierarchy boom')
    expect(mockReadJSONData).not.toHaveBeenCalled()
  })

  it('should reject when getHierarchyV2 succeeds but readJSONData fails', async () => {
    const content = { identifier: 'do_1', artifactUrl: 'https://s3/do_1.json' }
    mockGetHierarchyV2.mockResolvedValueOnce(content)
    mockReadJSONData.mockRejectedValueOnce(new Error('json boom'))

    await expect(
      getHierarchyV2WithContent('do_1', 'org-1', 'root-1', req)
    ).rejects.toThrow('json boom')
  })
})

/**
 * @description Verifies getMultipleHierarchyV2WithContent fetches multiple
 * hierarchies via getMultipleHierarchyV2, resolves each item's derived data
 * via readJSONData, and aggregates them into a content/data pair array in
 * the original order. Also verifies it rejects when the multi-fetch fails
 * and when any individual readJSONData call fails, and that it resolves to
 * an empty array when there are no contents.
 */
describe('getMultipleHierarchyV2WithContent', () => {
  it('should resolve with a content/data pair for each fetched item, in order', async () => {
    const contents = [
      { identifier: 'do_1', artifactUrl: 'https://s3/do_1.json' },
      { identifier: 'do_2', artifactUrl: 'https://s3/do_2.json' },
    ]
    mockGetMultipleHierarchyV2.mockResolvedValueOnce(contents)
    mockReadJSONData
      .mockResolvedValueOnce({ pageJson: ['p1'] })
      .mockResolvedValueOnce({ pageJson: ['p2'] })

    const result = await getMultipleHierarchyV2WithContent(
      ['do_1', 'do_2'],
      'org-1',
      'root-1',
      req
    )

    expect(result).toEqual([
      { content: contents[0], data: { pageJson: ['p1'] } },
      { content: contents[1], data: { pageJson: ['p2'] } },
    ])
    expect(mockGetMultipleHierarchyV2).toHaveBeenCalledWith(
      ['do_1', 'do_2'],
      'org-1',
      'root-1',
      req
    )
    expect(mockReadJSONData).toHaveBeenNthCalledWith(1, contents[0])
    expect(mockReadJSONData).toHaveBeenNthCalledWith(2, contents[1])
  })

  it('should resolve with an empty array when getMultipleHierarchyV2 resolves no contents', async () => {
    mockGetMultipleHierarchyV2.mockResolvedValueOnce([])

    const result = await getMultipleHierarchyV2WithContent([], 'org-1', 'root-1', req)

    expect(result).toEqual([])
    expect(mockReadJSONData).not.toHaveBeenCalled()
  })

  it('should reject and skip readJSONData when getMultipleHierarchyV2 fails', async () => {
    mockGetMultipleHierarchyV2.mockRejectedValueOnce(new Error('multi boom'))

    await expect(
      getMultipleHierarchyV2WithContent(['do_1'], 'org-1', 'root-1', req)
    ).rejects.toThrow('multi boom')
    expect(mockReadJSONData).not.toHaveBeenCalled()
  })

  it('should reject when readJSONData fails for one of the fetched items', async () => {
    const contents = [{ identifier: 'do_1', artifactUrl: 'https://s3/do_1.json' }]
    mockGetMultipleHierarchyV2.mockResolvedValueOnce(contents)
    mockReadJSONData.mockRejectedValueOnce(new Error('json boom'))

    await expect(
      getMultipleHierarchyV2WithContent(['do_1'], 'org-1', 'root-1', req)
    ).rejects.toThrow('json boom')
  })
})
