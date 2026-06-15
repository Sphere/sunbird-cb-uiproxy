import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { IUserGroup } from '../../models/usergroup.model'
import { logError } from '../../utils/logger'
import { ERROR } from '../../utils/message'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'

export const userGroupApi = Router()

userGroupApi.get('/groupContent', async (req, res) => {
  try {
    const _pageSize = req.query.pageSize || 50
    const userId = extractUserIdFromRequest(req)
    const groupApiUrl = API_END_POINTS.userGroup(userId)
    const groupResponse = await axios.get(groupApiUrl)
    const groupResponses: IUserGroup[] = groupResponse.data
    const groupIds = groupResponses.map((r: IUserGroup) => r.group_id)

    const body = {
      filters: [
        {
          andFilters: [
            {
              labels: groupIds,
            },
          ],
        },
      ],
      pageSize: _pageSize,
      rootOrg: req.header('rootOrg'),
      sourceFields: [],
      uuid: userId,
    }

    const response = await axios.post(API_END_POINTS.searchV6, body, axiosRequestConfig)
    const finalResponse = {
      contents: response.data.result,
    }
    res.json(finalResponse)
  } catch (err) {
    logError('SEARCH V6 API ERROR >', err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Failed due to unknown reason',
      }
    )
  }
})

userGroupApi.get('/fetchUserGroup', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const userId = req.query.userId ? req.query.userId : extractUserIdFromRequest(req)

    const response = await axios.get(API_END_POINTS.userGroup(userId))
    res.status(response.status).send(response.data)
  } catch (err) {
    logError('GROUP COHORT CONTENT >', err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Failed due to unknown reason',
      }
    )
  }
})
