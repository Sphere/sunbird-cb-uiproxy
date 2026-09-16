import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { sendSearchResponse } from '../utils/contentHelpers'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'

const API_END_POINTS = {
  searchv1: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/content/v1/search`,
}
const GENERAL_ERROR_MSG = 'Failed due to unknown reason'
export const publicContentApi = Router()
publicContentApi.post('/v1/search', async (req, res) => {
  try {
    const body = {
      ...req.body,
    }
    const response = await axios({
      ...axiosRequestConfig,
      data: body,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
      },
      method: 'POST',
      url: API_END_POINTS.searchv1,
    })
    sendSearchResponse(res, response)
  } catch (err) {
    logError('SEARCH V6 API ERROR >', err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})
