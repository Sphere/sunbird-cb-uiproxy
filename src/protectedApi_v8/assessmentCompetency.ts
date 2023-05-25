import { Router } from 'express'
import _ from 'lodash'
import { assessmentCreator } from '../utils/assessmentSubmitHelper'
import { jumbler } from '../utils/jumbler'
import { logInfo } from '../utils/logger'
import {
  extractUserIdFromRequest,
  extractUserToken,
} from '../utils/requestExtract'

export const assessmentCompetency = Router()
const unknownError = 'Failed due to unknown reason'

assessmentCompetency.get('/v1/assessment/*', async (req, res) => {
  try {
    const path = removePrefix(
      '/protected/v8/assessmentCompetency/v1/assessment/',
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

assessmentCompetency.post('/v1/assessment/submit', async (req, res) => {
  try {
    const accessToken = extractUserToken(req)
    const userId = extractUserIdFromRequest(req)
    const assessmentData = req.body
    const assessmentSubmitStatus = await assessmentCreator(
      assessmentData,
      accessToken,
      userId
    )
    res.status(assessmentSubmitStatus.status).json(assessmentSubmitStatus.data)
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
