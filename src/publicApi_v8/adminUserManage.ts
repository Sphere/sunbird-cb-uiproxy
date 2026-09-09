import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { logError, logInfo } from '../utils/logger'
import { API_END_POINTS } from './apiConstants'

export const adminUserManage = Router()

// Admin user search / update via lern-service PRIVATE endpoints (tokenless - no end-user
// x-authenticated-user-token, authenticated by the SB_API_KEY instead). This is the same
// server-to-server pattern bnrc uses, exposed as generic search/update for the admin
// portal (which does its own AWS login + sends the SB_API_KEY).
//
// SECURITY: these are tokenless calls to a privileged backend, so the caller MUST supply
// the SB_API_KEY in the Authorization header. That key is forwarded to lern and also gates
// the route - a request without it is rejected, so this is not an open, unauthenticated
// user-CRUD surface. The key never has to live in the browser other than what the admin
// portal already holds.
// tslint:disable-next-line: no-any
const getForwardAuthorization = (request: any): string =>
  request.header('Authorization') || request.header('authorization') || ''

// tslint:disable-next-line: no-any
const forwardError = (response: any, error: any, context: string) => {
  logError(`adminUserManage ${context} error: ` + JSON.stringify(error && error.message))
  const status = (error && error.response && error.response.status) || 500
  const data = (error && error.response && error.response.data) || {
    error: 'Something went wrong while calling the user service',
  }
  response.status(status).json(data)
}

adminUserManage.post('/search', async (request, response) => {
  const authorization = getForwardAuthorization(request)
  if (!authorization) {
    return response
      .status(401)
      .json({ error: 'Missing Authorization (SB_API_KEY) header' })
  }
  try {
    logInfo('adminUserManage search -> ' + API_END_POINTS.USER_SEARCH)
    const searchResponse = await axios({
      ...axiosRequestConfig,
      data: request.body,
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      method: 'POST',
      url: API_END_POINTS.USER_SEARCH,
    })
    return response.status(searchResponse.status).json(searchResponse.data)
  } catch (error) {
    return forwardError(response, error, 'search')
  }
})

adminUserManage.post('/update', async (request, response) => {
  const authorization = getForwardAuthorization(request)
  if (!authorization) {
    return response
      .status(401)
      .json({ error: 'Missing Authorization (SB_API_KEY) header' })
  }
  try {
    logInfo('adminUserManage update -> ' + API_END_POINTS.profileUpdate)
    const updateResponse = await axios({
      ...axiosRequestConfig,
      data: request.body,
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      method: 'POST',
      url: API_END_POINTS.profileUpdate,
    })
    return response.status(updateResponse.status).json(updateResponse.data)
  } catch (error) {
    return forwardError(response, error, 'update')
  }
})
