import { Response } from 'express'

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

// sonar-cleanup: extracted from training.ts's and certifications.ts's repeated
// per-route catch blocks — same upstream-status-forward + generic-fallback shape
// across all 20 routes in training.ts and all 19 in certifications.ts (CHANGE 37).
// training.ts's `/trainings/jit` POST route falls back to 500 (not 400) on a
// non-upstream error; every other route in both files falls back to 400 —
// preserved via the optional `fallbackStatus` parameter, defaulting to 400.
/**
 * Forwards the upstream error status/body when present, or responds with
 * `fallbackStatus` and a generic failure message.
 *
 * @param res - the Express response to send the error on
 * @param err - the caught error, expected to optionally carry an axios-style `response`
 * @param fallbackStatus - the status to use when `err` has no upstream response (default 400)
 */
// tslint:disable-next-line: no-any
export function forwardUpstreamError(res: Response, err: any, fallbackStatus = 400) {
  return res.status(err?.response?.status || fallbackStatus).send(
    err?.response?.data || {
      error: GENERAL_ERROR_MSG,
    }
  )
}
