import axios from 'axios'
import { Request, Response, Router } from 'express'
import FormData from 'form-data'
import { logInfo } from '../../utils/logger'
import { API_END_POINTS, TIMEOUTS, UPSTREAM_BASES } from './constants'
import {
    appendField,
    appendFile,
    filesFromField,
    forwardAny,
    forwardDownload,
    handleUpstreamError,
    jsonHeaders,
    multipartHeaders,
    relay,
} from './helpers'

/**
 * Quiz — source material to validated MCQs.
 *
 * Sources are uploaded first (files, links, or a finished video's script), then a question
 * set is generated from them, reviewed, corrected and exported.
 *
 * Mounted at `/protected/v8/aiStudio/quiz`.
 *
 * Route order matters here: `/:quizJobId` is declared last so it cannot swallow `/languages`
 * and `/list`, which are literal single-segment paths on the same router.
 */
export const quizApi = Router()

/**
 * GET /languages
 * Lists the languages questions can be generated in.
 */
quizApi.get('/languages', async (req: Request, res: Response) => {
    const context = 'quiz/languages'
    try {
        const response = await axios.get(API_END_POINTS.quizLanguages, {
            headers: jsonHeaders(req),
            params: req.query,
            timeout: TIMEOUTS.READ,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, context)
    }
})

/**
 * POST /upload
 * Reads source material for a quiz. Video and audio are transcribed automatically.
 *
 * Multipart body:
 *   files    — one or more PDF, DOCX, TXT, video or audio files
 *   language — `hi` | `en` | `kn` | `te`
 *   links    — optional, one URL per line; Drive links must be shared as 'Anyone with the link'
 *
 * The AI service requires at least one file or one link; a request with neither is relayed
 * and comes back as its 400.
 *
 * Response: `{ sources: [{ id, chars } | { id, error }] }`. A source that failed to read
 * comes back with `error` instead of `chars` — surface it rather than dropping it silently.
 */
quizApi.post('/upload', async (req: Request, res: Response) => {
    const context = 'quiz/upload'
    try {
        const files = filesFromField(req, 'files')

        const formData = new FormData()
        files.forEach((file) => appendFile(formData, 'files', file))
        const fields = req.body || {}
        appendField(formData, 'language', fields.language)
        appendField(formData, 'links', fields.links)

        logInfo(`AI Studio ${context} initiated with ${files.length} file(s)`)

        const response = await axios.post(API_END_POINTS.quizUpload, formData, {
            headers: multipartHeaders(req, formData),
            maxContentLength: Infinity,
            timeout: TIMEOUTS.UPLOAD,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, context)
    }
})

/**
 * POST /generate
 * Builds a question set from the uploaded material.
 *
 * Request body:
 * {
 *   "sourceIds": ["string — from /upload"],
 *   "docText": "string — pasted material",
 *   "sourceJobId": "string — a finished video's job id, to question that video's script",
 *   "filename": "string",
 *   "language": "hi | en | kn | te",
 *   "numQuestions": "number, 1-60 (default 10)",
 *   "numOptions": "number, 2-6 (default 4)",
 *   "difficulty": "mixed | easy | medium | hard",
 *   "bloom": "mixed | remember | understand | apply",
 *   "userPrompt": "string"
 * }
 *
 * The AI service requires at least one of `sourceIds`, `docText` or `sourceJobId`, and all
 * three combine into the material. A request carrying none of them is relayed and comes back
 * as its 400. `creator` is set from the session.
 *
 * Response: 201 with `{ jobId, assessment, qcFixed }`.
 *
 * A 422 is deliberate rather than a failure: the material was too thin for the number of
 * questions asked for, and the message says how many it can support. It is relayed intact,
 * so show it verbatim instead of retrying blindly. An unknown source id is a 400
 * `SOURCE_MISSING`.
 */
quizApi.post('/generate', async (req: Request, res: Response) => {
    const context = 'quiz/generate'
    try {
        const response = await axios.post(API_END_POINTS.quizGenerate, req.body, {
            headers: jsonHeaders(req),
            timeout: TIMEOUTS.GENERATION,
        })

        logInfo(`AI Studio ${context} successful, jobId: ${response.data && response.data.jobId}`)
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, context)
    }
})

/**
 * GET /list
 * Lists every quiz the AI service holds.
 */
quizApi.get('/list', async (req: Request, res: Response) => {
    const context = 'quiz/list'
    try {
        const response = await axios.get(API_END_POINTS.quizList, {
            headers: jsonHeaders(req),
            params: req.query,
            timeout: TIMEOUTS.READ,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, context)
    }
})

/**
 * PATCH /update/:quizJobId
 * Saves the operator's corrections over the generated draft.
 *
 * Request body:
 * {
 *   "assessment": {
 *     "title": "string",
 *     "questions": [{
 *       "id": "string",
 *       "question": "string",
 *       "options": ["string"],
 *       "correctIndex": "number",
 *       "explanation": "string",
 *       "difficulty": "string",
 *       "bloom": "string",
 *       "sourceRef": "string"
 *     }]
 *   }
 * }
 *
 * Send the whole assessment, not a patch of one field — the generated set is a draft and
 * this replaces it with the corrected version.
 */
quizApi.patch('/update/:quizJobId', async (req: Request, res: Response) => {
    const context = 'quiz/update'
    try {
        const response = await axios.patch(
            API_END_POINTS.quizUpdate(req.params.quizJobId),
            req.body,
            {
                headers: jsonHeaders(req),
                timeout: TIMEOUTS.READ,
            }
        )
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, context)
    }
})

/**
 * GET /export/:quizJobId?format=xlsx
 * Exports the question set as a spreadsheet.
 *
 * Query: `format` — `xlsx` (default upstream) | `csv`.
 * Answers a 302 to a short-lived storage URL, which the browser follows.
 */
quizApi.get('/export/:quizJobId', async (req: Request, res: Response) => {
    return forwardDownload(
        req,
        res,
        API_END_POINTS.quizExport(req.params.quizJobId),
        'quiz/export'
    )
})

/**
 * DELETE /delete/:quizJobId
 * Removes the quiz and every export it wrote to storage.
 */
quizApi.delete('/delete/:quizJobId', async (req: Request, res: Response) => {
    const context = 'quiz/delete'
    try {
        const quizJobId = req.params.quizJobId
        const response = await axios.delete(API_END_POINTS.quizDelete(quizJobId), {
            headers: jsonHeaders(req),
            timeout: TIMEOUTS.READ,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, context)
    }
})

/**
 * GET /:quizJobId
 * Reads one quiz, including its full question set.
 *
 * Declared last so the literal routes above win — Express matches in declaration order and
 * this pattern would otherwise capture `/languages` and `/list`.
 */
quizApi.get('/:quizJobId', async (req: Request, res: Response) => {
    const context = 'quiz/read'
    try {
        const response = await axios.get(API_END_POINTS.quizRead(req.params.quizJobId), {
            headers: jsonHeaders(req),
            params: req.query,
            timeout: TIMEOUTS.READ,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, context)
    }
})

/**
 * Any other path under this router, forwarded to `.../v1/quiz` unchanged.
 *
 * Declared last, so every route above wins. It exists so an endpoint the AI service adds to
 * this feature area later is reachable through the portal the day it ships, rather than
 * waiting on a change here. See `forwardAny` for what is and is not relayed.
 */
quizApi.all('/*', async (req: Request, res: Response) => {
    return forwardAny(req, res, UPSTREAM_BASES.quiz, 'quiz/passthrough')
})
