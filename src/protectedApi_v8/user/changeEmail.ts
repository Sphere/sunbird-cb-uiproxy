import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { logError } from '../../utils/logger'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'

export const changeEmailApi = Router()
changeEmailApi.put('/:metaType', async (req, res) => {
  const userId = extractUserIdFromRequest(req)
  const metaType = req.params.metaType
  const url = API_END_POINTS.changeEmail(userId, metaType)
  const data = {
    metaTypeData: req.body.metaTypeData,
    rootOrg: req.body.rootOrg,
  }
  try {
    const response = await axios.put(url, data, {
      ...axiosRequestConfig,
      headers: { 'content-Type': 'application/json' },
    })
    res.json(response.data)
  } catch (err) {
    logError('ERROR UPDATE EMAIL ID >', err)
    res.status((err && err.response && err.response.status) || 500).send(err.response.data)
  }
})
