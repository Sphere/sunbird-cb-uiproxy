import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { IContent } from '../models/content.model'
import { processContent } from '../utils/contentHelpers'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'
import { API_END_POINTS } from './apiConstants'
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
    const contents: IContent[] = response.data.result
    if (Array.isArray(contents)) {
      response.data.result = contents.map((content) => processContent(content))
    }
    res.json(
      response.data || {
        filters: [],
        filtersUsed: [],
        notVisibleFilters: [],
        result: [],
        totalHits: 0,
      }
    )
  } catch (err) {
    logError('SEARCH V6 API ERROR >', err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})
