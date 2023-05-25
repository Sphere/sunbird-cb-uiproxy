import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { axiosRequestConfig } from '../configs/request.config'
import { assessmentCreator } from '../utils/assessmentSubmitHelper'
import { logError, logInfo } from '../utils/logger'
import { ERROR } from '../utils/message'
import {
  extractUserIdFromRequest,
  extractUserToken,
} from '../utils/requestExtract'
export const assessmentApi = Router()
const GENERAL_ERR_MSG = 'Failed due to unknown reason'

assessmentApi.post('/submit/v2', async (req, res) => {
  logInfo('>>>>>>>>>>>>inside submit v2')
  try {
    logInfo('Check Submit V2 : ', req.body.artifactUrl)
    if (!req.body.artifactUrl) {
      res.status(400).json({
        msg: 'Warning ! Artifact Url can not be empty.',
        status: 'error',
        status_code: 400,
      })
    }
    if (!req.body.courseId) {
      res.status(400).json({
        msg: 'Warning ! Course Id can not be empty.',
        status: 'error',
        status_code: 400,
      })
    }
    if (!req.body.batchId) {
      res.status(400).json({
        msg: 'Warning ! Batch Id can not be empty.',
        status: 'error',
        status_code: 400,
      })
    }
    const accessToken = extractUserToken(req)
    const userId = extractUserIdFromRequest(req)
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const assessmentData = req.body
    const assessmentSubmitStatus = await assessmentCreator(
      assessmentData,
      accessToken,
      userId
    )
    res.status(assessmentSubmitStatus.status).json(assessmentSubmitStatus.data)
  } catch (err) {
    logError('submitassessment  failed >>>>>' + err)
    res.status(500).send({
      error: err,
      message: GENERAL_ERR_MSG,
    })
  }
})
assessmentApi.post('/get', async (req, res) => {
  try {
    if (!req.body.artifactUrl) {
      res.status(400).json({
        msg: 'artifact Url can not be empty',
        status: 'error',
        status_code: 400,
      })
    }
    const { artifactUrl } = req.body
    const assessmentData = await fetchAssessment(artifactUrl)
    const formatedData = getFormatedResponse(assessmentData)
    res.status(200).json(formatedData)
    logInfo('formatedData Data in JSON :', JSON.stringify(formatedData))
  } catch (err) {
    res.status(401).send({
      error: 'error while fetching assesment !!',
    })
  }
})
const fetchAssessment = async (artifactUrl: string) => {
  logInfo('Checking fetchAssessment : ', artifactUrl)
  try {
    const response = await axios({
      ...axiosRequestConfig,
      method: 'GET',
      url: artifactUrl,
    })
    logInfo('Response Data in JSON :', response.data)
    if (response.data.questions) {
      logInfo('Response questions :', _.get(response, 'data'))
      return _.get(response, 'data')
    }
  } catch (err) {
    logError('fetchAssement  failed')
  }
}
// tslint:disable-next-line: no-any
const getFormatedResponse = (data: any) => {
  logInfo(
    'Response of questions in formated method JSON :',
    JSON.stringify(data.questions)
  )
  const assessmentInfo = {
    isAssessment: _.get(data, 'isAssessment'),
    questions: [],
    timeLimit: _.get(data, 'timeLimit'),
  }

  const formtedAssessmentInfo = _.forEach(data.questions, (qkey) => {
    // eslint-disable-next-line
    if (qkey.questionType === 'mcq-sca' || qkey.questionType === 'mtf') {
      _.forEach(qkey.options, (optKey) => {
        _.set(optKey, 'isCorrect', false)
      })
      // eslint-disable-next-line
    } else if (qkey.questionType === 'fitb' && qkey.options.length > 0) {
      _.forEach(qkey.options, (optKey) => {
        _.set(optKey, 'isCorrect', false)
        _.set(optKey, 'text', '')
      })
    }
  })
  assessmentInfo.questions = formtedAssessmentInfo
  return assessmentInfo
}
