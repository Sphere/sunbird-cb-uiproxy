import axios from 'axios'
import { Response, Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { CONSTANTS } from '../../utils/env'
import { ERROR } from '../../utils/message'
import { extractUserIdFromRequest } from '../../utils/requestExtract'

const API_END_POINTS = {
  follow: `${CONSTANTS.NODE_API_BASE}/follow`,
  followers: `${CONSTANTS.NODE_API_BASE}/getFollowers`,
  getAll: `${CONSTANTS.NODE_API_BASE}/getAll`,
  getFollowers: `${CONSTANTS.NODE_API_BASE}/getfollowersv2`,
  getFollowersv3: `${CONSTANTS.NODE_API_BASE}/getfollowersv3`,
  getFollowing: `${CONSTANTS.NODE_API_BASE}/getfollowing`,
  getFollowingv3: (isIntranet: boolean, isStandAlone: boolean) =>
    `${CONSTANTS.NODE_API_BASE}/getfollowingv3?isIntranet=${isIntranet}&isStandAlone=${isStandAlone}`,
  unFollow: `${CONSTANTS.NODE_API_BASE}/unfollow`,
}

export const followApi = Router()

// sonar-cleanup: extracted from follow.ts's repeated per-route catch blocks — same status/body shape, falling back to the raw err if there's no upstream body (CHANGE 8)
/**
 * Responds with the upstream status code (or 500) and the upstream error
 * body, or the raw caught error if there's no upstream body.
 *
 * @param res - the Express response to send the error on
 * @param err - the caught error, expected to optionally carry an axios-style `response`
 */
// tslint:disable-next-line: no-any
function handleFollowError(res: Response, err: any) {
  res
    .status((err && err.response && err.response.status) || 500)
    .send((err && err.response && err.response.data) || err)
}

followApi.post('/fetchAll', async (req, res) => {
  try {
    const userid = extractUserIdFromRequest(req)
    const rootOrg = req.header('rootOrg')
    const org = req.header('org')
    if (!rootOrg || !org) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }

    const requestBody = {
      ...req.body,
      org,
      rootOrg,
      userid,
    }
    const response = await axios.post(API_END_POINTS.getAll, requestBody, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    handleFollowError(res, err)
  }
})

followApi.get('/followers/:targetId', async (req, res) => {
  try {
    const targetId = req.params.targetId
    if (!targetId) {
      res.status(400).send()
    }
    const response = await axios.get(`${API_END_POINTS.followers}/${targetId}`, axiosRequestConfig)
    res.json(response.data)
  } catch (err) {
    handleFollowError(res, err)
  }
})

followApi.get('/following/:type', async (req, res) => {
  try {
    const type = req.params.type
    const userId = extractUserIdFromRequest(req)

    const rootOrg = req.header('rootOrg')
    const org = req.header('org')
    if (!rootOrg || !org) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }

    const requestBody = {
      org,
      rootOrg,
      type,
      userid: userId,
    }

    const response = await axios.post(API_END_POINTS.getFollowing, requestBody, axiosRequestConfig)
    res.json(response.data)
  } catch (err) {
    handleFollowError(res, err)
  }
})

followApi.get('/getFollowing', async (req, res) => {
  try {
    const { type } = req.query
    const userId = req.query.wid || extractUserIdFromRequest(req)

    const rootOrg = req.header('rootOrg')
    const org = req.header('org')
    if (!rootOrg || !org) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }

    const requestBody = {
      org,
      rootOrg,
      type,
      userid: userId,
    }

    const response = await axios.post(API_END_POINTS.getFollowing, requestBody, axiosRequestConfig)
    res.json(response.data)
  } catch (err) {
    handleFollowError(res, err)
  }
})

followApi.post('/getFollowingv3', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg')
    const org = req.header('org')

    const isIntranet = req.query.isIntranet
    const isStandAlone = req.query.isStandAlone

    if (!rootOrg || !org) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }

    const requestBody = {
      org,
      rootOrg,
      ...req.body,
    }

    const response = await axios.post(
      API_END_POINTS.getFollowingv3(isIntranet, isStandAlone),
      requestBody,
      axiosRequestConfig
    )
    res.json(response.data)
  } catch (err) {
    handleFollowError(res, err)
  }
})

followApi.post('/getFollowersv3', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg')
    const org = req.header('org')
    if (!rootOrg || !org) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }

    const requestBody = {
      ...req.body,
      org,
      rootOrg,
    }

    const response = await axios.post(
      API_END_POINTS.getFollowersv3,
      requestBody,
      axiosRequestConfig
    )
    res.json(response.data)
  } catch (err) {
    handleFollowError(res, err)
  }
})

followApi.post('/', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg')
    const org = req.header('org')
    if (!rootOrg || !org) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }

    const requestBody = {
      ...req.body,
      org,
      rootOrg,
    }

    const response = await axios.post(API_END_POINTS.follow, requestBody, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    handleFollowError(res, err)
  }
})

followApi.post('/unfollow', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg')
    const org = req.header('org')
    if (!rootOrg || !org) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const requestBody = {
      ...req.body,
      org,
      rootOrg,
    }

    const response = await axios.post(API_END_POINTS.unFollow, requestBody, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    handleFollowError(res, err)
  }
})

followApi.post('/getFollowers', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg')
    const org = req.header('org')
    if (!rootOrg || !org) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }

    const requestBody = {
      ...req.body,
      org,
      rootOrg,
    }

    const response = await axios.post(API_END_POINTS.getFollowers, requestBody, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    handleFollowError(res, err)
  }
})
