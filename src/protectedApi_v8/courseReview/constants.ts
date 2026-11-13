import { CONSTANTS } from '../../utils/env'

/**
 * Root of the course reviewer as Kong publishes it, e.g. `https://<kong-host>/course-review`.
 * The service serves its API under `/course-review/v1` as well as `/v1`, and the Kong route
 * does not strip the prefix, so every path below is the service's own path, unchanged.
 */
const COURSE_REVIEW_BASE = CONSTANTS.COURSE_REVIEW_API_BASE

/** The caller secret for the service (CONSTANTS.COURSE_REVIEW_SECRET); empty when not configured. */
export const CALLER_SECRET_ENV = (): string => CONSTANTS.COURSE_REVIEW_SECRET

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
    /**
     * One file of a reviewed HTML package, for the report's preview. `file` is the path inside the
     * package; each of its parts is encoded on its own (the caller has refused "." and "..").
     */
    packageFile: (reviewId: string, contentId: string, token: string, file: string) =>
        `${COURSE_REVIEW_BASE}/v1/package/${segment(reviewId)}/${segment(contentId)}/${segment(token)}/${file.split('/').map(segment).join('/')}`,
    reviewCancel: (reviewId: string) => `${COURSE_REVIEW_BASE}/v1/reviews/${segment(reviewId)}`,
    reviewCreate: `${COURSE_REVIEW_BASE}/v1/reviews`,
    reviewList: `${COURSE_REVIEW_BASE}/v1/reviews`,
    adminReviews: `${COURSE_REVIEW_BASE}/v1/admin/reviews`,
    adminSummary: `${COURSE_REVIEW_BASE}/v1/admin/summary`,
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

/**
 * What the portal is told when the service gives no answer of its own. The same shape as the
 * service's errors (`{ error: { code, message } }`), so the portal reads every failure one way.
 */
export const ERROR_MESSAGES = {
    INTERNAL_SERVER_ERROR: 'Internal server error',
    UPSTREAM_TIMEOUT: 'The AI review service took too long to answer. Try again in a moment.',
    UPSTREAM_UNAVAILABLE: 'The AI review service could not be reached. Try again in a moment.',
}

/**
 * Header names. The three identity headers are the service's whole trust contract: it reads
 * who is asking from them and checks that person against the course. They are built here from
 * the Keycloak session on every call, never copied from the incoming request.
 */
export const HEADERS = {
    CALLER_SECRET: 'x-course-review-secret',
    CONTENT_DISPOSITION: 'Content-Disposition',
    CONTENT_TYPE: 'Content-Type',
    CONTENT_TYPE_JSON: 'application/json',
    USER_ID: 'x-aastrika-user-id',
    USER_NAME: 'x-aastrika-user-name',
    USER_TOKEN: 'x-authenticated-user-token',
}

/**
 * Each a little longer than the work behind it, so the service's own answer (or Kong's) comes
 * back rather than a cut-off here.
 */
export const TIMEOUTS = {
    /** Starting a review reads the course, its competencies and the result cache. */
    CREATE: 60000,
    /** The FRAC role check reads a position's roles and activities from the FRAC service. */
    FRAC: 45000,
    /** Measuring opens every PDF and video of a course or upload; Kong allows it 130 s. */
    MEASURE: 150000,
    /** A package file: the first one waits while the service fetches the package's zip. */
    PACKAGE: 90000,
    READ: 30000,
    WRITE: 30000,
}
