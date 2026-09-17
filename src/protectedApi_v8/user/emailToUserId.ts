import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { API_END_POINTS } from '../apiConstants'

export async function getUserId(userEmail: string) {
  const url = `${API_END_POINTS.emailToUserId}${userEmail}`
  const response = await axios.get(url, axiosRequestConfig)
  const result = response.data.result
  let data: { email: string; userId: string | null }
  if (result.error) {
    data = {
      email: userEmail,
      userId: null,
    }
  } else {
    data = result.result
  }

  return data
}

export const emailToUserIdApi = Router()

emailToUserIdApi.get('/:emailId', async (req, res) => {
  try {
    const userEmail = req.params.emailId
    const data = await getUserId(userEmail)
    res.send(data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Failed due to unknown reason',
      }
    )
  }
})
