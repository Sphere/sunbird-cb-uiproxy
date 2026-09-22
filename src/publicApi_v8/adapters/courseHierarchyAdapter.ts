// Every mobile-app consumer of COURSE_HIERARCHY reads `competencies_v1` by calling
// JSON.parse(node.competencies_v1) directly (mobile-course-view.component.ts,
// card.service.ts, learning-card.component.ts, self-assessment.guard.ts, and others -
// home-page.util's types.ts even types the field as `string`). None of them expect an
// array or object. So unlike a "normalize to array" transform, this adapter's job is the
// opposite: guarantee `competencies_v1` is always a valid JSON *string* (or left absent),
// regardless of what shape the backend actually sends - never a real array/object, which
// would make every existing JSON.parse() call throw.

export interface Competency {
  competencyName?: string
  competencyId?: string
  level?: string
  // tslint:disable-next-line: no-any
  [key: string]: any
}

export interface CourseHierarchyNode {
  identifier?: string
  name?: string
  // Raw shape from the backend: string | Competency[] | Competency | null | undefined -
  // widened to `any` here since TSLint caps union types at 2 members; normalizeCompetenciesV1
  // is what actually narrows/handles each real shape.
  // tslint:disable-next-line: no-any
  competencies_v1?: any
  children?: CourseHierarchyNode[]
  // tslint:disable-next-line: no-any
  [key: string]: any
}

export interface CourseHierarchyResponse {
  result?: {
    content?: CourseHierarchyNode
    // tslint:disable-next-line: no-any
    [key: string]: any
  }
  // tslint:disable-next-line: no-any
  [key: string]: any
}

// Type-aware normalization, per the shapes actually seen from the backend:
//  - string   -> re-emitted as-is if it's already valid JSON for an array; a bare object
//                string gets wrapped into a one-element array string; invalid JSON falls
//                back to '[]' rather than throwing
//  - array    -> JSON.stringify'd as-is
//  - object   -> wrapped in a one-element array, then JSON.stringify'd
//  - null / undefined -> left untouched (every consumer truthy-guards the field before
//                parsing, so there's nothing to fix, and forcing a value here would
//                invent data the backend didn't send)
// tslint:disable-next-line: no-any
export const normalizeCompetenciesV1 = (value: any): any => {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    // tslint:disable-next-line: no-any
    let parsed: any
    try {
      parsed = JSON.parse(value)
    } catch {
      return '[]'
    }
    return Array.isArray(parsed) ? value : JSON.stringify([parsed])
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value)
  }

  if (typeof value === 'object') {
    return JSON.stringify([value])
  }

  return '[]'
}

const normalizeNode = (node: CourseHierarchyNode): CourseHierarchyNode => {
  const hasCompetencies = node.competencies_v1 !== undefined
  const children = node.children

  if (!hasCompetencies && !Array.isArray(children)) {
    return node
  }

  return {
    ...node,
    ...(hasCompetencies ? { competencies_v1: normalizeCompetenciesV1(node.competencies_v1) } : {}),
    ...(Array.isArray(children) ? { children: children.map(normalizeNode) } : {}),
  }
}

export const adaptCourseHierarchyResponse = (
  response: CourseHierarchyResponse
): CourseHierarchyResponse => {
  const content = response.result?.content
  if (!content) {
    return response
  }

  return {
    ...response,
    result: {
      ...response.result,
      content: normalizeNode(content),
    },
  }
}
