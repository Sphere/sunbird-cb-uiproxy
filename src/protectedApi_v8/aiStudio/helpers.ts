import axios, { AxiosResponse, Method } from 'axios'
import { NextFunction, Request, Response } from 'express'
import { UploadedFile } from 'express-fileupload'
import FormData from 'form-data'
import { CONSTANTS } from '../../utils/env'
import { logError, logInfo } from '../../utils/logger'
import { extractUserToken } from '../../utils/requestExtract'
import { ERROR_MESSAGES, HEADERS, TIMEOUTS } from './constants'

/**
 * The person the AI service records as the creator of whatever a request produces.
 *
 * The service's entire client integration is one header, `x-aastrika-creator`, naming whoever
 * is using the consuming app. Kong's `x-consumer-username` identifies the *application* — one
 * value for every request the portal makes — so it cannot answer "which health worker made
 * this video". Only the portal knows that.
 *
 * The value is taken from the session, never from the incoming request, and it overwrites any
 * `x-aastrika-creator` a caller sent, so nobody can record their spend against someone else.
 *
 * Three sources, in order, each falling through when the one before it is unavailable:
 *
 *  1. **The Keycloak display name** — for example `Meera Nair`. What the usage dashboard's Creator column
 *     is meant to read like, so it is preferred.
 *  2. **The Sunbird `userName`** — `asha.kumari`. Less readable but always distinct, so it is
 *     what a profile with no display name falls back to.
 *  3. **The user id** — a UUID, set on every authenticated request, so something is always
 *     available when the profile has not been read yet.
 *
 * With none of the three the header is omitted entirely and the service records the work
 * against `admin`, which is a truthful "we do not know" rather than a blank name.
 *
 * **A display name is not unique.** Two users sharing a name are one row in the usage
 * report, and their spend cannot be separated afterwards because it was recorded that way.
 * That is an accepted trade for a readable dashboard, not an oversight — if per-person
 * accuracy ever matters more than readability, source 2 is the one to promote.
 *
 * @param req - the incoming request, whose session was populated by Keycloak
 * @returns the creator identity, or an empty string when nothing identifies the user
 */
// tslint:disable-next-line: no-any
export const resolveCreator = (req: any): string => {
    // Read defensively: a request can reach here with a session but no Keycloak grant, and
    // a grant whose token carries no profile claims at all.
    const grant = req && req.kauth && req.kauth.grant
    const claims = (grant && grant.access_token && grant.access_token.content) || {}
    const fullName = [claims.given_name, claims.family_name].filter(Boolean).join(' ')
    const displayName = String(claims.name || fullName || '').trim()

    const session = (req && req.session) || {}
    return displayName || session.userName || session.userId || ''
}

/**
 * The headers every upstream call carries, whichever route or verb produced it.
 *
 *  - **`Authorization`** — the portal's gateway key. Kong identifies the *consuming
 *    application* from it, and answers by stamping its own `x-consumer-username`.
 *  - **`x-authenticated-user-token`** — the signed-in user's Keycloak token. The AI service
 *    does not read it, but every other protected route in this repo that calls Kong on a
 *    user's behalf sends it, so a Kong route or plugin may expect it. Being the one caller
 *    that leaves it out risks an integration that fails only once deployed.
 *  - **`x-aastrika-creator`** — the *person* the work belongs to. See {@link resolveCreator}.
 *  - **`Range`** — forwarded only when the caller sent one, so a player can seek when the AI
 *    service streams bytes itself rather than redirecting to storage.
 *
 * `x-consumer-username` is deliberately never sent: it is Kong's to write, and putting our own
 * value there would be a claim occupying the one field the service treats as proven.
 *
 * The token and creator headers are set only when a value exists, rather than set and filtered
 * afterwards. An `undefined` header value is `ERR_HTTP_INVALID_HEADER_VALUE` in Node, which
 * would surface as an opaque 500 from inside this proxy instead of a 401 from the gateway; and
 * an empty creator would be recorded as a blank name rather than falling through to `admin`.
 *
 * @param req - the incoming request
 * @param extraHeaders - per-call additions: a `Content-Type`, or the boundary form-data
 *                       generated for a multipart body
 * @returns the header map to hand to axios
 */
export const buildUpstreamHeaders = (
    req: Request,
    extraHeaders: Record<string, string> = {}
): Record<string, string> => {
    const headers: Record<string, string> = {
        Authorization: CONSTANTS.SB_API_KEY,
        ...extraHeaders,
    }

    const userToken = extractUserToken(req)
    if (userToken) {
        headers[HEADERS.USER_TOKEN] = userToken
    }

    // Set after the spread so a caller's own x-aastrika-creator, had one arrived in
    // extraHeaders, could never survive into the upstream request.
    const creator = resolveCreator(req)
    if (creator) {
        headers[HEADERS.CREATOR] = creator
    }

    const range = req.headers && req.headers.range
    if (range) {
        headers[HEADERS.RANGE] = String(range)
    }
    return headers
}

/**
 * One log line per request, written when the response finishes.
 *
 * Mounted once on the parent router so every route is covered the same way, rather than each
 * handler logging whatever its author happened to think useful — which is how this ended up
 * with sixteen different formats, none of them carrying a status code or a duration.
 *
 * The line answers the questions worth asking of a proxy:
 *
 *     AI Studio GET /protected/v8/aiStudio/quiz/languages -> 200 412ms creator="Meera Nair"
 *     AI Studio POST /protected/v8/aiStudio/v1/quiz/generate -> 422 1203ms creator="Meera Nair" via=passthrough
 *
 * `via=passthrough` marks a request that matched no named route and went through the wildcard.
 * Seeing it on a path the proxy *does* name usually means the caller sent the upstream shape
 * (`/aiStudio/v1/quiz/...`) rather than the portal shape (`/aiStudio/quiz/...`); both work, but
 * only the second gets that route's validation-free documentation and its own log context.
 *
 * Both `finish` and `close` are listened for: a response whose body is destroyed mid-stream
 * never fires `finish`, and an aborted download that logged nothing at all would be the one
 * case where the log is most wanted.
 *
 * @param req - the incoming request
 * @param res - the response, whose completion the line is written from
 * @param next - passes straight through; nothing here blocks the request
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
    const started = Date.now()
    let written = false
    const write = (outcome: string) => {
        if (written) {
            return
        }
        written = true
        const creator = resolveCreator(req) || 'unknown'
        // tslint:disable-next-line: no-any
        const via = (res as any).locals && (res as any).locals.aiStudioPassthrough ? ' via=passthrough' : ''
        logInfo(
            `AI Studio ${req.method} ${req.originalUrl} -> ${res.statusCode} ` +
            `${Date.now() - started}ms creator="${creator}"${via}${outcome}`
        )
    }
    res.on('finish', () => write(''))
    res.on('close', () => write(' (client gone before the body completed)'))
    next()
}

/** Headers for a JSON upstream call. */
export const jsonHeaders = (req: Request): Record<string, string> =>
    buildUpstreamHeaders(req, { [HEADERS.CONTENT_TYPE]: HEADERS.CONTENT_TYPE_JSON })

/** Headers for a multipart upstream call, including the boundary form-data generated. */
export const multipartHeaders = (req: Request, formData: FormData): Record<string, string> =>
    buildUpstreamHeaders(req, formData.getHeaders())

/**
 * express-fileupload hands back a single `UploadedFile` when one part carried a field name
 * and an array when several did. Normalising here keeps the routes from having to care.
 *
 * @param req - the incoming request
 * @param field - the multipart field name to read
 * @returns every file sent under that field, empty when none were
 */
export const filesFromField = (req: Request, field: string): UploadedFile[] => {
    const uploaded = req.files && req.files[field]
    if (!uploaded) {
        return []
    }
    return Array.isArray(uploaded) ? uploaded : [uploaded]
}

/**
 * Appends an uploaded file to a multipart body, preserving the name and type the browser
 * sent. The AI service picks its parser from those, so neither may be dropped.
 *
 * @param formData - the body being built
 * @param field - the field name the AI service expects (`file` or `files`)
 * @param file - the file as express-fileupload buffered it
 */
export const appendFile = (formData: FormData, field: string, file: UploadedFile): void => {
    formData.append(field, Buffer.from(file.data), {
        contentType: file.mimetype,
        filename: file.name,
    })
}

/**
 * Appends a text field, but only when the caller actually sent it. An empty string is a
 * meaningful value to some endpoints and a placeholder to others, so it is forwarded as-is;
 * only `undefined` and `null` are skipped.
 *
 * @param formData - the body being built
 * @param field - the field name
 * @param value - the value as it arrived on `req.body`
 */
// tslint:disable-next-line: no-any
export const appendField = (formData: FormData, field: string, value: any): void => {
    if (value === undefined || value === null) {
        return
    }
    // A form that carried the same field name twice arrives as an array; repeat it upstream
    // rather than stringifying the array into one part.
    if (Array.isArray(value)) {
        value.forEach((entry) => appendField(formData, field, entry))
        return
    }
    formData.append(field, String(value))
}

/**
 * Forwards an upstream failure to the caller unchanged.
 *
 * The AI service answers with codes the UI is expected to branch on — a 422 when the source
 * material is too thin for the number of questions asked for, a 400 `SOURCE_MISSING`, a 403
 * on someone else's content — so its status and body are passed through rather than
 * collapsed into a generic error. Only a transport failure, where there is no upstream
 * response to relay, becomes a 500.
 *
 * @param res - the response to write
 * @param error - whatever axios rejected with
 * @param context - route name, for the log lines
 */
// tslint:disable-next-line: no-any
export const handleUpstreamError = (res: Response, error: any, context: string): Response => {
    if (error && error.response) {
        logError(`AI Studio ${context} upstream error: status ${error.response.status}`)
        logError(`AI Studio ${context} upstream body: ${JSON.stringify(error.response.data)}`)
        return res.status(error.response.status).json(error.response.data)
    }
    logError(`AI Studio ${context} failed: ${error}`)
    return res.status(500).json({
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        status: 'error',
    })
}

/** Relays a successful upstream response, keeping its status — 201 and 202 both carry meaning here. */
export const relay = (res: Response, response: AxiosResponse): Response =>
    res.status(response.status).json(response.data)

/** Reads a response stream into a string, so an error body can be forwarded verbatim. */
// tslint:disable-next-line: no-any
const drainStream = (stream: any): Promise<string> =>
    new Promise((resolve, reject) => {
        let text = ''
        stream.on('data', (chunk: Buffer) => {
            text += chunk.toString()
        })
        stream.on('end', () => resolve(text))
        stream.on('error', reject)
    })

/**
 * Carries the headers a browser needs to save or seek within the file.
 *
 * `Content-Length` is deliberately **not** among them. Axios decompresses a gzipped body
 * before this code ever sees it and deletes `Content-Encoding` when it does, but leaves the
 * *compressed* `Content-Length` in place — so the header describes bytes the caller will
 * never receive and there is nothing left to detect that from. Copying it makes the browser
 * wait for a body that already ended, and the download fails as `ERR_CONTENT_LENGTH_MISMATCH`.
 * Leaving it off sends the response chunked, which is correct either way; the only thing lost
 * is a determinate progress bar.
 */
const copyDownloadHeaders = (response: AxiosResponse, res: Response): void => {
    const passThrough = [
        HEADERS.ACCEPT_RANGES,
        HEADERS.CONTENT_DISPOSITION,
        HEADERS.CONTENT_RANGE,
        HEADERS.CONTENT_TYPE,
    ]
    passThrough.forEach((header) => {
        const value = response.headers[header.toLowerCase()]
        if (value) {
            res.setHeader(header, value)
        }
    })
}

/**
 * Hands a streamed upstream response to the caller.
 *
 * The AI service answers its file-serving routes with a 302 to a short-lived storage URL
 * when object storage is configured, and with the bytes themselves when it is running on
 * local storage. Both are handled here, and so is anything else an endpoint might answer,
 * which is what lets the wildcard passthrough share this code:
 *
 *  - **3xx** is passed straight through. Following it inside the proxy would buffer an
 *    entire MP4 into memory to no purpose, and the signed URL is minted for the browser.
 *  - **4xx and 5xx** are drained to a string so the upstream error reaches both the logs
 *    and the caller intact. Relaying a stream through `res.json` would send an empty body.
 *  - **Everything else** is piped rather than buffered, carrying the headers a browser
 *    needs to save the file under the right name.
 *
 * @param res - the response to write
 * @param response - the streamed upstream response
 * @param context - route name, for the log lines
 */
const relayStreamedResponse = async (
    res: Response,
    response: AxiosResponse,
    context: string
): Promise<Response | void> => {
    if (response.status >= 300 && response.status < 400) {
        // The redirect body has to be consumed before the socket is free, and it must be
        // *drained*, not destroyed. A 3xx body is empty or tiny, so draining costs nothing,
        // whereas destroying it aborts a connection that axios' keep-alive agent has already
        // taken back into its pool — the next upstream call then picks up that dead socket and
        // fails with ECONNRESET, so a download would break the request that followed it.
        if (response.data && typeof response.data.resume === 'function') {
            response.data.resume()
        }
        const location = response.headers.location
        if (!location) {
            logError(`AI Studio ${context}: upstream ${response.status} carried no location header`)
            return res.status(502).json({
                message: ERROR_MESSAGES.NO_REDIRECT_TARGET,
                status: 'error',
            })
        }
        return res.redirect(response.status, location)
    }

    if (response.status >= 400) {
        const body = await drainStream(response.data)
        logError(`AI Studio ${context} upstream error: status ${response.status} body ${body}`)
        return res
            .status(response.status)
            .type(response.headers[HEADERS.CONTENT_TYPE.toLowerCase()] || HEADERS.CONTENT_TYPE_JSON)
            .send(body)
    }

    copyDownloadHeaders(response, res)
    res.status(response.status)
    // A body that dies after the status line is on the wire cannot be answered with an error
    // code, and since the response goes out chunked the client would otherwise read a truncated
    // body as a complete one. Destroying the connection is what tells it the body is short.
    // Both events are listened for: a socket that dies raises 'aborted', a body that fails to
    // decompress raises 'error', and an 'error' with no listener is thrown rather than handled.
    const failResponse = (reason: string) => (streamError?: Error) => {
        logError(`AI Studio ${context}: response stream ${reason} mid-body: ${streamError || ''}`)
        res.destroy(streamError)
    }
    response.data.on('error', failResponse('failed'))
    response.data.on('aborted', failResponse('was aborted'))
    response.data.pipe(res)
}

/**
 * Fetches a file-serving endpoint and hands the result to the browser.
 *
 * `maxRedirects` is 0 and `validateStatus` accepts everything so that axios neither follows
 * the redirect itself nor rejects an error whose body we want to relay — see
 * {@link relayStreamedResponse} for what is then done with each case.
 *
 * The caller's query string is forwarded whole rather than named parameter by parameter, so a
 * parameter the AI service adds later reaches it without a change here.
 *
 * @param req - the incoming request
 * @param res - the response to write
 * @param url - the upstream URL to fetch, without a query string
 * @param context - route name, for the log lines
 */
export const forwardDownload = async (
    req: Request,
    res: Response,
    url: string,
    context: string
): Promise<Response | void> => {
    try {
        const response = await axios.get(url, {
            headers: buildUpstreamHeaders(req),
            maxRedirects: 0,
            params: req.query,
            responseType: 'stream',
            timeout: TIMEOUTS.DOWNLOAD,
            validateStatus: () => true,
        })
        return relayStreamedResponse(res, response, context)
    } catch (error) {
        return handleUpstreamError(res, error, context)
    }
}

/** Verbs that never carry a body, so nothing is built for them. */
const BODYLESS_METHODS = ['GET', 'HEAD', 'OPTIONS']

/**
 * Rebuilds the caller's body in the shape the upstream call needs.
 *
 * A multipart request cannot simply be handed on: express-fileupload has already consumed
 * the stream and buffered each part, so the body is reassembled from `req.files` and
 * `req.body`, under the same field names it arrived with.
 *
 * @param req - the incoming request
 * @returns the body to send and the headers that describe it
 */
// tslint:disable-next-line: no-any
const buildForwardedBody = (req: Request): { data: any, headers: Record<string, string> } => {
    if (BODYLESS_METHODS.indexOf(req.method.toUpperCase()) !== -1) {
        return { data: undefined, headers: buildUpstreamHeaders(req) }
    }

    const fields = req.body || {}
    const fileFields = req.files ? Object.keys(req.files) : []
    if (fileFields.length) {
        const formData = new FormData()
        fileFields.forEach((field) =>
            filesFromField(req, field).forEach((file) => appendFile(formData, field, file)))
        Object.keys(fields).forEach((field) => appendField(formData, field, fields[field]))
        return { data: formData, headers: multipartHeaders(req, formData) }
    }

    // express.json() leaves an empty object behind when no body was sent; forwarding that as
    // `{}` would turn a bodyless request into one carrying an empty JSON document.
    if (!Object.keys(fields).length) {
        return { data: undefined, headers: buildUpstreamHeaders(req) }
    }
    return { data: fields, headers: jsonHeaders(req) }
}

/**
 * Forwards a request none of the named routes matched straight through to the AI service.
 *
 * This is what keeps the proxy from needing an edit every time the AI service grows an
 * endpoint: a new `POST /v1/studio/something` is reachable as
 * `/protected/v8/aiStudio/studio/something` the day it ships, with the same authentication,
 * identity and error handling as the routes written out by hand. The named routes are still
 * worth having — they document the request and response shapes an endpoint expects — and
 * because Express matches in declaration order they always win over this.
 *
 * The method, path, query string and body are relayed as they arrived, and the response is
 * streamed back, so a new endpoint that answers with a file or a redirect works too.
 *
 * @param req - the incoming request
 * @param res - the response to write
 * @param upstreamBase - the upstream prefix this router maps onto, e.g. `…/v1/studio`
 * @param context - router name, for the log lines
 */
export const forwardAny = async (
    req: Request,
    res: Response,
    upstreamBase: string,
    context: string
): Promise<Response | void> => {
    try {
        // Inside a mounted router `req.url` is the path below the mount point, query string
        // and all, so it is exactly the tail to hang off this router's upstream base.
        const target = upstreamBase + req.url
        const { data, headers } = buildForwardedBody(req)

        // Read back by requestLogger, so one access line can say a request went through the
        // wildcard rather than a named route.
        // tslint:disable-next-line: no-any
        const locals = (res as any).locals
        if (locals) {
            locals.aiStudioPassthrough = true
        }

        const response = await axios.request({
            data,
            headers,
            maxRedirects: 0,
            method: req.method as Method,
            responseType: 'stream',
            timeout: TIMEOUTS.PASSTHROUGH,
            url: target,
            validateStatus: () => true,
        })
        return relayStreamedResponse(res, response, context)
    } catch (error) {
        return handleUpstreamError(res, error, context)
    }
}
