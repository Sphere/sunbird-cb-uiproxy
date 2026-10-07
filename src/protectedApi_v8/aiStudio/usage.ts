import axios from 'axios'
import { Request, Response, Router } from 'express'
import { API_END_POINTS, TIMEOUTS, UPSTREAM_BASES } from './constants'
import { forwardAny, handleUpstreamError, jsonHeaders, relay } from './helpers'

/**
 * Usage and spend — what the dashboard is built from.
 *
 * Mounted at `/protected/v8/aiStudio/usage`.
 *
 * Both shapes of the same report are exposed. The POST is the one to build a dashboard on;
 * the GET exists because a read you can express as a URL is worth having — it can be pasted
 * to a colleague, opened in a browser, curled without a body, and cached by the gateway.
 */
export const usageApi = Router()

/**
 * Supported filters, on either verb. Every one is optional and an empty string counts as
 * absent, so an empty body returns everything.
 *
 *   creator — one creator (`user` is accepted as its former name)
 *   type    — `video` | `assessment` (`quiz` also accepted)
 *   status  — `created` | `planned` | `rendering` | `done` | `failed`
 *   from    — ISO date, inclusive
 *   to      — ISO date, inclusive
 *   limit   — default 100, max 1000; `0` returns totals with no rows
 *   offset  — for paging
 *
 * In the response, `page.total` counts everything matching the filter rather than just the
 * page returned, and `costEstimated: true` on an item means the figure was back-estimated
 * rather than recorded.
 *
 * A malformed filter comes back as a 400 `INVALID_QUERY` naming the field, and is relayed
 * intact: a spend report that quietly answers a different question than the one asked is
 * worse than one that fails.
 */

/**
 * POST /get-report
 * The full report, filters in the body. Use this for anything richer than a spot check.
 */
usageApi.post('/get-report', async (req: Request, res: Response) => {
    const context = 'usage/get-report'
    try {
        const response = await axios.post(API_END_POINTS.usageReport, req.body || {}, {
            headers: jsonHeaders(req),
            timeout: TIMEOUTS.READ,
        })
        return relay(res, response)
    } catch (error) {
        return handleUpstreamError(res, error, context)
    }
})

/**
 * GET /get-report
 * The same report with the filters as a query string, forwarded as received.
 */
usageApi.get('/get-report', async (req: Request, res: Response) => {
    const context = 'usage/get-report'
    try {
        const response = await axios.get(API_END_POINTS.usageReport, {
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
 * Any other path under this router, forwarded to `.../v1/usage` unchanged.
 *
 * Declared last, so every route above wins. It exists so an endpoint the AI service adds to
 * this feature area later is reachable through the portal the day it ships, rather than
 * waiting on a change here. See `forwardAny` for what is and is not relayed.
 */
usageApi.all('/*', async (req: Request, res: Response) => {
    return forwardAny(req, res, UPSTREAM_BASES.usage, 'usage/passthrough')
})
