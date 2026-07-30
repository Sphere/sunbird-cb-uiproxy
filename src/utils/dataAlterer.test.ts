import { returnData } from './dataAlterer'

// contentMapper swaps these two in both directions.
const COLLECTION = 'Collection'
const COURSE_UNIT = 'CourseUnit'

describe('returnData - guard clauses', () => {
  it.each([null, undefined, {}, [], ''])('returns false for empty input %p', (input) => {
    expect(returnData(input as never)).toBe(false)
  })
})

describe('returnData - flat level (default)', () => {
  it('swaps Collection to CourseUnit', () => {
    const data = { req: { content: { contentType: COLLECTION } } }
    expect(returnData(data, 'req').req.content.contentType).toBe(COURSE_UNIT)
  })

  it('swaps CourseUnit to Collection', () => {
    const data = { req: { content: { contentType: COURSE_UNIT } } }
    expect(returnData(data, 'req').req.content.contentType).toBe(COLLECTION)
  })

  it('leaves any other contentType untouched', () => {
    const data = { req: { content: { contentType: 'Resource' } } }
    expect(returnData(data, 'req').req.content.contentType).toBe('Resource')
  })

  it('returns false from alterData when the keyed object is missing', () => {
    // dataToAlter is undefined -> alterData(undefined) defaults to null -> false
    const data = { other: { content: { contentType: COLLECTION } } }
    expect(returnData(data, 'missingKey').missingKey).toBe(false)
  })
})

describe('returnData - hierarchy level', () => {
  it('swaps the first matching contentType in a request hierarchy and stops', () => {
    const data = {
      request: {
        data: {
          hierarchy: {
            a: { contentType: COLLECTION },
            b: { contentType: COLLECTION },
          },
        },
      },
    }
    const result = returnData(data, null, 'hierarchy')
    // The implementation breaks after the first match, so only 'a' changes.
    expect(result.request.data.hierarchy.a.contentType).toBe(COURSE_UNIT)
    expect(result.request.data.hierarchy.b.contentType).toBe(COLLECTION)
  })

  it('ignores hierarchy entries with an unrelated contentType', () => {
    const data = {
      request: { data: { hierarchy: { a: { contentType: 'Resource' } } } },
    }
    expect(returnData(data, null, 'hierarchy').request.data.hierarchy.a.contentType).toBe(
      'Resource'
    )
  })

  it('maps every matching child of a successful result', () => {
    const data = {
      params: { status: 'successful' },
      result: {
        content: {
          children: [
            { contentType: COLLECTION },
            { contentType: COURSE_UNIT },
            { contentType: 'Resource' },
          ],
        },
      },
    }
    const children = returnData(data, null, 'hierarchy').result.content.children
    expect(children[0].contentType).toBe(COURSE_UNIT)
    expect(children[1].contentType).toBe(COLLECTION)
    expect(children[2].contentType).toBe('Resource')
  })

  it('handles a successful result with no children', () => {
    const data = { params: { status: 'successful' }, result: { content: { children: [] } } }
    expect(returnData(data, null, 'hierarchy').result.content.children).toEqual([])
  })

  it('handles a successful result with no content', () => {
    const data = { params: { status: 'successful' }, result: {} }
    expect(returnData(data, null, 'hierarchy').result).toEqual({})
  })

  it('returns data untouched when status is not successful', () => {
    const data = { params: { status: 'failed' }, result: { content: { children: [] } } }
    expect(returnData(data, null, 'hierarchy')).toEqual(data)
  })
})
