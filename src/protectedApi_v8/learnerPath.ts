import axios from 'axios'
import { Router } from 'express'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
import { extractUserIdFromRequest, extractUserToken } from '../utils/requestExtract'

export const learnerPathApi = Router()

const API_END_POINTS = {
  GET_LEARNER_PATH: `${CONSTANTS.SB_EXT_API_BASE_2}/learnerpath`,
  UPDATE_LEARNER_PATH: `${CONSTANTS.SB_EXT_API_BASE_2}/learnerpath`,
}

learnerPathApi.post('/', async (req, res) => {
  try {
    logInfo('***********  learner path post')
    logInfo('Inside learner path api (portal)', JSON.stringify(req.body))
    const learnerPathBody = req.body
    const userId = extractUserIdFromRequest(req)
    if (userId !== learnerPathBody.userid) {
      return res.status(400).json({
        message: 'Invalid session or userid',
        status: 'FAILED',
      })
    }
    const serviceResponse = await axios({
      data: learnerPathBody,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        'Content-Type': 'application/json',
        'x-authenticated-user-token': extractUserToken(req),
      },
      method: 'POST',
      url: API_END_POINTS.UPDATE_LEARNER_PATH,
    })
    res.status(200).json({
      data: serviceResponse.data,
      status: 'SUCCESS',
    })
  } catch (err) {
    logInfo(JSON.stringify(err))
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Something went wrong while updating or inserting learnerpath',
      }
    )
  }
})

learnerPathApi.get('/', async (req, res) => {
  try {
    logInfo('***********  learner path')
    const userId = req.query.userId as string
    logInfo('Inside learner path api (portal)', JSON.stringify(userId))
    const sessionUserId = extractUserIdFromRequest(req)
    if (sessionUserId !== userId) {
      return res.status(400).json({
        message: 'Invalid session or userid',
        status: 'FAILED',
      })
    }
    const serviceResponse = await axios({
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        'Content-Type': 'application/json',
        'x-authenticated-user-token': extractUserToken(req),
      },
      method: 'GET',
      params: req.query,
      url: API_END_POINTS.GET_LEARNER_PATH,
    })
    res.status(200).json({
      data: serviceResponse.data,
      status: 'SUCCESS',
    })
  } catch (err) {
    logInfo(JSON.stringify(err))
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Something went wrong while fetching learnerpath',
      }
    )
  }
})
