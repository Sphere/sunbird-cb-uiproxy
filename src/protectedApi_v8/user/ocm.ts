import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'

export const ocmApi = Router()

ocmApi.get('/getToDos/:id', async (req, res) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const id = req.params.id
    const response = await axios.get(
      `${API_END_POINTS.user}${userId}/task_groups/${id}/tasks`,
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
