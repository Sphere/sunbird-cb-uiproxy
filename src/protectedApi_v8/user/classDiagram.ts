import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { logError } from '../../utils/logger'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'

export const classDiagramApi = Router()

classDiagramApi.post('/classdiagram/submit/:contentId', async (req, res) => {
  try {
    const uuid = extractUserIdFromRequest(req)
    const contentId = req.params.contentId
    const config = axiosRequestConfig
    config.headers = {
      rootOrg: req.header('rootOrg'),
    }

    const response = await axios.post(
      `${API_END_POINTS.submission}/${uuid}/exercises/${contentId}/classdiagram-submission`,
      {
        ...req.body,
      },
      config
    )
    res.json(response.data)
  } catch (err) {
    logError(err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Failed due to unknown reason',
      }
    )
  }
})
