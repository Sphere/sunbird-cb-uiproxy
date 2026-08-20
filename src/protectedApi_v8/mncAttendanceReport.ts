import AWS from 'aws-sdk'
import { Request, Response, Router } from 'express'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'

/**
 * Serves the MNC CNE Attendance Sync report — a single self-contained HTML object held in a
 * PRIVATE S3 bucket and overwritten daily by the client at a fixed key.
 *
 * Why it is proxied rather than handed out as a presigned URL:
 *  - The report contains a named attendance roster, so access must be gated server side.
 *    A presigned URL is a bearer credential — shareable, and it leaks into browser history.
 *  - A stable URL is what makes ETag/304 revalidation work, so the multi-megabyte body only
 *    transfers on days the content actually changed instead of on every view.
 */

// Credentials are intentionally read straight from config with no fallback. When they are
// undefined the AWS SDK falls back to its default credential chain (instance / IRSA role),
// which is the preferred posture in the cluster.
const s3 = new AWS.S3({
    accessKeyId: CONSTANTS.MNC_REPORT_S3_ACCESS_KEY_ID,
    region: CONSTANTS.MNC_REPORT_S3_REGION,
    secretAccessKey: CONSTANTS.MNC_REPORT_S3_SECRET_ACCESS_KEY,
})

const MNC_REPORT_BUCKET = CONSTANTS.MNC_REPORT_S3_BUCKET_NAME
const MNC_REPORT_KEY = CONSTANTS.MNC_REPORT_S3_KEY
const REQUIRED_ROLE = 'MNC_REPORT_VIEWER'

export const mncAttendanceReportApi = Router()

/**
 * The whitelist ROLE_CHECK in apiWhiteList.ts only runs when PORTAL_API_WHITELIST_CHECK is
 * 'true', and it defaults to 'false'. So the role is re-checked here — access control must
 * not depend on a feature flag being switched on.
 *
 * Deliberately NOT reading session.userRoles: permissionHelper.ts and rolePermission.ts both
 * assign it a hardcoded 16-role array, identical for every user, so it cannot gate anything.
 * session.orgs is populated from the real user profile, and organisations[].roles holds the
 * user's actual per-organisation roles — the same source SCOPE_CHECK uses.
 */
// tslint:disable-next-line: no-any
const hasReportRole = (req: any): boolean => {
    const orgs = req && req.session && req.session.orgs
    if (!Array.isArray(orgs)) {
        return false
    }
    // tslint:disable-next-line: no-any
    return orgs.some((org: any) =>
        Array.isArray(org && org.roles) && org.roles.indexOf(REQUIRED_ROLE) !== -1)
}

const respondForbidden = (res: Response) => {
    res.status(403).json({
        id: 'api.error',
        ver: '1.0',
        // tslint:disable-next-line: object-literal-sort-keys
        ts: new Date().toISOString(),
        params: {
            status: 'failed',
            // tslint:disable-next-line: object-literal-sort-keys
            err: 'FORBIDDEN_ERROR',
            errmsg: 'Forbidden: you do not have access to this report',
        },
        responseCode: 'FORBIDDEN',
        result: {},
    })
}

/** S3 quotes its ETags, and a proxy may weaken them to W/"...". Compare on the bare value. */
// tslint:disable-next-line: no-any
const normaliseEtag = (value: any): string => {
    const raw = Array.isArray(value) ? value[0] : value
    return String(raw || '').trim().replace(/^W\//, '').replace(/"/g, '')
}

const isMisconfigured = (res: Response): boolean => {
    if (!MNC_REPORT_BUCKET || !MNC_REPORT_KEY) {
        logError('MNC report: MNC_REPORT_S3_BUCKET_NAME / MNC_REPORT_S3_KEY not configured')
        res.status(500).json({ error: 'Report storage is not configured' })
        return true
    }
    return false
}

// tslint:disable-next-line: no-any
const isNotFound = (err: any): boolean =>
    Boolean(err) && (err.statusCode === 404 || err.code === 'NotFound' || err.code === 'NoSuchKey')

/**
 * Cheap HeadObject-backed probe. The portal calls this before pointing an iframe at the
 * content route, because an iframe cannot surface an HTTP status — it would render the
 * error body as though it were the report.
 */
mncAttendanceReportApi.get('/mnc-attendance/meta', async (req: Request, res: Response) => {
    if (!hasReportRole(req)) {
        return respondForbidden(res)
    }
    if (isMisconfigured(res)) {
        return
    }
    try {
        const head = await s3.headObject({ Bucket: MNC_REPORT_BUCKET, Key: MNC_REPORT_KEY }).promise()
        return res.status(200).json({
            etag: normaliseEtag(head.ETag),
            lastModified: head.LastModified ? head.LastModified.toISOString() : null,
            sizeBytes: head.ContentLength || 0,
        })
    } catch (err) {
        if (isNotFound(err)) {
            logError('MNC report: object missing at ' + MNC_REPORT_KEY)
            return res.status(404).json({ error: 'Report has not been uploaded yet' })
        }
        logError('MNC report: headObject failed ' + JSON.stringify(err))
        return res.status(500).json({ error: 'Could not read report metadata' })
    }
})

mncAttendanceReportApi.get('/mnc-attendance', async (req: Request, res: Response) => {
    if (!hasReportRole(req)) {
        return respondForbidden(res)
    }
    if (isMisconfigured(res)) {
        return
    }
    try {
        const head = await s3.headObject({ Bucket: MNC_REPORT_BUCKET, Key: MNC_REPORT_KEY }).promise()
        const etag = normaliseEtag(head.ETag)

        // private: never cached by a shared proxy. no-cache: keep the bytes but always
        // revalidate — exactly right for a fixed URL whose content changes daily.
        res.setHeader('Cache-Control', 'private, no-cache')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        if (etag) {
            res.setHeader('ETag', '"' + etag + '"')
        }

        // The whole caching design: on an unchanged object this returns no body at all.
        const ifNoneMatch = normaliseEtag(req.headers['if-none-match'])
        if (etag && ifNoneMatch && ifNoneMatch === etag) {
            logInfo('MNC report: 304 for unchanged object')
            return res.status(304).end()
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Content-Disposition', 'inline')

        // The daily upload is outside our control, so handle either style: if the object was
        // stored already gzipped, pass it through and declare it (which also makes the global
        // compression middleware skip it); otherwise let that middleware compress on the fly.
        if (head.ContentEncoding === 'gzip') {
            res.setHeader('Content-Encoding', 'gzip')
        }

        const stream = s3.getObject({ Bucket: MNC_REPORT_BUCKET, Key: MNC_REPORT_KEY }).createReadStream()
        // tslint:disable-next-line: no-any
        stream.on('error', (streamErr: any) => {
            logError('MNC report: stream failed ' + JSON.stringify(streamErr))
            if (!res.headersSent) {
                res.status(500).json({ error: 'Could not read report' })
            } else {
                res.end()
            }
        })
        return stream.pipe(res)
    } catch (err) {
        if (isNotFound(err)) {
            logError('MNC report: object missing at ' + MNC_REPORT_KEY)
            return res.status(404).json({ error: 'Report has not been uploaded yet' })
        }
        logError('MNC report: getObject failed ' + JSON.stringify(err))
        return res.status(500).json({ error: 'Could not read report' })
    }
})
