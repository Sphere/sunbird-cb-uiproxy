import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { CONSTANTS } from '../utils/env'
import { jumbler } from '../utils/jumbler'
import { logInfo } from '../utils/logger'
import {
  extractUserIdFromRequest,
  extractUserToken,
} from '../utils/requestExtract'

const API_END_POINTS = {
  assessmentSubmitV3: `${CONSTANTS.SB_EXT_API_BASE_2}/v2/user`,
}

export const assessmentCompetency = Router()
const unknownError = 'Failed due to unknown reason'

assessmentCompetency.get('/v1/getAssessment/*', async (req, res) => {
  try {
    const path = removePrefix(
      '/protected/v8/assessmentCompetency/v1/getAssessment/',
      req.originalUrl
    )
    jumbler(path).then((response) => {
      return res.send(response)
    })
    logInfo('New getAssessments competency >>>>>>>>>>> ', path)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})

assessmentCompetency.post('/v1/submitAssessment/', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg')
    const assessmentDataS3 = await axios({
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'GET',
      url: req.body.artifactUrl,
    })
    const formattedAssessmentData = getFormatedRequest(
      assessmentDataS3.data,
      req.body
    )
    const url = `${API_END_POINTS.assessmentSubmitV3}/assessment/submit`
    const accessToken = extractUserToken(req)
    const userId = extractUserIdFromRequest(req)
    const response = await axios({
      data: formattedAssessmentData,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        rootOrg,
        userId,
        'x-authenticated-user-token': accessToken,
      },
      method: 'POST',
      url,
    })
    logInfo('New submitAssessments competency >>>>>>>>>>> ')
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})
function removePrefix(prefix: string, s: string) {
  return s.substr(prefix.length)
}
// tslint:disable-next-line: no-any
const getFormatedRequest = (data: any, requestBody: any) => {
  _.forEach(data.questions, (qkey) => {
    _.forEach(requestBody.questions, (reqKey) => {
      if (
        qkey.questionType === 'mcq-sca' ||
        qkey.questionType === 'fitb' ||
        qkey.questionType === 'mcq-mca'
      ) {
        _.forEach(qkey.options, (qoptKey) => {
          _.forEach(reqKey.options, (optKey) => {
            if (optKey.optionId === qoptKey.optionId) {
              if (
                qkey.questionType === 'mcq-sca' ||
                qkey.questionType === 'fitb' ||
                qkey.questionType === 'mcq-mca'
              ) {
                _.set(optKey, 'isCorrect', _.get(qoptKey, 'isCorrect'))
                _.set(optKey, 'text', _.get(qoptKey, 'text'))
              } else if (qkey.questionType === 'mtf') {
                _.set(optKey, 'isCorrect', _.get(qoptKey, 'isCorrect'))
                _.set(optKey, 'match', _.get(qoptKey, 'match'))
              }
            }
          })
        })
      }
    })
  })
  logInfo('requestBody to submit the assessment ', JSON.stringify(requestBody))
  return requestBody
}
