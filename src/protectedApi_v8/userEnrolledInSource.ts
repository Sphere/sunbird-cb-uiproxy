import axios from 'axios'
import { Router } from 'express'
import { logInfo } from '../utils/logger'
import { API_END_POINTS } from './apiConstants'

const unknownError = 'Failed due to unknown reason'

export const userEnrolledInSource = Router()
userEnrolledInSource.get('/', async (req, res) => {
  try {
    /* tslint:disable-next-line */
    let sourceName = req.query.sourceName;
    if (!sourceName) {
      res.status(400).json({
        message: "Source name can't be empty",
        status: 'FAILED',
      })
    }
    const response = await axios({
      method: 'GET',
      params: { courseSourceName: sourceName },
      url: API_END_POINTS.userCountInSource,
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    logInfo(JSON.stringify(err))
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})
