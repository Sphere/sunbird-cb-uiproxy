import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'

export const iconBadgeApi = Router()

iconBadgeApi.get('/unseenNotificationCount', async (req, res) => {
  try {
    const uuid = extractUserIdFromRequest(req)
    const rootOrg = req.header('rootOrg')
    const response = await axios.get(
      `${API_END_POINTS.unreadNotificationCount}/${uuid}/notification-summary`,
      {
        ...axiosRequestConfig,
        headers: { rootOrg },
      }
    )
    res.json(response.data.totalCount)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Failed due to unknown reason',
      }
    )
  }
})
