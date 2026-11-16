import { NextFunction, Request, Response, Router } from 'express'
import { CONSTANTS } from '../../utils/env'
import { logInfo } from '../../utils/logger'
import { forwardAny, ForwardIdentity, resolveCreatorId } from '../aiStudio/helpers'

/**
 * FRAC Studio — the AI-assisted FRAC Creator and Reviewer (frac-studio-service).
 *
 * Mounted at `/protected/v8/fracStudio`; every path below the mount is relayed to the
 * service's `/v1` API one-to-one, so `/fracStudio/frac-reviews/abc/export.xlsx` here is
 * `/v1/frac-reviews/abc/export.xlsx` upstream.
 *
 *   POST  /fracs                      GET /fracs           GET|PATCH /fracs/:id
 *   POST  /fracs/:id/steps/:step      GET /fracs/:id/export.xlsx
 *   GET   /fracs/:id/versions         POST /fracs/:id/versions/:versionId/restore
 *   POST  /frac-reviews (multipart)   GET /frac-reviews    GET /frac-reviews/:id
 *   GET   /frac-reviews/:id/export.xlsx                    POST /frac-reviews/:id/open-in-creator
 *   GET   /jobs/:id
 *
 * It rides on the AI Studio forwarding helpers, so it gets the same guarantees: the owner
 * travels as `x-user-id` (FRAC Studio's own header), taken from the session and never from the
 * caller (the service trusts that header and scopes every record by it); a multipart upload,
 * already consumed by express-fileupload, is rebuilt under its original field names; downloads
 * stream back with their headers; and the service's own errors are relayed untouched.
 *
 * Nothing here validates a body — that is the service's rule to state (see aiStudio.ts).
 */
export const fracStudioApi = Router()

/** The user id travels under FRAC Studio's own header; the service needs no display name. */
const FRAC_STUDIO_IDENTITY: ForwardIdentity = { idHeader: 'x-user-id', sendName: false }

/**
 * Read per request rather than at import, so the base follows `CONSTANTS` if it is changed
 * after this module loads (the tests point it at a mock).
 */
const upstreamBase = (): string => `${CONSTANTS.FRAC_STUDIO_API_BASE}/v1`

/** One access line per request: route, status, duration and whose request it was. */
const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
    const started = Date.now()
    res.on('finish', () => {
        const creatorId = resolveCreatorId(req) || 'unknown'
        logInfo(`FRAC Studio ${req.method} ${req.originalUrl} -> ${res.statusCode} ${Date.now() - started}ms creator="${creatorId}"`)
    })
    next()
}

fracStudioApi.use(requestLogger)

fracStudioApi.all('/*', async (req: Request, res: Response) => {
    return forwardAny(req, res, upstreamBase(), 'fracStudio', FRAC_STUDIO_IDENTITY)
})
