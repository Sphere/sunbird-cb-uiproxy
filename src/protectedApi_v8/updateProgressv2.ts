import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
import { logError } from '../utils/logger'
import { extractUserToken } from '../utils/requestExtract'
import { requestValidator } from '../utils/requestValidator'

export const updateProgressv2 = Router()

const API_END_POINTS = {
  READ_PROGRESS: `${CONSTANTS.HTTPS_HOST}/api/course/v1/content/state/read`,
  UPDATE_PROGRESS: `${CONSTANTS.HTTPS_HOST}/api/course/v1/content/state/update`,
}
updateProgressv2.patch('/update', async (req, res) => {
  try {
    logInfo('Check req body of update progress v2 for web>> ' + req.body)

    if (requestValidator(['userId', 'contents'], req.body.request, res)) return

    await axios({
      data: req.body,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        'Content-Type': 'application/json',
        'x-authenticated-user-token': extractUserToken(req),
      },
      method: 'PATCH',
      url: API_END_POINTS.UPDATE_PROGRESS,
    })
    const stateReadBody = {
      request: {
        batchId: req.body.request.contents[0].batchId,
        contentIds: [],
        courseId: req.body.request.contents[0].courseId,
        fields: ['progressdetails'],
        userId: req.body.request.userId,
      },
    }
    const responseProgressRead = await axios({
      data: stateReadBody,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        'Content-Type': 'application/json',
        'x-authenticated-user-token': extractUserToken(req),
      },
      method: 'POST',
      url: API_END_POINTS.READ_PROGRESS,
    })
    logInfo('Check req body of update progress v2 >> ' + req.body)
    res.status(200).json(responseProgressRead.data)
  } catch (error) {
    logError('Error in update progress v2  >>>>>>' + error)
    res.status(500).send({
      message: 'Something went wrong during progress update',
      status: 'failed',
    })
  }
})
