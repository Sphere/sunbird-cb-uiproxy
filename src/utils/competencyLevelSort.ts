// tslint:disable-next-line: no-any
interface ICourseForCompetencySort {
  lang: string
  competencies_v1: string
  lastUpdatedOn: string
  // tslint:disable-next-line: no-any
  [key: string]: any
}

function getCompetencyLevel(course: ICourseForCompetencySort) {
  try {
    const parsed = JSON.parse(course.competencies_v1)
    return Number(parsed[0]?.level || 0)
  } catch {
    return 0
  }
}

// sonar-cleanup: extracted from publicSearch.ts's and ratingsSearch.ts's byte-identical
// competency-level grouping/sort block inside '/getCourses' — only applied when the
// request's filters.competencySearch has 5 or more entries (CHANGE 42)
/**
 * Groups courses by `lang`, then within each group sorts ascending by
 * competency level (parsed from `competencies_v1`, defaulting to 0),
 * breaking ties by most-recently-updated first.
 *
 * @param courses - the courses to group and sort
 */
export function sortCoursesByCompetencyLevel(
  courses: ICourseForCompetencySort[]
): ICourseForCompetencySort[] {
  const grouped: Record<string, ICourseForCompetencySort[]> = courses.reduce((acc, course) => {
    acc[course.lang] = acc[course.lang] ?? []
    acc[course.lang].push(course)
    return acc
  }, {})

  return Object.values(grouped).flatMap((group) => {
    return group.slice().sort((a, b) => {
      const levelDiff = getCompetencyLevel(a) - getCompetencyLevel(b)
      if (levelDiff !== 0) return levelDiff
      return new Date(b.lastUpdatedOn).getTime() - new Date(a.lastUpdatedOn).getTime()
    })
  })
}

/**
 * True when a request's `filters.competencySearch` is an array with 5 or
 * more entries — the threshold both publicSearch.ts and ratingsSearch.ts
 * use to decide whether to apply the competency-level grouping/sort.
 *
 * @param filters - the request's filters object
 */
// tslint:disable-next-line: no-any
export function hasCompetencySearchThreshold(filters: any): boolean {
  return (
    filters.hasOwnProperty('competencySearch') &&
    Array.isArray(filters.competencySearch) &&
    filters.competencySearch.length >= 5
  )
}
