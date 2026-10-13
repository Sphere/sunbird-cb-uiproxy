import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'

export const feedbackApi = Router()

feedbackApi.post('/', async (req, res) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.post(
      `${API_END_POINTS.feedback}${userId}`,
      req.body,
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
