import axios from 'axios'
import { Router } from 'express'
import { getRootOrg } from '../../authoring/utils/header'
import { axiosRequestConfig } from '../../configs/request.config'
import {
  getUserUID,
  getWriteApiAdminUID,
  getWriteApiToken,
} from '../../utils/discussionHub-helper'
import { logError, logInfo } from '../../utils/logger'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'

export const writeApi = Router()

// tslint:disable-next-line: no-any
export async function createDiscussionHubUser(user: any): Promise<any> {
  logInfo('Starting to create new user into NodeBB DiscussionHub...')
  // tslint:disable-next-line: no-try-promise
  try {
    const request1 = {
      ...user,
      _uid: getWriteApiAdminUID(),
    }
    const url = API_END_POINTS.createUser
    return async () => {
      return axios
        .post(url, request1, {
          ...axiosRequestConfig,
          headers: { authorization: getWriteApiToken() },
        })
        .catch((err) => {
          logError(
            'ERROR ON method createDiscussionHubUser api call to nodebb DiscussionHub>',
            err
          )
          return err
        })
    }
  } catch (err) {
    logError('ERROR ON method createDiscussionHubUser >', err)
    return err
  }
}

writeApi.post('/topics', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const url = API_END_POINTS.createTopic
    const userUid = await getUserUID(userId)
    const response = await axios.post(
      url,
      {
        ...req.body,
        _uid: userUid,
      },
      { ...axiosRequestConfig, headers: { authorization: getWriteApiToken() } }
    )
    if (response && response.data) {
      res.send(response.data)
    }
  } catch (err) {
    logError('ERROR ON POST writeApi /topics >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

writeApi.post('/topics/:topicId', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const topicId = req.params.topicId
    const url = API_END_POINTS.replyToTopic(topicId)
    const userUid = await getUserUID(userId)
    const response = await axios.post(
      url,
      {
        ...req.body,
        _uid: userUid,
      },
      { ...axiosRequestConfig, headers: { authorization: getWriteApiToken() } }
    )
    if (response && response.data) {
      res.send(response.data)
    }
  } catch (err) {
    logError('ERROR ON writeAPI  POST /topics/:topicId >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

writeApi.post('/users', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const response = await createDiscussionHubUser(req.body)
    res.send(response.data)
  } catch (err) {
    logError('ERROR ON writeAPI POST /users >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

writeApi.post('/posts/:postId/bookmark', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const postId = req.params.postId
    const url = API_END_POINTS.bookmarkPost(postId)
    const userUid = await getUserUID(userId)
    const response = await axios.post(
      url,
      {
        _uid: userUid,
      },
      { ...axiosRequestConfig, headers: { authorization: getWriteApiToken() } }
    )
    if (response && response.data) {
      res.send(response.data)
    }
  } catch (err) {
    logError('ERROR ON writeAPI POST /posts/:postId/bookmark >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

writeApi.delete('/posts/:postId/bookmark', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const postId = req.params.postId
    const userUid = await getUserUID(userId)
    const url = API_END_POINTS.bookmarkPost(postId) + `?_uid=${userUid}`
    const response = await axios.delete(url, {
      ...axiosRequestConfig,
      headers: { authorization: getWriteApiToken() },
    })
    if (response && response.data) {
      res.send(response.data)
    }
  } catch (err) {
    logError('ERROR ON writeAPI DELETE /posts/:postId/bookmark >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

writeApi.post('/posts/:postId/vote', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const postId = req.params.postId
    const url = API_END_POINTS.votePost(postId)
    const userUid = await getUserUID(userId)
    const response = await axios.post(
      url,
      {
        ...req.body,
        _uid: userUid,
      },
      { ...axiosRequestConfig, headers: { authorization: getWriteApiToken() } }
    )
    if (response && response.data) {
      res.send(response.data)
    }
  } catch (err) {
    logError('ERROR ON writeAPI POST /posts/:postId/vote >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

writeApi.delete('/posts/:postId/vote', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const postId = req.params.postId
    const userUid = await getUserUID(userId)
    const url = API_END_POINTS.votePost(postId) + `?_uid=${userUid}`
    const response = await axios.delete(url, {
      ...axiosRequestConfig,
      headers: { authorization: getWriteApiToken() },
    })
    if (response && response.data) {
      res.send(response.data)
    }
  } catch (err) {
    logError('ERROR ON writeAPI Delete /posts/:postId/vote >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

writeApi.put('/topics/:topicId/follow', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const topicId = req.params.topicId
    const url = API_END_POINTS.followTopic(topicId)
    const userUid = await getUserUID(userId)
    const response = await axios.put(
      url,
      {
        // TODO :
        _uid: userUid,
      },
      { ...axiosRequestConfig, headers: { authorization: getWriteApiToken() } }
    )
    if (response && response.data) {
      res.send(response.data)
    }
  } catch (err) {
    logError('ERROR ON writeAPI  PUT /topics/:topicId/follow >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

writeApi.put('/topics/:topicId/tags', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const topicId = req.params.topicId
    const url = API_END_POINTS.createOrUpdateTags(topicId)
    const response = await axios.put(
      url,
      {
        ...req.body,
      },
      { ...axiosRequestConfig, headers: { authorization: getWriteApiToken() } }
    )
    if (response && response.data) {
      res.send(response.data)
    }
  } catch (err) {
    logError('ERROR ON writeAPI  PUT /topics/:topicId/tags >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})
