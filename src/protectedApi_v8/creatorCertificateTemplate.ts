import axios from 'axios'
import express from 'express'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
import { extractUserToken } from '../utils/requestExtract'

export const creatorCertificateTemplate = express.Router()
const templateAddEndpoint = `${CONSTANTS.HTTPS_HOST}/api/course/batch/cert/v1/template/add`
creatorCertificateTemplate.patch('/template/add', async (req, res) => {
  try {
    const templateBody = req.body.request.batch
    const courseId = templateBody.courseId
    const batchId = templateBody.batchId
    const template = templateBody.template
    if (!courseId || !batchId || !template) {
      res.status(400).json({
        message: 'Either courseId, batchId, template missing',
        status: 'FAILED',
      })
      return
    }
    const templateAddResponse = await axios({
      data: req.body,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        'Content-Type': 'application/json',
        'x-authenticated-user-token': extractUserToken(req),
      },
      method: 'PATCH',
      url: templateAddEndpoint,
    })
    logInfo()
    res.status(200).json({
      message: 'SUCCESS',
      response: templateAddResponse.data,
    })
  } catch (error) {
    res.status(400).json({
      message: 'FAILED',
      response: 'Error while adding template',
    })
  }
})
