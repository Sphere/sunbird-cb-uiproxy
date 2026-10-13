import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { logError, logInfo } from '../utils/logger'
import { API_END_POINTS } from './apiConstants'
const COMPETENCY_USER_FAIL = 'Sorry ! Data is not received in competency.'
export const publicCompetencyUser = Router()

publicCompetencyUser.get('/', async (req, res) => {
  try {
    const response = await axios({
      method: 'GET',
      url: API_END_POINTS.COMPETENCY_USER,
    })
    if (response.data.responseCode === 'OK') {
      logInfo('Check re body >> ' + req)
      logInfo('Log of competency user :')
      res.status(response.status).send(response.data.result)
    } else {
      throw new Error(
        _.get(response.data, 'params.errmsg') ||
          _.get(response.data, 'params.err')
      )
    }
  } catch (error) {
    logError('Error in competency user  >>>>>>' + error)
    res.status(500).send({
      message: COMPETENCY_USER_FAIL,
      status: 'failed',
    })
  }
})
