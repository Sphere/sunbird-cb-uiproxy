import axios from 'axios'
import { Router } from 'express'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'

const API_END_POINTS_REPORTS = {
  assessmentReports: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/competency/reports/assessment`,
  passbookReports: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/competency/reports/passbook`,
}
const accessKey = CONSTANTS.EKSHAMATA_SECURITY_KEY_MASTER

export const competencyReporting = Router()
competencyReporting.get('/reports/assessment', async (req, res) => {
  try {
    const startDate = req.query.start_date
    const endDate = req.query.end_date
    if (req.headers.accesskey != accessKey) {
      res.status(400).json({
        message: 'Access key invalid or not present',
        status: 'Failed',
      })
      return
    }
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
competencyReporting.get('/reports/passbook', async (req, res) => {
  try {
    const startDate = req.query.start_date
    const endDate = req.query.end_date
    if (req.headers.accesskey != accessKey) {
      res.status(400).json({
        message: 'Access key invalid or not present',
        status: 'Failed',
      })
      return
    }
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
