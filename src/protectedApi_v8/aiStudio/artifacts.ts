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
 * Artifacts — direct file storage, for files that are not produced by a job.
 *
 * Mounted at `/protected/v8/aiStudio/artifacts`.
 */
export const artifactsApi = Router()

/**
 * POST /upload
 * Stores a file and returns the address it was stored at.
 *
 * Multipart body:
 *   file      — the file to store
 *   contentId — optional; omit to mint a new `do_…` id, pass an existing one to add another
 *               file under it
 *
 * Response: 201 with `{ contentId, filename, key, url }`.
 *
 * Keep `contentId` *and* `filename` and reuse them verbatim: storage addresses an object by
 * its exact key, so neither is derivable from the other and there is no "fetch whatever is
 * under this id".
 */
artifactsApi.post('/upload', async (req: Request, res: Response) => {
    const context = 'artifacts/upload'
    try {
        const files = filesFromField(req, 'file')

        const formData = new FormData()
        files.forEach((file) => appendFile(formData, 'file', file))
        appendField(formData, 'contentId', (req.body || {}).contentId)

        logInfo(`AI Studio ${context} initiated with ${files.length} file(s)`)

        const response = await axios.post(API_END_POINTS.artifactUpload, formData, {
            headers: multipartHeaders(req, formData),
            maxContentLength: Infinity,
            timeout: TIMEOUTS.UPLOAD,
        })

        logInfo(`AI Studio ${context} stored at ${response.data && response.data.key}`)
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, context)
    }
})

/**
 * GET /:contentId/:filename
 * Reads a stored file.
 *
 * Answers a 302 to a short-lived storage URL, or streams the bytes straight through when
 * the AI service is running on local storage.
 */
artifactsApi.get('/:contentId/:filename', async (req: Request, res: Response) => {
    return forwardDownload(
        req,
        res,
        API_END_POINTS.artifactObject(req.params.contentId, req.params.filename),
        'artifacts/read'
    )
})

/**
 * DELETE /:contentId/:filename
 * Removes a stored file. Idempotent — deleting something already gone still answers
 * `{ ok: true }`.
 */
artifactsApi.delete('/:contentId/:filename', async (req: Request, res: Response) => {
    const context = 'artifacts/delete'
    try {
        const { contentId, filename } = req.params
        const response = await axios.delete(API_END_POINTS.artifactObject(contentId, filename), {
            headers: jsonHeaders(req),
            timeout: TIMEOUTS.READ,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, context)
    }
})

/**
 * Any other path under this router, forwarded to `.../v1/artifacts` unchanged.
 *
 * Declared last, so every route above wins. It exists so an endpoint the AI service adds to
 * this feature area later is reachable through the portal the day it ships, rather than
 * waiting on a change here. See `forwardAny` for what is and is not relayed.
 */
artifactsApi.all('/*', async (req: Request, res: Response) => {
    return forwardAny(req, res, UPSTREAM_BASES.artifacts, 'artifacts/passthrough')
})
