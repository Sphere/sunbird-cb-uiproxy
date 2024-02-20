import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import {
  extractUserIdFromRequest,
  extractUserToken,
} from '../utils/requestExtract'

const API_END_POINTS = {
  // tslint:disable-next-line: no-any
  autoenrollment: (userId: any, courseId: any) =>
    `${CONSTANTS.COHORTS_API_BASE}/v1/autoenrollment/${userId}/${courseId}`,
}
const unknownError = 'Failed due to unknown reason'

export const autoEnrollmentApiv2 = Router()
autoEnrollmentApiv2.post('/user', async (req, res) => {
  try {
    const courseId = req.body.courseId
    /* tslint:disable-next-line */
    const wid = extractUserIdFromRequest(req);
    const rootOrgValue = req.body.rootOrg
    const auth = extractUserToken(req)
    /* tslint:disable-next-line */
    const response = await axios.get(
      API_END_POINTS.autoenrollment(wid, courseId),
      {
        ...axiosRequestConfig,
        headers: {
          Authorization: auth,
          rootOrg: rootOrgValue,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})
