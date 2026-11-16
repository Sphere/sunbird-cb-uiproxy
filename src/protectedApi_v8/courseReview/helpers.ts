import { AxiosResponse } from 'axios'
import { NextFunction, Request, Response } from 'express'
import { CONSTANTS } from '../../utils/env'
import { logError, logInfo } from '../../utils/logger'
import { extractUserToken } from '../../utils/requestExtract'
import { resolveCreatorId, resolveCreatorName } from '../aiStudio/helpers'
import { CALLER_SECRET_ENV, ERROR_MESSAGES, HEADERS } from './constants'

/**
 * The headers every upstream call carries.
 *
 *  - **`Authorization`**: the portal's gateway key, which Kong's jwt plugin checks.
 *  - **`x-authenticated-user-token`**: the user's Keycloak token, sent as every other Kong
 *    caller in this repo sends it.
 *  - **`x-aastrika-user-id`**: the signed-in user, from the session (or the token's subject).
 *    The service checks this id against the course's creator, reviewers and publishers, so it
 *    is the one value that decides who may see or start a review.
 *  - **`x-aastrika-user-name`**: shown in the review history. Left out when it is not ASCII,
 *    since a non-ASCII header value makes the upstream call throw.
 *  - **`x-course-review-secret`**: proves the call comes from this proxy, so nothing else in
 *    the cluster can call the service with made-up identity headers (set when configured).
 *
 * The map is built from scratch, so nothing the browser sent, an `x-aastrika-user-id` naming
 * someone else included, can reach the service.
 *
 * No roles header is sent. Only the course's creator and the reviewers and publishers added to
 * it may review it, which the service checks against the course itself, so no role is needed.
 * (`session.userRoles` could not prove one anyway: permissionHelper gives every signed-in user
 * the same fixed list.)
 *
 * @param req - the incoming request, whose session Keycloak populated
 * @param json - true when the call carries a JSON body
 * @returns the header map to hand to axios
 */
export const buildUpstreamHeaders = (req: Request, json = false): Record<string, string> => {
    const headers: Record<string, string> = { Authorization: CONSTANTS.SB_API_KEY }
    const secret = CALLER_SECRET_ENV()
    if (secret) {
        headers[HEADERS.CALLER_SECRET] = secret
    }
    if (json) {
        headers[HEADERS.CONTENT_TYPE] = HEADERS.CONTENT_TYPE_JSON
    }
    // Set only when a value exists: an undefined header value throws inside Node, which would
    // surface as an opaque 500 instead of the service's own 401.
    const userToken = extractUserToken(req)
    if (userToken) {
        headers[HEADERS.USER_TOKEN] = userToken
    }
    const userId = resolveCreatorId(req)
    if (userId) {
        headers[HEADERS.USER_ID] = userId
    }
    const userName = resolveCreatorName(req)
    if (userName) {
        headers[HEADERS.USER_NAME] = userName
    }
    return headers
}

/** The service's own credentials and nothing about a user: for the token-authorised package files. */
export const callerHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { Authorization: CONSTANTS.SB_API_KEY }
    const secret = CALLER_SECRET_ENV()
    if (secret) {
        headers[HEADERS.CALLER_SECRET] = secret
    }
    return headers
}

/** One access line per request, written when the response finishes or the client goes away. */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
    const started = Date.now()
    let written = false
    const write = (outcome: string) => {
        if (written) {
            return
        }
        written = true
        logInfo(
            `Course review ${req.method} ${req.originalUrl} -> ${res.statusCode} ` +
            `${Date.now() - started}ms user="${resolveCreatorId(req) || 'unknown'}"${outcome}`
        )
    }
    res.on('finish', () => write(''))
    res.on('close', () => write(' (client gone before the body completed)'))
    next()
}

/** axios codes for a call that ran out of time (ours, or the socket's). */
const TIMEOUT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ESOCKETTIMEDOUT'])
/** axios / Node codes for a service that could not be reached at all. */
const UNREACHABLE_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'EPIPE'])

/**
 * Relays an upstream failure. The portal branches on the service's codes (429 for a user's
 * limit, 403 for a course they cannot review, 400 for a course with nothing to review), so a
 * service answer passes through unchanged. With no answer, the portal still gets the reason, in
 * the service's own shape: 504 when the call ran out of time (the portal says "took too long"
 * and can try again), 502 when the service could not be reached, 500 for anything else.
 */
// tslint:disable-next-line: no-any
export const handleUpstreamError = (res: Response, error: any, context: string): Response => {
    if (error && error.response) {
        logError(`Course review ${context} upstream error: status ${error.response.status}`)
        return res.status(error.response.status).json(error.response.data)
    }
    const code = String((error && error.code) || '')
    logError(`Course review ${context} failed: ${code || error}`)
    if (TIMEOUT_CODES.has(code)) {
        return res.status(504).json({ error: { code: 'UPSTREAM_TIMEOUT', message: ERROR_MESSAGES.UPSTREAM_TIMEOUT } })
    }
    if (UNREACHABLE_CODES.has(code)) {
        return res.status(502).json({ error: { code: 'UPSTREAM_UNAVAILABLE', message: ERROR_MESSAGES.UPSTREAM_UNAVAILABLE } })
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR } })
}

/** Relays a successful JSON response, keeping its status: 202 (queued) and 200 (joined) differ. */
export const relay = (res: Response, response: AxiosResponse): Response =>
    res.status(response.status).json(response.data)
