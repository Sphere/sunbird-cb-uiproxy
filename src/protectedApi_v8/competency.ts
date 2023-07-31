import axios from 'axios'
import { Router } from 'express'

import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractAuthorizationFromRequest } from '../utils/requestExtract'

const API_END_POINTS = {
  addCompetency: `${CONSTANTS.FRAC_API_BASE}/api/frac/addDataNode`,
  getCompetency: `${CONSTANTS.FRAC_API_BASE}/api/frac/getAllNodes?type=COMPETENCY&status=VERIFIED`,
  searchCompetency: `${CONSTANTS.FRAC_API_BASE}/api/frac/searchNodes`,
}

const API_END_POINTS_REPORTS = {
  assessmentReports: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/competency/reports/assessment`,
  passbookReports: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/competency/reports/passbook`,
}
export const competencyApi = Router()
const unknownError = 'Failed due to unknown reason'

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
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
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
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
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
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})
competencyApi.get('/reports/assessment', async (req, res) => {
  try {
    const startDate = req.query.start_date
    const endDate = req.query.end_date
    logInfo(
      'Start date and end date for assessment reports',
      startDate,
      endDate
    )
    if (!startDate || !endDate) {
      res.status(400).json({
        message: 'Start date or end date cant be empty',
        status: 'Failed',
      })
      return
    }
    const response = await axios({
      method: 'GET',
      params: {
        end_date: endDate,
        start_date: startDate,
      },
      url: API_END_POINTS_REPORTS.assessmentReports,
    })
    res.status(response.status).send(response.data)
  } catch (error) {
    res.status(400).json({
      message: 'Something went wrong in recommendation service',
      status: 'Failed',
    })
  }
})
competencyApi.get('/reports/passbook', async (req, res) => {
  try {
    const startDate = req.query.start_date
    const endDate = req.query.end_date
    logInfo('Start date and end date for passbook reports', startDate, endDate)
    if (!startDate || !endDate) {
      res.status(400).json({
        message: 'Start date or end date cant be empty',
        status: 'Failed',
      })
      return
    }
    const response = await axios({
      method: 'GET',
      params: {
        end_date: endDate,
        start_date: startDate,
      },
      url: API_END_POINTS_REPORTS.passbookReports,
    })
    res.status(response.status).send(response.data)
  } catch (error) {
    res.status(400).json({
      message: 'Something went wrong in recommendation service',
      status: 'Failed',
    })
  }
})
