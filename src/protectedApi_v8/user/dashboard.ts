import axios from 'axios'
import { Request, Response, Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { CONSTANTS } from '../../utils/env'
import { getStringifiedQueryParams } from '../../utils/helpers'
import { ERROR } from '../../utils/message'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

export const dashboardApi = Router()

dashboardApi.post('/course/details', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const learningHistoryItems = await axios
      .post(`${API_END_POINTS.progress_history}/${userId}/dashboard/courses/details`, req.body, {
        headers: {
          Authorization: req.headers.authorization,
          rootOrg: req.header('rootOrg'),
        },
      })
      .then((response) => response.data)

    return res.send(learningHistoryItems)
  } catch (err) {
    return res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

dashboardApi.get('/analytics/progress/:contentType', async (req: Request, res) => {
  const { startDate, endDate, isCompleted } = req.query
  const contentType: string = req.params.contentType
  const queryParams = getStringifiedQueryParams({
    contentType,
    endDate,
    isCompleted,
    startDate,
  })

  const response = await axios.get(`${API_END_POINTS.analytics}/api/userprogress?${queryParams}`, {
    headers: {
      Authorization: req.headers.authorization,
      verify_url: `${CONSTANTS.HTTPS_HOST}:${CONSTANTS.PORTAL_PORT}/protected/v8/user/details`,
    },
  })

  res.send(response.data)
})

dashboardApi.get('/course', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const { contentType, status, pageState, pageSize } = req.query
    const response = await axios.get(
      // tslint:disable-next-line:max-line-length
      `${API_END_POINTS.progress_history}/${userId}/dashboard/courses?status=${status}&content_type=${contentType}&page_state=${pageState}&page_size=${pageSize}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          rootOrg: req.header('rootOrg'),
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})
dashboardApi.get('/userOrgTime', async (req: Request, res) => {
  try {
    const { startdate, enddate } = req.query

    const queryParams = getStringifiedQueryParams({
      enddate,
      startdate,
    })
    const userID = extractUserIdFromRequest(req)
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }

    const response = await axios.get(
      `${API_END_POINTS.timeSpent}/${userID}/dashboard/timespent?${queryParams}`,
      {
        ...axiosRequestConfig,
        headers: { rootOrg },
      }
    )

    return res.send(response.data)
  } catch (err) {
    return res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})
