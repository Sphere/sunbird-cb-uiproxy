import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { CONSTANTS } from '../../utils/env'
import { ERROR } from '../../utils/message'
import { extractUserIdFromRequest, extractUserToken } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'

const GENERAL_ERR_MSG = 'Failed due to unknown reason'

export const evaluateApi = Router()

evaluateApi.post('/assessment/submit/v2', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const userId = extractUserIdFromRequest(req)
    const url = `${API_END_POINTS.assessmentSubmitV2}/assessment/submit`
    const requestBody = {
      ...req.body,
    }
    const response = await axios({
      ...axiosRequestConfig,
      data: requestBody,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        rootOrg,
        userId,
        'x-authenticated-user-token': extractUserToken(req),
      },
      method: 'POST',
      url,
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERR_MSG,
      }
    )
  }
})

evaluateApi.post('/assessment/submit/iap', async (req, res) => {
  const url = `${API_END_POINTS.iapSubmitAssessment}`
  const requestBody = {
    ...req.body,
  }

  axios({
    ...axiosRequestConfig,
    data: requestBody,
    headers: {
      rootOrg: requestBody.root_org,
    },
    method: 'POST',
    url,
  })
    .then((response) => {
      res.status(response.status).send(response.data)
    })
    .catch((error) => {
      res.status((error && error.response && error.response.status) || 500)
        .send((error && error.response && error.response.data) || {
          error: GENERAL_ERR_MSG,
        })
    })
})

evaluateApi.get('/post-assessment/:contentId', async (req, res) => {
  const uuid = req.header('wid')
  const contentId = req.params.contentId
  const rootOrg = req.header('rootOrg')
  if (!rootOrg) {
    res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
    return
  }
  const body = {
    contentIds: [contentId],
    userIds: [uuid],
  }
  try {
    const response = await axios.post(API_END_POINTS.postAssessment, body, {
      ...axiosRequestConfig,
      headers: {
        client_id: CONSTANTS.POST_ASSESSMENT_CLIENT_ID,
        client_secret: CONSTANTS.POST_ASSESSMENT_CLIENT_SECRET,
        rootOrg,
      },
    })
    res.send(response.data)
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERR_MSG,
      })
  }
})
