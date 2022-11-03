import axios from 'axios'
import _ from 'lodash'
import { CONSTANTS } from '../utils/env'
import {
  extractUserIdFromRequest,
  extractUserToken,
} from '../utils/requestExtract'
import { logInfo } from './logger'

const API_END_POINTS = {
  assessmentSubmitV3: `${CONSTANTS.SB_EXT_API_BASE_2}/v2/user`,
}
// tslint:disable-next-line: no-any
export async function competencyAssessmentSubmit(req: any) {
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
  logInfo('Submit response', response.data)
  return response.data
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
