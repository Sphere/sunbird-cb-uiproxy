// Course lists sort newest first by the date learners last got new content. lastUpdatedOn
// also moves on rating, metadata and system updates, so it reordered courses nobody had edited.
// Fall back to lastUpdatedOn for a record without a publish date; a missing or unparseable
// date sorts last.

export const COURSE_SORT_FIELD = 'lastPublishedOn'

// tslint:disable-next-line: no-any
export function courseSortTime(course: any): number {
  const value = course && (course.lastPublishedOn || course.lastUpdatedOn)
  const time = value ? new Date(value).getTime() : NaN
  return isNaN(time) ? 0 : time
}
