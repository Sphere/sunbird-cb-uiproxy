// Every mobile-app consumer of COURSE_HIERARCHY reads `competencies_v1` by calling
// JSON.parse(node.competencies_v1) directly (mobile-course-view.component.ts,


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
