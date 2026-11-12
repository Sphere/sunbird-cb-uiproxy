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
 * AI Studio — document to video.
 *
 * The flow is plan first, produce second: `generate-plan` and `revise-plan` only write a
 * script and a cost estimate and cost nothing, while `generate-video` is the single call in
 * this router that spends money. The UI is expected to show `costEstimate.totalUsd` from the
 * plan before letting anyone reach the render.
 *
 * Mounted at `/protected/v8/aiStudio/studio`.
 */
export const studioApi = Router()

/**
 * POST /upload
 * Uploads the source material a video will be built from.
 *
 * Multipart body:
 *   file — PDF, DOCX, TXT, MD, SRT, an image, or a video (MP4/MOV/WEBM)
 *   kind — `document` | `image` | `reference-video`; selects the handling. Forwarded only
 *          when sent: the default is the AI service's to choose, not this proxy's.
 *
 * A document comes back parsed to text with its PDF pages rendered as slide images. A video
 * sent as `kind=document` comes back split into segments with a transcript, which is what
 * puts the studio into edit mode.
 *
 * Response: `{ sourceId, text, filename, chars, pages }`, or `{ sourceId, video, segments }`
 * for a video. Keep `sourceId` — `generate-plan` needs it to find slide pages at render time.
 */
studioApi.post('/upload', async (req: Request, res: Response) => {
    const context = 'studio/upload'
    try {
        const files = filesFromField(req, 'file')

        const formData = new FormData()
        appendField(formData, 'kind', (req.body || {}).kind)
        files.forEach((file) => appendFile(formData, 'file', file))

        logInfo(`AI Studio ${context} initiated with ${files.length} file(s)`)

        const response = await axios.post(API_END_POINTS.studioUpload, formData, {
            headers: multipartHeaders(req, formData),
            maxContentLength: Infinity,
            timeout: TIMEOUTS.UPLOAD,
        })

        logInfo(`AI Studio ${context} successful, sourceId: ${response.data && response.data.sourceId}`)
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, context)
    }
})

/**
 * GET /list-voices
 * Lists the narration voices the AI service currently has provider keys for.
 *
 * Response: the voice roster. An `id` from it is what `generate-plan` takes as `voicePref`.
 */
studioApi.get('/list-voices', async (req: Request, res: Response) => {
    const context = 'studio/list-voices'
    try {
        const response = await axios.get(API_END_POINTS.studioListVoices, {
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
 * POST /generate-plan
 * Writes the script and the cost estimate for a video. Free — nothing is produced.
 *
 * Request body. The AI service requires `docText` and `userPrompt` and defaults the rest;
 * this proxy forwards whatever arrives and relays the service's 400 when something is
 * missing, rather than keeping a second copy of that rule here.
 * {
 *   "docText": "string",
 *   "userPrompt": "string",
 *   "sourceId": "string — from /upload; without it a scene cannot find its slide page",
 *   "videoType": "watercolor | slides | roleplay | translation | videoedit",
 *   "language": "hi | en | kn | te",
 *   "filename": "string",
 *   "contentName": "string",
 *   "depth": "brief | standard | detailed",
 *   "aspectRatio": "string",
 *   "voicePref": "string — a voice id from /list-voices",
 *   "pages": "number",
 *   "useSourceSlides": "boolean — needs sourceId",
 *   "styleGuide": "string",
 *   "userImages": [{ "id": "string", "name": "string", "note": "string" }],
 *   "videoMeta": { "sourceId": "string", "segments": [] }
 * }
 *
 * `creator` is ignored if sent: it is set from the session so spend cannot be attributed to
 * another user.
 *
 * Response: 201 with `{ jobId, plan, costEstimate }`. Keep `jobId` for every later call.
 */
studioApi.post('/generate-plan', async (req: Request, res: Response) => {
    const context = 'studio/generate-plan'
    try {
        const response = await axios.post(API_END_POINTS.studioGeneratePlan, req.body, {
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
 * PATCH /revise-plan/:jobId
 * Reworks an existing plan from reviewer feedback. Free, and repeatable — no media exists yet.
 *
 * Request body:
 * {
 *   "feedback": "string — required by the AI service; an empty one comes back as a 400",
 *   "voicePref": "string — optional, switches the narration voice"
 * }
 *
 * Scenes the feedback does not touch keep their ids, so a later render reuses their cached
 * audio and images. `changedScenes` in the response says what actually moved.
 */
studioApi.patch('/revise-plan/:jobId', async (req: Request, res: Response) => {
    const context = 'studio/revise-plan'
    try {
        const response = await axios.patch(
            API_END_POINTS.studioRevisePlan(req.params.jobId),
            req.body,
            {
                headers: jsonHeaders(req),
                timeout: TIMEOUTS.GENERATION,
            }
        )
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, context)
    }
})

/**
 * POST /generate-video/:jobId
 * Queues the render. This is the one call in this router that spends money.
 *
 * Request body:
 * {
 *   "contentName": "string — names the file in storage, max 200 characters",
 *   "plan": "object — optional; omit to render the stored plan, which is normally right"
 * }
 *
 * `creator` is set from the session, as on /generate-plan.
 *
 * Response: 202 with `{ queuePosition }`. Poll /get-video/:jobId for progress.
 */
studioApi.post('/generate-video/:jobId', async (req: Request, res: Response) => {
    const context = 'studio/generate-video'
    try {
        const jobId = req.params.jobId
        const response = await axios.post(
            API_END_POINTS.studioGenerateVideo(jobId),
            req.body,
            {
                headers: jsonHeaders(req),
                timeout: TIMEOUTS.READ,
            }
        )

        logInfo(`AI Studio ${context} queued jobId: ${jobId} at position ${response.data && response.data.queuePosition}`)
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, context)
    }
})

/**
 * GET /get-video/:jobId
 * The poll target while a video renders — the UI calls it roughly every 2.5 seconds.
 *
 * Response:
 *   status        — planned → rendering → done | failed
 *   progress      — 0-100
 *   queuePosition — 0 means it is rendering now
 *   log[]         — the line-by-line feed shown to the operator
 *   video         — the playable URL, once done
 *   qc            — the visual quality report, once done
 */
studioApi.get('/get-video/:jobId', async (req: Request, res: Response) => {
    const context = 'studio/get-video'
    try {
        const response = await axios.get(API_END_POINTS.studioGetVideo(req.params.jobId), {
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
 * GET /list-videos
 * Lists every video job the AI service holds.
 */
studioApi.get('/list-videos', async (req: Request, res: Response) => {
    const context = 'studio/list-videos'
    try {
        const response = await axios.get(API_END_POINTS.studioListVideos, {
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
 * GET /download-video/:jobId
 * Downloads the finished MP4 with a proper filename.
 *
 * Answers a 302 to a short-lived storage URL, which the browser follows. Do not cache the
 * URL it lands on — it expires.
 */
studioApi.get('/download-video/:jobId', async (req: Request, res: Response) => {
    return forwardDownload(
        req,
        res,
        API_END_POINTS.studioDownloadVideo(req.params.jobId),
        'studio/download-video'
    )
})

/**
 * DELETE /delete-video/:jobId
 * Permanently removes the stored files, the job and its reporting row together.
 *
 * Response: `{ ok, artifacts }` with how many stored files went.
 * 400 while the video is still rendering; 403 when it belongs to another creator and the
 * caller is not an admin — ownership is decided upstream from the consumer identity this
 * proxy sends, which is the signed-in portal user.
 */
studioApi.delete('/delete-video/:jobId', async (req: Request, res: Response) => {
    const context = 'studio/delete-video'
    try {
        const jobId = req.params.jobId
        const response = await axios.delete(API_END_POINTS.studioDeleteVideo(jobId), {
            headers: jsonHeaders(req),
            timeout: TIMEOUTS.READ,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, context)
    }
})

/**
 * Any other path under this router, forwarded to `.../v1/studio` unchanged.
 *
 * Declared last, so every route above wins. It exists so an endpoint the AI service adds to
 * this feature area later is reachable through the portal the day it ships, rather than
 * waiting on a change here. See `forwardAny` for what is and is not relayed.
 */
studioApi.all('/*', async (req: Request, res: Response) => {
    return forwardAny(req, res, UPSTREAM_BASES.studio, 'studio/passthrough')
})
