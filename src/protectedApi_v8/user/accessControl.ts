import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { logError } from '../../utils/logger'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'

/**
 *
 * @param contentIds : comma separated ids
 * @param userId : string
 */
export async function checkContentAccess(
  contentIds: string,
  userId: string
): Promise<{ [id: string]: { hasAccess: boolean } }> {
  try {
    const response = await axios.get(
      `${API_END_POINTS.contents}/${userId}/content?contentIds=${contentIds}`,
      axiosRequestConfig
    )
    return response.data.result.response || {}
  } catch (e) {
    logError('ERROR ON ACCESS CHECK >', e)
    return {}
  }
}

export const accessControlApi = Router()

accessControlApi.post('/', async (req, res) => {
  try {
    const contentIds = req.body.contentIds
    const uuid = extractUserIdFromRequest(req)
    const response = await checkContentAccess(contentIds.join(','), uuid)
    res.json(response)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Failed due to unknown reason',
      }
    )
  }
})

accessControlApi.get('/', async (req, res) => {
  const userId = req.header('wid')
  const rootOrg = req.header('rootOrg')

  try {
    const response = await axios.get(
      `${API_END_POINTS.contents}/${userId}/?rootOrg=${rootOrg}`,
      axiosRequestConfig
    )
    if (response.data.result) {
      res.status(200).send(response.data.result)
    } else {
      res.status(404).send({
        error: 'No Data found',
      })
    }
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Failed due to unknown reason',
      }
    )
  }
})
