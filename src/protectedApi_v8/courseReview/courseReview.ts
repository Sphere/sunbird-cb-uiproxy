import axios from 'axios'
import { Request, Response, Router } from 'express'
import { API_END_POINTS, HEADERS, TIMEOUTS } from './constants'
import { buildUpstreamHeaders, callerHeaders, handleUpstreamError, relay, requestLogger } from './helpers'

/**
 * AI course review: the Creation Portal's "AI Review" on a course.
 *
 * Mounted at `/protected/v8/courseReview`, forwarding to the course reviewer service through
 * Kong (`/course-review/v1/...`). The service reads the course and its files itself and checks
 * that the user is the course's creator, a reviewer or a publisher; this proxy's job is to say
 * who the user is (see `buildUpstreamHeaders`) and to relay the answer untouched.
 *
 * Unlike AI Studio there is no wildcard passthrough. Starting a review spends provider credit,
 * so only the endpoints written out below are reachable, each with its whitelist entry.
 *
 * Every route is reachable as `/reviews` and as `/v1/reviews`, like AI Studio, because a client
 * written against the service's own API keeps its `/v1`.
 *
 * Request bodies are not validated here. The service validates them and its 400, with its own
 * message, is relayed back.
 */
/** Answers that must never come from a cache: signed uploads (a credential) and live status. */
const noStore = (res: Response) => res.setHeader('Cache-Control', 'no-store')

export const courseReviewApi = Router()
const routes = Router()

courseReviewApi.use(requestLogger)
courseReviewApi.use('/v1', routes)
courseReviewApi.use('/', routes)

/** GET /checklist: the CBP indicators the review scores against. */
routes.get('/checklist', async (req: Request, res: Response) => {
    try {
        const response = await axios.get(API_END_POINTS.checklist, {
            headers: buildUpstreamHeaders(req),
            timeout: TIMEOUTS.READ,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, 'checklist')
    }
})

/**
 * GET /courses/:courseId/preview: the setup screen. The course's resources (and which can be
 * reviewed), its competencies and positions, and a cost estimate. Nothing is spent.
 */
routes.get('/courses/:courseId/preview', async (req: Request, res: Response) => {
    try {
        const response = await axios.get(API_END_POINTS.coursePreview(req.params.courseId), {
            headers: buildUpstreamHeaders(req),
            timeout: TIMEOUTS.READ,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, 'courses/preview')
    }
})

/**
 * POST /courses/:courseId/frac `{ options }`: for the setup screen in the FRAC style. The
 * chosen position's FRAC activities that need the judged competencies, or why there are none.
 * Nothing is spent on AI.
 */
routes.post('/courses/:courseId/frac', async (req: Request, res: Response) => {
    try {
        const response = await axios.post(API_END_POINTS.courseFrac(req.params.courseId), req.body || {}, {
            headers: buildUpstreamHeaders(req, true),
            timeout: TIMEOUTS.FRAC,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, 'courses/frac')
    }
})

/**
 * GET /courses/:courseId/measure: for the setup screen, after the preview. The pages of each
 * PDF and the questions of each quiz or assessment, with the estimate at those sizes. Slower
 * than the preview (PDFs are opened), so it has the longer timeout. Nothing is spent on AI.
 */
routes.get('/courses/:courseId/measure', async (req: Request, res: Response) => {
    try {
        const response = await axios.get(API_END_POINTS.courseMeasure(req.params.courseId), {
            headers: buildUpstreamHeaders(req),
            timeout: TIMEOUTS.MEASURE,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, 'courses/measure')
    }
})

/**
 * POST /courses/:courseId/reuse `{ options }`: for the setup screen as settings change. Which
 * resources are unchanged since a review with these settings, so their earlier result is
 * reused at no cost. Nothing is spent.
 */
routes.post('/courses/:courseId/reuse', async (req: Request, res: Response) => {
    try {
        const response = await axios.post(API_END_POINTS.courseReuse(req.params.courseId), req.body || {}, {
            headers: buildUpstreamHeaders(req, true),
            timeout: TIMEOUTS.READ,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, 'courses/reuse')
    }
})

/**
 * POST /reviews `{ courseId, options }`: starts a review. 202 with the new `reviewId`, or 200
 * with the running one when the course is already being reviewed. 429 when the user is at a
 * limit or the monthly budget is spent.
 */
routes.post('/reviews', async (req: Request, res: Response) => {
    try {
        const response = await axios.post(API_END_POINTS.reviewCreate, req.body || {}, {
            headers: buildUpstreamHeaders(req, true),
            timeout: TIMEOUTS.CREATE,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, 'reviews/create')
    }
})

/** GET /reviews?courseId=: a course's review history. Only `courseId` is forwarded. */
routes.get('/reviews', async (req: Request, res: Response) => {
    try {
        const response = await axios.get(API_END_POINTS.reviewList, {
            headers: buildUpstreamHeaders(req),
            params: { courseId: req.query.courseId },
            timeout: TIMEOUTS.READ,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, 'reviews/list')
    }
})

/**
 * GET /reviews/:id/report.md: the report as a Markdown download. Declared before `/reviews/:id`
 * only for readability; the extra path segment keeps the two from matching each other.
 */
routes.get('/reviews/:id/report.md', async (req: Request, res: Response) => {
    try {
        const response = await axios.get(API_END_POINTS.reviewReport(req.params.id), {
            headers: buildUpstreamHeaders(req),
            responseType: 'arraybuffer',
            timeout: TIMEOUTS.READ,
        })
        const disposition = response.headers[HEADERS.CONTENT_DISPOSITION.toLowerCase()]
        if (disposition) {
            res.setHeader(HEADERS.CONTENT_DISPOSITION, disposition)
        }
        res.setHeader(HEADERS.CONTENT_TYPE, response.headers[HEADERS.CONTENT_TYPE.toLowerCase()] || 'text/markdown')
        return res.status(response.status).send(Buffer.from(response.data))
    } catch (error) {
        // An arraybuffer error body has to be decoded before it can be relayed as JSON.
        if (error && error.response && error.response.data instanceof Buffer) {
            try {
                error.response.data = JSON.parse(error.response.data.toString('utf8'))
            } catch (parseError) {
                error.response.data = { message: error.response.data.toString('utf8') }
            }
        }
        return handleUpstreamError(res, error, 'reviews/report')
    }
})

/**
 * The sandbox the service sends with every package file. Set here as well, whatever came back:
 * a package is somebody else's HTML and scripts, and it must never run with the portal's origin
 * (its cookies, storage and pages), even when the link is opened in a tab of its own.
 */
export const PACKAGE_SANDBOX = "sandbox allow-scripts allow-forms allow-popups allow-modals; frame-ancestors 'self'"
const PACKAGE_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'x-content-type-options', 'referrer-policy', 'cache-control']
/** One byte range ("bytes=0-", "bytes=500-999", "bytes=-500"): what a video player asks for to seek. */
const BYTE_RANGE = /^bytes=\d*-\d*$/

/** A stream's body as JSON (an error from the service), or its text as a message. */
const streamJson = (stream: NodeJS.ReadableStream): Promise<unknown> =>
    new Promise((resolve) => {
        const chunks: Buffer[] = []
        stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)))
        stream.on('error', () => resolve({ message: 'The package file could not be read.' }))
        stream.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8')
            try {
                resolve(JSON.parse(text))
            } catch (parseError) {
                resolve({ message: text })
            }
        })
    })

/**
 * GET /package/:reviewId/:contentId/:token/*: one file of a reviewed HTML package, for the
 * report's preview frame, streamed through as it comes.
 *
 * Mounted under /public/v8, outside the session: the package runs sandboxed in an opaque
 * origin, so the requests for its scripts, styles, images and videos are cross-site to the
 * browser and carry no session cookie. The signed token (handed out by GET /reviews/:id, which
 * does check the user) is what authorises it, and the service checks it; no user is sent on.
 * Paths with "." or ".." parts are refused here, so a crafted link cannot reach another route.
 */
export const courseReviewPublicApi = Router()
courseReviewPublicApi.use(requestLogger)
courseReviewPublicApi.get('/package/:reviewId/:contentId/:token/*', async (req: Request, res: Response) => {
    const file = String((req.params as Record<string, string>)[0] || '')
    if (file.split('/').some((part) => part === '.' || part === '..') || file.indexOf('\\') !== -1) {
        return res.status(400).json({ error: { code: 'BAD_PATH', message: 'Not a file of this package.' } })
    }
    try {
        const response = await axios.get(API_END_POINTS.packageFile(req.params.reviewId, req.params.contentId, req.params.token, file), {
            headers: { ...callerHeaders(), ...(BYTE_RANGE.test(String(req.headers.range || '')) ? { range: String(req.headers.range) } : {}) },
            maxRedirects: 0,
            responseType: 'stream',
            timeout: TIMEOUTS.PACKAGE,
            // 416 (a range past the end) is passed on as it is, with its Content-Range.
            validateStatus: (status: number) => (status >= 200 && status < 300) || status === 416,
        })
        PACKAGE_HEADERS.forEach((name) => {
            const value = response.headers[name]
            if (value) {
                res.setHeader(name, value)
            }
        })
        res.setHeader('Content-Security-Policy', PACKAGE_SANDBOX)
        // no-transform keeps compression() off: a gzipped part of a file breaks a ranged reply.
        res.setHeader('Cache-Control', 'private, max-age=600, no-transform')
        res.status(response.status)
        response.data.on('error', () => res.destroy())
        return response.data.pipe(res)
    } catch (error) {
        if (error && error.response && error.response.data && typeof error.response.data.pipe === 'function') {
            error.response.data = await streamJson(error.response.data)
        }
        return handleUpstreamError(res, error, 'package')
    }
})

/** GET /reviews/:id: status, progress and, when done, the report. The portal polls this. */
routes.get('/reviews/:id', async (req: Request, res: Response) => {
    try {
        const response = await axios.get(API_END_POINTS.reviewRead(req.params.id), {
            headers: buildUpstreamHeaders(req),
            timeout: TIMEOUTS.READ,
        })
        // A poll must never be answered from a cache with a stale status.
        noStore(res)
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, 'reviews/read')
    }
})

// ---- files reviewed on their own (not part of a course) ------------------------------------
// Only small JSON passes through here. The service signs one upload per file and the browser
// sends the file straight to storage, so no file is held in this proxy's memory.

/** GET /uploads/context: the file review's setup screen (dictionary, positions, accepted files). */
routes.get('/uploads/context', async (req: Request, res: Response) => {
    try {
        const response = await axios.get(API_END_POINTS.uploadContext, {
            headers: buildUpstreamHeaders(req),
            timeout: TIMEOUTS.READ,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, 'uploads/context')
    }
})

/**
 * POST /uploads `{ files: [{ name, size, kind }] }`: one signed upload per file. A signed upload
 * is a short-lived credential for one storage object, so the answer is never cached.
 */
routes.post('/uploads', async (req: Request, res: Response) => {
    try {
        const response = await axios.post(API_END_POINTS.uploadSign, req.body || {}, {
            headers: buildUpstreamHeaders(req, true),
            timeout: TIMEOUTS.WRITE,
        })
        noStore(res)
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, 'uploads/sign')
    }
})

/**
 * POST /uploads/measure `{ uploadIds }`: confirms each uploaded file and measures it (a video's
 * length, a PDF's pages). Opening a file takes a while, so it has the measuring timeout.
 */
routes.post('/uploads/measure', async (req: Request, res: Response) => {
    try {
        const response = await axios.post(API_END_POINTS.uploadMeasure, req.body || {}, {
            headers: buildUpstreamHeaders(req, true),
            timeout: TIMEOUTS.MEASURE,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, 'uploads/measure')
    }
})

/**
 * PATCH /uploads/:uploadId `{ kind }`: says an uploaded sheet is a quiz or an assessment. The
 * stored questions are the same either way, so the browser does not upload the file again.
 */
routes.patch('/uploads/:uploadId', async (req: Request, res: Response) => {
    try {
        const response = await axios.patch(API_END_POINTS.uploadKind(req.params.uploadId), req.body || {}, {
            headers: buildUpstreamHeaders(req, true),
            timeout: TIMEOUTS.WRITE,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, 'uploads/kind')
    }
})

/** POST /uploads/frac `{ options }`: the FRAC role check for a file review's settings. */
routes.post('/uploads/frac', async (req: Request, res: Response) => {
    try {
        const response = await axios.post(API_END_POINTS.uploadFrac, req.body || {}, {
            headers: buildUpstreamHeaders(req, true),
            timeout: TIMEOUTS.FRAC,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, 'uploads/frac')
    }
})

/**
 * POST /uploads/reviews `{ title, uploadIds, options }`: starts a review of the user's files.
 * The service checks each file again before queueing, so this has the measuring timeout too.
 */
routes.post('/uploads/reviews', async (req: Request, res: Response) => {
    try {
        const response = await axios.post(API_END_POINTS.uploadReviewCreate, req.body || {}, {
            headers: buildUpstreamHeaders(req, true),
            timeout: TIMEOUTS.MEASURE,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, 'uploads/reviews/create')
    }
})

/** GET /uploads/reviews: the user's own file reviews, newest first. */
routes.get('/uploads/reviews', async (req: Request, res: Response) => {
    try {
        const response = await axios.get(API_END_POINTS.uploadReviewList, {
            headers: buildUpstreamHeaders(req),
            timeout: TIMEOUTS.READ,
        })
        noStore(res)
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, 'uploads/reviews/list')
    }
})

/** DELETE /reviews/:id: cancels a queued or running review. */
routes.delete('/reviews/:id', async (req: Request, res: Response) => {
    try {
        const response = await axios.delete(API_END_POINTS.reviewCancel(req.params.id), {
            headers: buildUpstreamHeaders(req),
            timeout: TIMEOUTS.WRITE,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, 'reviews/cancel')
    }
})
