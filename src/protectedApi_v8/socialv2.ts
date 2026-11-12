import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractUserIdFromRequest } from '../utils/requestExtract'
import { API_END_POINTS } from './apiConstants'

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

export const socialApi = Router()

const INVALID_ORG_MSG = ERROR.ERROR_NO_ORG_DATA

socialApi.post('/post/publish', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    const data = {
      ...req.body,
      org,
      rootOrg,
    }
    const response = await axios.post(API_END_POINTS.socialPublishPost, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

socialApi.post('/post/draft', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    const data = {
      ...req.body,
      org,
      rootOrg,
    }
    const response = await axios.post(API_END_POINTS.socialDraftPost, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

socialApi.put('/edit/tags', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    const data = {
      ...req.body,
      org,
      rootOrg,
    }
    const response = await axios.put(API_END_POINTS.socialEditTags, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})
socialApi.put('/edit/meta', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    const data = {
      ...req.body,
      org,
      rootOrg,
    }
    const response = await axios.put(API_END_POINTS.socialEditMeta, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    logError('EDIT META ERROR >', err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

socialApi.post('/post/delete', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    const data = {
      ...req.body,
      org,
      rootOrg,
    }
    const response = await axios({
      ...axiosRequestConfig,
      data,
      method: 'DELETE',
      url: API_END_POINTS.socialDeletePost,
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    logError('ERROR DELETING POST', err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

socialApi.post('/post/autocomplete', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    const data = {
      ...req.body,
      org,
      rootOrg,
    }
    const response = await axios.post(API_END_POINTS.socialPostAutocomplete, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

socialApi.post('/post/viewConversation', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    const data = {
      ...req.body,
      org,
      rootOrg,
    }
    const response = await axios.post(API_END_POINTS.socialViewConversation, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

socialApi.post('/post/viewConversationV2', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    const data = {
      ...req.body,
      org,
      rootOrg,
    }
    const response = await axios.post(API_END_POINTS.socialViewConversationV2, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

socialApi.post('/post/timeline', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    const data = {
      ...req.body,
      org,
      rootOrg,
    }
    const response = await axios.post(API_END_POINTS.socialTimeline, data, {
      ...axiosRequestConfig,
      timeout: Number(CONSTANTS.SOCIAL_TIMEOUT),
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

socialApi.post('/post/timelineV2', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    const userId = extractUserIdFromRequest(req)
    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    const data = {
      ...req.body,
      org,
      rootOrg,
      userId,
    }
    const response = await axios.post(API_END_POINTS.socialTimelineV2, data, {
      ...axiosRequestConfig,
      timeout: Number(CONSTANTS.SOCIAL_TIMEOUT),
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

socialApi.post('/post/activity/create', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    const data = {
      ...req.body,
      org,
      rootOrg,
    }
    const response = await axios.post(API_END_POINTS.socialActivityUpdate, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

socialApi.post('/post/acceptAnswer', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    const data = {
      ...req.body,
      org,
      rootOrg,
    }
    const response = await axios.post(API_END_POINTS.socialAcceptAnswer, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

socialApi.post('/post/activity/users', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    const data = {
      ...req.body,
      org,
      rootOrg,
    }
    const response = await axios.post(API_END_POINTS.socialActivityUsers, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

socialApi.post('/post/search', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    const data = {
      ...req.body,
      org,
      rootOrg,
    }
    const response = await axios.post(API_END_POINTS.socialSearch, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

socialApi.post('/catalog', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    const userId = extractUserIdFromRequest(req)

    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    const data = {
      ...req.body,
      org,
      rootOrg,
      userid: userId,
    }
    const response = await axios.post(API_END_POINTS.socialAuthoringCatalog, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})
