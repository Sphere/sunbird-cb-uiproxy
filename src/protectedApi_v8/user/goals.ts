import axios from 'axios'
import { Request, Response, Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { ITrackStatus } from '../../models/goal.model'
import { formContentRequestObj, formGoalRequestObj, formPlaylistupdateObj, transformGoalUpsertResponse, transformToCommonGoalGroup, transformToGoalForOthers, transformToSbExtPatchRequest, transformToTrackStatus, transformToUserGoals } from '../../service/goals'
import { patchContentViaHierarchyUpdate } from '../../utils/contentPatchHelpers'
import { CONSTANTS } from '../../utils/env'
import { ERROR } from '../../utils/message'
import { extractUserIdFromRequest } from '../../utils/requestExtract'

const API_END_POINTS = {
  acceptRejectGoal: (userId: string, id: string, action: string) =>
    `${CONSTANTS.GOALS_API_BASE}/v1/users/${userId}/goals/${id}/actions?action=${action}`,
  actionRequired: (userId: string, sourceFields: string) =>
    `${CONSTANTS.GOALS_API_BASE}/v2/users/${userId}/goals-For-Action?sourceFields=${sourceFields}`,
  addContentToGoal: (userId: string, id: string, contentId: string, goalType: string) =>
    `${CONSTANTS.GOALS_API_BASE}/v3/users/${userId}/goals/${id}/contents/${contentId}?goal_type=${goalType}`,
  common: (userId: string, groupId: string) =>
    `${CONSTANTS.GOALS_API_BASE}/v1/users/${userId}/common-goals/${groupId}`,
  createUpdateGoal: (userId: string) => `${CONSTANTS.GOALS_API_BASE}/v4/users/${userId}/goals`,
  deleteUserForSharedGoal: (userId: string, goalId: string, type: string) =>
    `${CONSTANTS.GOALS_API_BASE}/v2/users/${userId}/goals/${goalId}/recipients/unshare?goal_type=${type}`,
  deleteUserGoal: (userId: string, goalId: string, type: string) =>
    `${CONSTANTS.GOALS_API_BASE}/v3/users/${userId}/goals/${goalId}?goal_type=${type}`,
  getGoalForOthers: (userId: string, sourceFields: string) =>
    `${CONSTANTS.GOALS_API_BASE}/v2/users/${userId}/goals-for-others?sourceFields=${sourceFields}`,
  getUserGoals: (userId: string, type: string, sourceFields: string) =>
    `${CONSTANTS.GOALS_API_BASE}/v5/users/${userId}/goals?goal_type=${type}&sourceFields=${sourceFields}`,
  goalGroups: (userId: string) => `${CONSTANTS.GOALS_API_BASE}/v1/users/${userId}/goal-groups`,
  removeContentFromGoal: (userId: string, id: string, contentId: string, goalType: string) =>
    `${CONSTANTS.GOALS_API_BASE}/v3/users/${userId}/goals/${id}/contents/${contentId}?goal_type=${goalType}`,
  share: (userId: string, goalId: string, type: string) =>
    `${CONSTANTS.SB_EXT_API_BASE_2}/v1/users/${userId}/goals/${goalId}/recipients?type=${type}`,
  sharev2: (userId: string, goalId: string, type: string) =>
    `${CONSTANTS.GOALS_API_BASE}/v2/users/${userId}/goals/${goalId}/recipients?type=${type}`,
  track: (userId: string, goalId: string, type: string) =>
    `${CONSTANTS.GOALS_API_BASE}/v2/users/${userId}/goals/${goalId}?goal_type=${type}`,
  updateDurationCommonGoal: (userId: string, id: string, type: string, duration: string) =>
    `${CONSTANTS.GOALS_API_BASE}/v3/users/${userId}/common-goals/${id}?goal_type=${type}&duration=${duration}`,
}

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

// sonar-cleanup: extracted from goals.ts's repeated rootOrg header-guard blocks across ~15 routes (CHANGE 14)
/**
 * Reads the `rootOrg` header every goals route requires. Sends the
 * standard 400 and returns `null` if it's missing — callers should return
 * immediately when they get `null` back.
 *
 * @param req - the incoming request
 * @param res - the Express response to send the 400 on, if the header is missing
 */
function requireRootOrg(req: Request, res: Response): string | null {
  const rootOrg = req.header('rootOrg')
  if (!rootOrg) {
    res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
    return null
  }
  return rootOrg
}

// sonar-cleanup: extracted from goals.ts's repeated per-route catch blocks — same status/body shape (CHANGE 8); POST /'s transformGoalUpsertResponse catch and PATCH /:goalId's pre-existing logError(err) catch were deliberately left untouched
/**
 * Responds with the upstream status code (or 500) and the upstream error
 * body (or a generic error message).
 *
 * @param res - the Express response to send the error on
 * @param err - the caught error, expected to optionally carry an axios-style `response`
 */
// tslint:disable-next-line: no-any
function handleGoalsError(res: Response, err: any) {
  res
    .status((err && err.response && err.response.status) || 500)
    .send((err && err.response && err.response.data) || {
      error: GENERAL_ERROR_MSG,
    })
}

export const goalsApi = Router()

goalsApi.get('/updateDurationCommonGoal/:goalType/:goalId', async (req, res) => {
  const { goalType, goalId } = req.params
  const userId = extractUserIdFromRequest(req)
  const duration = req.query.duration
  try {
    const rootOrg = requireRootOrg(req, res)
    if (!rootOrg) {
      return
    }
    const response = await axios.put(
      API_END_POINTS.updateDurationCommonGoal(userId, goalId, goalType, duration),
      {},
      { ...axiosRequestConfig, headers: { rootOrg } }
    )

    res.status(response.status).send(response.data)
  } catch (err) {
    handleGoalsError(res, err)
  }
})

goalsApi.post('/', async (req, res) => {
  const userId = extractUserIdFromRequest(req)
  try {
    const rootOrg = requireRootOrg(req, res)
    if (!rootOrg) {
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
  await patchContentViaHierarchyUpdate(
    req,
    res,
    req.params.goalId,
    formPlaylistupdateObj,
    transformToSbExtPatchRequest
  )
})
goalsApi.post('/share/:goalType/:goalId', async (req, res) => {
  const { goalType, goalId } = req.params
  const userId = extractUserIdFromRequest(req)

  try {
    const rootOrg = requireRootOrg(req, res)
    if (!rootOrg) {
      return
    }
    const response = await axios.post(API_END_POINTS.share(userId, goalId, goalType), req.body, {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleGoalsError(res, err)
  }
})

goalsApi.post('/sharev2/:goalType/:goalId', async (req, res) => {
  const { goalType, goalId } = req.params
  const userId = extractUserIdFromRequest(req)

  try {
    const rootOrg = requireRootOrg(req, res)
    if (!rootOrg) {
      return
    }
    const response = await axios.post(API_END_POINTS.sharev2(userId, goalId, goalType), req.body, {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleGoalsError(res, err)
  }
})

goalsApi.post('/action/:type/:goalType/:goalId', async (req, res) => {
  const { type, goalType, goalId } = req.params
  const confirm = req.query.confirm
  const userId = extractUserIdFromRequest(req)
  try {
    const rootOrg = requireRootOrg(req, res)
    if (!rootOrg) {
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
    handleGoalsError(res, err)
  }
})

goalsApi.get('/action', async (req, res) => {
  const userId = extractUserIdFromRequest(req)
  const sourceFields = req.query.sourceFields
  try {
    const rootOrg = requireRootOrg(req, res)
    if (!rootOrg) {
      return
    }
    const response = await axios.get(API_END_POINTS.actionRequired(userId, sourceFields), {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })

    const goals = response.data.map(transformToGoalForOthers)
    res.status(response.status).send(goals)
  } catch (err) {
    handleGoalsError(res, err)
  }
})

goalsApi.get('/common', async (req, res) => {
  const userId = extractUserIdFromRequest(req)
  try {
    const rootOrg = requireRootOrg(req, res)
    if (!rootOrg) {
      return
    }
    const response = await axios.get(API_END_POINTS.goalGroups(userId), {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })
    const goalGroups = response.data.map(transformToCommonGoalGroup)
    res.status(response.status).send(goalGroups)
  } catch (err) {
    handleGoalsError(res, err)
  }
})

goalsApi.get('/common/:groupId', async (req, res) => {
  const userId = extractUserIdFromRequest(req)
  try {
    const rootOrg = requireRootOrg(req, res)
    if (!rootOrg) {
      return
    }
    const groupId = req.params.groupId
    const response = await axios.get(API_END_POINTS.common(userId, groupId), {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })
    res.status(response.status).send(transformToCommonGoalGroup(response.data))
  } catch (err) {
    handleGoalsError(res, err)
  }
})

goalsApi.get('/for-others', async (req, res) => {
  const userId = extractUserIdFromRequest(req)
  const sourceFields = req.query.sourceFields

  try {
    const rootOrg = requireRootOrg(req, res)
    if (!rootOrg) {
      return
    }
    const response = await axios.get(API_END_POINTS.getGoalForOthers(userId, sourceFields), {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })
    const goals = response.data.map(transformToGoalForOthers)
    res.status(response.status).send(goals)
  } catch (err) {
    handleGoalsError(res, err)
  }
})

goalsApi.get('/track/:goalType/:goalId', async (req, res) => {
  const { goalType, goalId } = req.params
  const userId = extractUserIdFromRequest(req)
  try {
    const rootOrg = requireRootOrg(req, res)
    if (!rootOrg) {
      return
    }
    const response = await axios.get(API_END_POINTS.track(userId, goalId, goalType), {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })

    const trackData: ITrackStatus = transformToTrackStatus(response.data)
    res.status(response.status).send(trackData)
  } catch (err) {
    handleGoalsError(res, err)
  }
})

goalsApi.delete('/:goalType/:goalId', async (req, res) => {
  const { goalType, goalId } = req.params
  const userId = extractUserIdFromRequest(req)

  try {
    const rootOrg = requireRootOrg(req, res)
    if (!rootOrg) {
      return
    }
    const response = await axios.delete(API_END_POINTS.deleteUserGoal(userId, goalId, goalType), {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })

    res.status(response.status).send(response.data)
  } catch (err) {
    handleGoalsError(res, err)
  }
})

goalsApi.post('/removeUsers/:goalType/:goalId', async (req, res) => {
  const { goalType, goalId } = req.params
  const userId = extractUserIdFromRequest(req)
  try {
    const rootOrg = requireRootOrg(req, res)
    if (!rootOrg) {
      return
    }
    const response = await axios.post(
      API_END_POINTS.deleteUserForSharedGoal(userId, goalId, goalType),
      req.body,
      { ...axiosRequestConfig, headers: { rootOrg } }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    handleGoalsError(res, err)
  }
})

goalsApi.get('/:type', async (req, res) => {
  const goalType = req.params.type
  const userId = req.query.wid || extractUserIdFromRequest(req)
  const sourceFields = req.query.sourceFields
  try {
    const rootOrg = requireRootOrg(req, res)
    if (!rootOrg) {
      return
    }
    const response = await axios.get(API_END_POINTS.getUserGoals(userId, goalType, sourceFields), {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })

    res.status(response.status).send(transformToUserGoals(response.data))
  } catch (err) {
    handleGoalsError(res, err)
  }
})

goalsApi.patch('/addContent/:goalId/:contentId', async (req, res) => {
  const { goalId, contentId } = req.params
  const goalType = req.query.goal_type
  const userId = extractUserIdFromRequest(req)
  try {
    const rootOrg = requireRootOrg(req, res)
    if (!rootOrg) {
      return
    }
    const response = await axios.patch(
      API_END_POINTS.addContentToGoal(userId, goalId, contentId, goalType),
      {},
      { ...axiosRequestConfig, headers: { rootOrg } }
    )

    res.status(response.status).send(response.data)
  } catch (err) {
    handleGoalsError(res, err)
  }
})

goalsApi.delete('/removeContent/:goalId/:contentId', async (req, res) => {
  const { goalId, contentId } = req.params
  const goalType = req.query.goal_type
  const userId = extractUserIdFromRequest(req)
  try {
    const rootOrg = requireRootOrg(req, res)
    if (!rootOrg) {
      return
    }
    const response = await axios.delete(
      API_END_POINTS.removeContentFromGoal(userId, goalId, contentId, goalType),
      { ...axiosRequestConfig, headers: { rootOrg } }
    )

    res.status(response.status).send(response.data)
  } catch (err) {
    handleGoalsError(res, err)
  }
})
