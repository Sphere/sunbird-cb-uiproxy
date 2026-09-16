import axios from 'axios'
import { Response, Router } from 'express'

import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { ERROR } from '../utils/message'
import { extractAuthorizationFromRequest } from '../utils/requestExtract'

const API_END_POINTS = {
  addCompetency: `${CONSTANTS.FRAC_API_BASE}/api/frac/addDataNode`,
  getCompetency: `${CONSTANTS.FRAC_API_BASE}/api/frac/getAllNodes?type=COMPETENCY&status=VERIFIED`,
  searchCompetency: `${CONSTANTS.FRAC_API_BASE}/api/frac/searchNodes`,
}

export const competencyApi = Router()
const unknownError = 'Failed due to unknown reason'

// sonar-cleanup: extracted from competency.ts's repeated per-route catch blocks — same status/body shape (Sonar duplication follow-up)
/**
 * Responds with the upstream status code (or 500) and the upstream error
 * body (or a generic error message).
 *
 * @param res - the Express response to send the error on
 * @param err - the caught error, expected to optionally carry an axios-style `response`
 */
// tslint:disable-next-line: no-any
function handleCompetencyError(res: Response, err: any) {
  res.status((err && err.response && err.response.status) || 500).send(
    (err && err.response && err.response.data) || {
      error: unknownError,
    }
  )
}

competencyApi.get('/getCompetency', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg')
    const authToken = extractAuthorizationFromRequest(req)
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios.get(API_END_POINTS.getCompetency, {
      ...axiosRequestConfig,
      headers: {
        Authorization: authToken,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleCompetencyError(res, err)
  }
})

competencyApi.post('/addCompetency', async (req, res) => {
  try {
    const authToken = extractAuthorizationFromRequest(req)
    const response = await axios.post(API_END_POINTS.addCompetency, req.body, {
      ...axiosRequestConfig,
      headers: {
        Authorization: authToken,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleCompetencyError(res, err)
  }
})

competencyApi.post('/searchCompetency', async (req, res) => {
  try {
    const authToken = extractAuthorizationFromRequest(req)
    const response = await axios.post(
      API_END_POINTS.searchCompetency,
      req.body,
      {
        ...axiosRequestConfig,
        headers: {
          Authorization: authToken,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    handleCompetencyError(res, err)
  }
})
