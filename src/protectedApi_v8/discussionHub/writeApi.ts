import axios from 'axios'
import { Request, Response, Router } from 'express'
import { getRootOrg } from '../../authoring/utils/header'
import { axiosRequestConfig } from '../../configs/request.config'
import {
  getUserUID,
  getWriteApiAdminUID,
  getWriteApiToken,
} from '../../utils/discussionHub-helper'
import { CONSTANTS } from '../../utils/env'
import { logError, logInfo } from '../../utils/logger'
import { extractUserIdFromRequest } from '../../utils/requestExtract'

const API_ENDPOINTS = {
  createTopic: `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/v2/topics`,
  createUser: `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/v2/users`,
  // tslint:disable-next-line: object-literal-sort-keys
  createOrUpdateTags: (topicId: string | number) =>
    `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/v2/topics/${topicId}/tags`,
  followTopic: (topicId: string | number) =>
    `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/v2/topics/${topicId}/follow`,
  replyToTopic: (topicId: string | number) =>
    `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/v2/topics/${topicId}`,
  votePost: (postId: string | number) =>
    `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/v2/posts/${postId}/vote`,
  // tslint:disable-next-line: object-literal-sort-keys
  bookmarkPost: (postId: string | number) =>
    `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/v2/posts/${postId}/bookmark`,
}

export const writeApi = Router()

// sonar-cleanup: extracted from writeApi.ts's repeated per-route catch blocks — same logError(label, err) + status/body shape (CHANGE 8); catches inside createDiscussionHubUser/getUserByEmail/getUserByUsername sit inside a documented never-invoked-closure bug and were left untouched; also reused by topics.ts and posts.ts, whose catch blocks had the identical shape (CHANGE 34)
/**
 * Logs the error under `label`, then responds with the upstream status code
 * (or 500) and the upstream error body (or an empty object).
 *
 * @param res - the Express response to send the error on
 * @param err - the caught error, expected to optionally carry an axios-style `response`
 * @param label - text prefixed to the logged error message
 */
// tslint:disable-next-line: no-any
export function handleWriteApiError(res: Response, err: any, label: string) {
  logError(label, err)
  res
    .status((err?.response?.status) || 500)
    .send((err?.response?.data) || {})
}

/**
 * Shared body for the bookmark/vote POST routes — same request shape,
 * only the target URL, whether the client body is forwarded, and the log
 * label differ.
 *
 * @param req - the incoming request
 * @param res - the Express response to send the upstream result on
 * @param url - the resolved upstream endpoint to post to
 * @param body - the request body to forward (empty object if this route discards it)
 * @param label - text prefixed to the logged error message
 */
async function postWithUserUid(
  req: Request,
  res: Response,
  url: string,
  // tslint:disable-next-line: no-any
  body: any,
  label: string
) {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const userUid = await getUserUID(userId)
    const response = await axios.post(
      url,
      {
        ...body,
        _uid: userUid,
      },
      { ...axiosRequestConfig, headers: { authorization: getWriteApiToken() } }
    )
    if (response?.data) {
      res.send(response.data)
    }
  } catch (err) {
    handleWriteApiError(res, err, label)
  }
}

/**
 * Shared body for the bookmark/vote DELETE routes — identical request
 * shape, only the target URL and the log label differ.
 *
 * @param req - the incoming request
 * @param res - the Express response to send the upstream result on
 * @param url - the resolved upstream endpoint to delete against
 * @param label - text prefixed to the logged error message
 */
async function deleteWithUserUid(req: Request, res: Response, url: string, label: string) {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const userUid = await getUserUID(userId)
    const response = await axios.delete(url + `?_uid=${userUid}`, {
      ...axiosRequestConfig,
      headers: { authorization: getWriteApiToken() },
    })
    if (response?.data) {
      res.send(response.data)
    }
  } catch (err) {
    handleWriteApiError(res, err, label)
  }
}

// tslint:disable-next-line: no-any
export async function createDiscussionHubUser(user: any): Promise<any> {
  logInfo('Starting to create new user into NodeBB DiscussionHub...')
  // tslint:disable-next-line: no-try-promise
  try {
    const request1 = {
      ...user,
      _uid: getWriteApiAdminUID(),
    }
    const url = API_ENDPOINTS.createUser
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
  await postWithUserUid(
    req,
    res,
    API_ENDPOINTS.createTopic,
    req.body,
    'ERROR ON POST writeApi /topics >'
  )
})

writeApi.post('/topics/:topicId', async (req, res) => {
  await postWithUserUid(
    req,
    res,
    API_ENDPOINTS.replyToTopic(req.params.topicId),
    req.body,
    'ERROR ON writeAPI  POST /topics/:topicId >'
  )
})

writeApi.post('/users', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const response = await createDiscussionHubUser(req.body)
    res.send(response.data)
  } catch (err) {
    handleWriteApiError(res, err, 'ERROR ON writeAPI POST /users >')
  }
})

writeApi.post('/posts/:postId/bookmark', async (req, res) => {
  await postWithUserUid(
    req,
    res,
    API_ENDPOINTS.bookmarkPost(req.params.postId),
    {},
    'ERROR ON writeAPI POST /posts/:postId/bookmark >'
  )
})

writeApi.delete('/posts/:postId/bookmark', async (req, res) => {
  await deleteWithUserUid(
    req,
    res,
    API_ENDPOINTS.bookmarkPost(req.params.postId),
    'ERROR ON writeAPI DELETE /posts/:postId/bookmark >'
  )
})

writeApi.post('/posts/:postId/vote', async (req, res) => {
  await postWithUserUid(
    req,
    res,
    API_ENDPOINTS.votePost(req.params.postId),
    req.body,
    'ERROR ON writeAPI POST /posts/:postId/vote >'
  )
})

writeApi.delete('/posts/:postId/vote', async (req, res) => {
  await deleteWithUserUid(
    req,
    res,
    API_ENDPOINTS.votePost(req.params.postId),
    'ERROR ON writeAPI Delete /posts/:postId/vote >'
  )
})

writeApi.put('/topics/:topicId/follow', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const topicId = req.params.topicId
    const url = API_ENDPOINTS.followTopic(topicId)
    const userUid = await getUserUID(userId)
    const response = await axios.put(
      url,
      {
        // TODO :
        _uid: userUid,
      },
      { ...axiosRequestConfig, headers: { authorization: getWriteApiToken() } }
    )
    if (response?.data) {
      res.send(response.data)
    }
  } catch (err) {
    handleWriteApiError(res, err, 'ERROR ON writeAPI  PUT /topics/:topicId/follow >')
  }
})

writeApi.put('/topics/:topicId/tags', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const topicId = req.params.topicId
    const url = API_ENDPOINTS.createOrUpdateTags(topicId)
    const response = await axios.put(
      url,
      {
        ...req.body,
      },
      { ...axiosRequestConfig, headers: { authorization: getWriteApiToken() } }
    )
    if (response?.data) {
      res.send(response.data)
    }
  } catch (err) {
    handleWriteApiError(res, err, 'ERROR ON writeAPI  PUT /topics/:topicId/tags >')
  }
})
