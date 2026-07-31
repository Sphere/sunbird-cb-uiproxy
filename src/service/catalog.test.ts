/**
 * src/service/catalog.ts exports two plain functions:
 *
 * - getFilters(userId, rootOrg, type): async — builds a search request body
 *   and delegates to searchV5() from ../protectedApi_v8/content, then picks
 *   the matching filter unit's `content` out of the response, falling back
 *   to [] when no filter of the requested type is found.
 * - getFilterUnitByType(filter, type): sync, recursive — walks a filter tree
 *   depth-first looking for a node whose `type` matches, returning null when
 *   nothing matches.
 *
 * searchV5 is the only external dependency and performs a real axios call in
 * production, so its module is mocked outright (matching the pattern used in
 * src/publicApi_v8/home.test.ts) rather than letting it reach axios live.
 */

jest.mock('../protectedApi_v8/content', () => ({
  searchV5: jest.fn(),
}))

import { searchV5 } from '../protectedApi_v8/content'
import { getFilterUnitByType, getFilters } from './catalog'

const mockSearchV5 = searchV5 as jest.Mock

beforeEach(() => {
  mockSearchV5.mockReset()
})

/**
 * @description Verifies getFilters builds the expected search request body,
 * returns the content of the filter unit matching the requested type when
 * present, and falls back to an empty array when no filter unit of that type
 * is found in the searchV5 response.
 */
describe('getFilters', () => {
  it('should call searchV5 with a standalone search request built from userId/rootOrg', async () => {
    mockSearchV5.mockResolvedValueOnce({ filters: [] })

    await getFilters('user-1', 'org-1', 'board')

    expect(mockSearchV5).toHaveBeenCalledWith({
      request: {
        isStandAlone: true,
        pageNo: 0,
        pageSize: 0,
        query: '*',
        rootOrg: 'org-1',
        uuid: 'user-1',
      },
    })
  })

  it('should return the content of the filter unit whose type matches the requested type', async () => {
    const boardContent = [{ count: 2, displayName: 'CBSE', type: 'board' }]
    mockSearchV5.mockResolvedValueOnce({
      filters: [
        { content: [{ count: 1, displayName: 'Other', type: 'grade' }], displayName: 'Grade', type: 'grade' },
        { content: boardContent, displayName: 'Board', type: 'board' },
      ],
    })

    const result = await getFilters('user-1', 'org-1', 'board')

    expect(result).toEqual(boardContent)
  })

  it('should return an empty array when no filter unit of the requested type is found', async () => {
    mockSearchV5.mockResolvedValueOnce({
      filters: [{ content: [{ count: 1, displayName: 'Grade', type: 'grade' }], displayName: 'Grade', type: 'grade' }],
    })

    const result = await getFilters('user-1', 'org-1', 'board')

    expect(result).toEqual([])
  })

  it('should return an empty array when the searchV5 response has no filters at all', async () => {
    mockSearchV5.mockResolvedValueOnce({ filters: [] })

    const result = await getFilters('user-1', 'org-1', 'board')

    expect(result).toEqual([])
  })
})

/**
 * @description Verifies getFilterUnitByType returns the node itself when its
 * type matches, recurses into children (including multiple levels deep) to
 * find a matching descendant, and returns null when the filter is undefined,
 * has no children, or has children none of which match.
 */
describe('getFilterUnitByType', () => {
  it('should return the filter itself when its type matches', () => {
    const filter = { count: 1, displayName: 'CBSE', type: 'board' }

    expect(getFilterUnitByType(filter, 'board')).toEqual(filter)
  })

  it('should return null when the filter is undefined', () => {
    expect(getFilterUnitByType(undefined, 'board')).toBeNull()
  })

  it('should return null when the type does not match and there are no children', () => {
    const filter = { count: 1, displayName: 'Grade', type: 'grade' }

    expect(getFilterUnitByType(filter, 'board')).toBeNull()
  })

  it('should return null when the type does not match and children is explicitly null', () => {
    const filter = { children: null as any, count: 1, displayName: 'Grade', type: 'grade' }

    expect(getFilterUnitByType(filter, 'board')).toBeNull()
  })

  it('should find a matching child among the filter\'s children', () => {
    const match = { count: 1, displayName: 'CBSE', type: 'board' }
    const filter = {
      children: [
        { count: 1, displayName: 'Grade 1', type: 'grade' },
        match,
      ],
      count: 2,
      displayName: 'Root',
      type: 'root',
    }

    expect(getFilterUnitByType(filter, 'board')).toEqual(match)
  })

  it('should find a matching descendant nested multiple levels deep', () => {
    const match = { count: 1, displayName: 'CBSE', type: 'board' }
    const filter = {
      children: [
        {
          children: [
            { children: [match], count: 1, displayName: 'Level 2', type: 'level2' },
          ],
          count: 1,
          displayName: 'Level 1',
          type: 'level1',
        },
      ],
      count: 2,
      displayName: 'Root',
      type: 'root',
    }

    expect(getFilterUnitByType(filter, 'board')).toEqual(match)
  })

  it('should return null when none of the children (recursively) match the type', () => {
    const filter = {
      children: [
        { count: 1, displayName: 'Grade 1', type: 'grade' },
        { children: [{ count: 1, displayName: 'Subject 1', type: 'subject' }], count: 1, displayName: 'Level 1', type: 'level1' },
      ],
      count: 2,
      displayName: 'Root',
      type: 'root',
    }

    expect(getFilterUnitByType(filter, 'board')).toBeNull()
  })
})
