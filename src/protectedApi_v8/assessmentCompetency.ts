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
    logInfo('New getAssessments competency >>>>>>>>>>> ', path)
    // Awaited so the catch below can actually see a rejection. As a floating
    // .then() with no .catch(), an S3 NoSuchKey left the request hanging with no
    // response at all rather than returning a status.
    const response = await jumbler(path)
    return res.send(response)
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
  return s.substring(prefix.length)
}
