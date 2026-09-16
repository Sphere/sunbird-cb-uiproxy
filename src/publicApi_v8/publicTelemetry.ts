import axios from 'axios'
import { Request, Response, Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'

const API_END_POINTS = {
  telemetry: `${CONSTANTS.TELEMETRY_SB_BASE}/v1/telemetry`,
}

// sonar-cleanup: replaces two byte-identical POST / and POST /telemetry handlers (tslint-flagged no-identical-functions) with one shared handler mounted on both paths (CHANGE 25)
/**
 * Forwards the request body to the telemetry upstream and relays its
 * status/body — the exact behavior POST / and POST /telemetry both had
 * as separate, identical handlers before being merged into one.
 *
 * @param req - the incoming request; its body is forwarded as-is
 * @param res - the Express response to send the upstream result (or an error) on
 */
async function forwardTelemetry(req: Request, res: Response) {
  logInfo('Reuest Body for TELEMETRY -', JSON.stringify(req.body))
  try {
    const response = await axios.post(
      API_END_POINTS.telemetry,
      req.body,
      axiosRequestConfig
    )

    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Failed due to unknown reason',
      }
    )
  }
}

export const publicTelemetry = Router()

publicTelemetry.post('/', forwardTelemetry)
publicTelemetry.post('/telemetry', forwardTelemetry)
