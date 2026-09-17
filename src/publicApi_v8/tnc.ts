import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { logError } from '../utils/logger'
import { ERROR } from '../utils/message'
import { API_END_POINTS } from './apiConstants'

export const publicTnc = Router()

publicTnc.get('/', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg') || ''
    const org = req.header('org') || ''
    let locale = 'en'
    if (!org || !rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    if (req.query.locale) {
      locale = req.query.locale
    }
    const response = await axios({
      ...axiosRequestConfig,
      headers: {
        langCode: locale,
        org,
        rootOrg,
      },
      method: 'GET',
      url: API_END_POINTS.tnc,
    })
    res.json(response.data)
  } catch (err) {
    logError('TNC ERR >', err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Failed due to unknown reason',
      }
    )
  }
})
