import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { ITrackStatus } from '../../models/goal.model'
import { formContentRequestObj, formGoalRequestObj, formPlaylistupdateObj, transformGoalUpsertResponse, transformToCommonGoalGroup, transformToGoalForOthers, transformToSbExtPatchRequest, transformToTrackStatus, transformToUserGoals } from '../../service/goals'
import { logError } from '../../utils/logger'
import { ERROR } from '../../utils/message'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

export const goalsApi = Router()

goalsApi.get('/updateDurationCommonGoal/:goalType/:goalId', async (req, res) => {
  const { goalType, goalId } = req.params
  const userId = extractUserIdFromRequest(req)
  const duration = req.query.duration
  try {
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios.put(
      API_END_POINTS.updateDurationCommonGoal(userId, goalId, goalType, duration),
      {},
      { ...axiosRequestConfig, headers: { rootOrg } }
    )

    res.status(response.status).send(response.data)
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

goalsApi.post('/', async (req, res) => {
  const userId = extractUserIdFromRequest(req)
  try {
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const auth = req.header('Authorization')
    const url = `https://igot-dev.in/apis/proxies/v8/action/content/v3/create`
    const response = await axios({
      ...axiosRequestConfig,
      data: formGoalRequestObj(req.body, userId),
      headers: {
        Authorization: auth,
        org: 'dopt',
        rootOrg: 'igot',
      },
      method: 'POST',
      url,
    })

    const urll = `https://igot-dev.in/apis/proxies/v8/action/content/v3/hierarchy/update`

    const response1 = await axios({
      ...axiosRequestConfig,
      data: formContentRequestObj(req.body, response.data, userId),
      headers: {
        Authorization: auth,
        org: 'dopt',
        rootOrg: 'igot',
      },
      method: 'PATCH',
      url: urll,
    })

    res.status(response1.status).send(response1.data)
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && transformGoalUpsertResponse(err.response.data)) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

goalsApi.patch('/:goalId', async (req, res) => {
  /* Patch request to update the title of a playlist */
  try {
    const request = req.body
    const rootOrg = req.header('rootOrg')
    const auth = req.header('Authorization')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const goalId = req.params.goalId
    const url = `https://igot-dev.in/apis/proxies/v8/action/content/v3/update/${goalId}`
    const response = await axios({
      ...axiosRequestConfig,
      data: formPlaylistupdateObj(request),
      headers: {
        Authorization: auth,
        org: 'dopt',
        rootOrg: 'igot',
      },
      method: 'PATCH',
      url,
    })

    const urll = `https://igot-dev.in/apis/proxies/v8/action/content/v3/hierarchy/update`

    const response1 = await axios({
      ...axiosRequestConfig,
      data: transformToSbExtPatchRequest(request, goalId),
      headers: {
        Authorization: auth,
        org: 'dopt',
        rootOrg: 'igot',
      },
      method: 'PATCH',
      url: urll,
    })
    res.status(response.status || response1.status).send()
  } catch (err) {
    logError(err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }

})
goalsApi.post('/share/:goalType/:goalId', async (req, res) => {
  const { goalType, goalId } = req.params
  const userId = extractUserIdFromRequest(req)

  try {
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios.post(API_END_POINTS.share(userId, goalId, goalType), req.body, {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

goalsApi.post('/sharev2/:goalType/:goalId', async (req, res) => {
  const { goalType, goalId } = req.params
  const userId = extractUserIdFromRequest(req)

  try {
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios.post(API_END_POINTS.sharev2(userId, goalId, goalType), req.body, {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

goalsApi.post('/action/:type/:goalType/:goalId', async (req, res) => {
  const { type, goalType, goalId } = req.params
  const confirm = req.query.confirm
  const userId = extractUserIdFromRequest(req)
  try {
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const requestBody = {
      goal_type: goalType,
      message: req.body.message,
      shared_by: req.body.sharedBy,
    }
    let url = API_END_POINTS.acceptRejectGoal(userId, goalId, type)
    if (type === 'accept') {
      url += `&confirm=${confirm}`
    }
    const response = await axios.post(url, requestBody, {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

goalsApi.get('/action', async (req, res) => {
  const userId = extractUserIdFromRequest(req)
  const sourceFields = req.query.sourceFields
  try {
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios.get(API_END_POINTS.actionRequired(userId, sourceFields), {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })

    const goals = response.data.map(transformToGoalForOthers)
    res.status(response.status).send(goals)
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

goalsApi.get('/common', async (req, res) => {
  const userId = extractUserIdFromRequest(req)
  try {
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios.get(API_END_POINTS.goalGroups(userId), {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })
    const goalGroups = response.data.map(transformToCommonGoalGroup)
    res.status(response.status).send(goalGroups)
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

goalsApi.get('/common/:groupId', async (req, res) => {
  const userId = extractUserIdFromRequest(req)
  try {
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const groupId = req.params.groupId
    const response = await axios.get(API_END_POINTS.common(userId, groupId), {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })
    res.status(response.status).send(transformToCommonGoalGroup(response.data))
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

goalsApi.get('/for-others', async (req, res) => {
  const userId = extractUserIdFromRequest(req)
  const sourceFields = req.query.sourceFields

  try {
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios.get(API_END_POINTS.getGoalForOthers(userId, sourceFields), {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })
    const goals = response.data.map(transformToGoalForOthers)
    res.status(response.status).send(goals)
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

goalsApi.get('/track/:goalType/:goalId', async (req, res) => {
  const { goalType, goalId } = req.params
  const userId = extractUserIdFromRequest(req)
  try {
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios.get(API_END_POINTS.track(userId, goalId, goalType), {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })

    const trackData: ITrackStatus = transformToTrackStatus(response.data)
    res.status(response.status).send(trackData)
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

goalsApi.delete('/:goalType/:goalId', async (req, res) => {
  const { goalType, goalId } = req.params
  const userId = extractUserIdFromRequest(req)

  try {
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios.delete(API_END_POINTS.deleteUserGoal(userId, goalId, goalType), {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })

    res.status(response.status).send(response.data)
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

goalsApi.post('/removeUsers/:goalType/:goalId', async (req, res) => {
  const { goalType, goalId } = req.params
  const userId = extractUserIdFromRequest(req)
  try {
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios.post(
      API_END_POINTS.deleteUserForSharedGoal(userId, goalId, goalType),
      req.body,
      { ...axiosRequestConfig, headers: { rootOrg } }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

goalsApi.get('/:type', async (req, res) => {
  const goalType = req.params.type
  const userId = req.query.wid || extractUserIdFromRequest(req)
  const sourceFields = req.query.sourceFields
  try {
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios.get(API_END_POINTS.getUserGoals(userId, goalType, sourceFields), {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })

    res.status(response.status).send(transformToUserGoals(response.data))
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

goalsApi.patch('/addContent/:goalId/:contentId', async (req, res) => {
  const { goalId, contentId } = req.params
  const goalType = req.query.goal_type
  const userId = extractUserIdFromRequest(req)
  try {
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios.patch(
      API_END_POINTS.addContentToGoal(userId, goalId, contentId, goalType),
      {},
      { ...axiosRequestConfig, headers: { rootOrg } }
    )

    res.status(response.status).send(response.data)
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

goalsApi.delete('/removeContent/:goalId/:contentId', async (req, res) => {
  const { goalId, contentId } = req.params
  const goalType = req.query.goal_type
  const userId = extractUserIdFromRequest(req)
  try {
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios.delete(
      API_END_POINTS.removeContentFromGoal(userId, goalId, contentId, goalType),
      { ...axiosRequestConfig, headers: { rootOrg } }
    )

    res.status(response.status).send(response.data)
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})
