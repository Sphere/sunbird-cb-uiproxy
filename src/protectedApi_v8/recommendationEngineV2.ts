import axios from 'axios'
import { Router } from 'express'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'

const API_END_POINTS = {
  // tslint:disable-next-line: no-any
  recommendationAPI: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/course/recommendation`,
  searchAPI: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/publicSearch/getcourse`,

}
const unknownError = 'Failed due to unknown reason'

export const recommendationEngineV2 = Router()
recommendationEngineV2.get('/', async (req, res) => {
  try {
    /* tslint:disable-next-line */
    let responseObject = {
      background: req.query.background || '',
      profession: req.query.profession || '',
    }
    if (!req.query.background) {
      delete responseObject.background
    }
    if (!req.query.profession) {
      delete responseObject.profession
    }
    const response = await axios({
      method: 'GET',
      params: responseObject,
      url: API_END_POINTS.recommendationAPI,
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
recommendationEngineV2.post('/publicSearch/getcourse', async (req, res) => {
  try {
    logInfo('Inside recommendation search course route')
    /* tslint:disable-next-line */
    let searchRequestBody = req.body
    const response = await axios({
      data: searchRequestBody,
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      url: API_END_POINTS.searchAPI,
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
