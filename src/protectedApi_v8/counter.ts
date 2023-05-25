import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'

const API_END_POINTS = {
  platformPostfixUrl: '/stats/data/now',
}

export const counterApi = Router()
// Api call happens in Lex  experience wow page in features for lex wowstats
counterApi.get('/', async (_req, res) => {
  try {
    let urlPrefix = CONSTANTS.COUNTER
    if (CONSTANTS.USE_SERVING_HOST_COUNTER) {
      urlPrefix = CONSTANTS.USE_SERVING_HOST_COUNTER
    }

    const response = await axios.get(
      `${urlPrefix}${API_END_POINTS.platformPostfixUrl}`,
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
})
