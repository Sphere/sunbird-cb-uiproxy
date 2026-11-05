import { CONSTANTS } from '../../utils/env'

/**
 * Root of the course reviewer as Kong publishes it, e.g. `https://<kong-host>/course-review`.
 * The service serves its API under `/course-review/v1` as well as `/v1`, and the Kong route
 * does not strip the prefix, so every path below is the service's own path, unchanged.
 */
const COURSE_REVIEW_BASE = CONSTANTS.COURSE_REVIEW_API_BASE

/**
 * Ids the caller supplies are interpolated into the upstream URL, so they are percent-encoded:
 * neither may introduce a `/` or a `?` and address a different resource. The service validates
 * the shapes itself (`do_…` course ids, UUID review ids) and answers 400 for anything else.
 */
const segment = (value: string): string => encodeURIComponent(value)

/** Every upstream endpoint, keyed by what it does. Functions where an id is interpolated. */
export const API_END_POINTS = {
    checklist: `${COURSE_REVIEW_BASE}/v1/checklist`,
    courseFrac: (courseId: string) => `${COURSE_REVIEW_BASE}/v1/courses/${segment(courseId)}/frac`,
    courseMeasure: (courseId: string) => `${COURSE_REVIEW_BASE}/v1/courses/${segment(courseId)}/measure`,
    coursePreview: (courseId: string) => `${COURSE_REVIEW_BASE}/v1/courses/${segment(courseId)}/preview`,
    courseReuse: (courseId: string) => `${COURSE_REVIEW_BASE}/v1/courses/${segment(courseId)}/reuse`,
    reviewCancel: (reviewId: string) => `${COURSE_REVIEW_BASE}/v1/reviews/${segment(reviewId)}`,
    reviewCreate: `${COURSE_REVIEW_BASE}/v1/reviews`,
    reviewList: `${COURSE_REVIEW_BASE}/v1/reviews`,
    reviewRead: (reviewId: string) => `${COURSE_REVIEW_BASE}/v1/reviews/${segment(reviewId)}`,
    reviewReport: (reviewId: string) => `${COURSE_REVIEW_BASE}/v1/reviews/${segment(reviewId)}/report.md`,
    // Files reviewed on their own (not part of a course). Only JSON passes through here: the
    // browser uploads each file straight to storage with the signed upload the service returns.
    uploadContext: `${COURSE_REVIEW_BASE}/v1/uploads/context`,
    uploadFrac: `${COURSE_REVIEW_BASE}/v1/uploads/frac`,
    uploadKind: (uploadId: string) => `${COURSE_REVIEW_BASE}/v1/uploads/${segment(uploadId)}`,
    uploadMeasure: `${COURSE_REVIEW_BASE}/v1/uploads/measure`,
    uploadReviewCreate: `${COURSE_REVIEW_BASE}/v1/uploads/reviews`,
    uploadReviewList: `${COURSE_REVIEW_BASE}/v1/uploads/reviews`,
    uploadSign: `${COURSE_REVIEW_BASE}/v1/uploads`,
}

export const ERROR_MESSAGES = {
    INTERNAL_SERVER_ERROR: 'Internal server error',
}

/**
 * Header names. The three identity headers are the service's whole trust contract: it reads
 * who is asking from them and checks that person against the course. They are built here from
 * the Keycloak session on every call, never copied from the incoming request.
 */
export const HEADERS = {
    CONTENT_DISPOSITION: 'Content-Disposition',
    CONTENT_TYPE: 'Content-Type',
    CONTENT_TYPE_JSON: 'application/json',
    USER_ID: 'x-aastrika-user-id',
    USER_NAME: 'x-aastrika-user-name',
    USER_TOKEN: 'x-authenticated-user-token',
}

/**
 * Every call is short: the service records a review and queues it, then the portal polls.
 * The preview is the slowest, since it reads the course hierarchy and the competency list.
 */
export const TIMEOUTS = {
    /** Measuring opens every PDF of the course to count its pages. */
    MEASURE: 120000,
    READ: 30000,
    WRITE: 30000,
}
