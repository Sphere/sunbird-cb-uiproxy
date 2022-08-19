import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
const API_END_POINTS = {
    VALIDATE_CERTIFICATE:  `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/certreg/v1/certs/validate`,
}
const VALIDATION_FAIL = 'Sorry ! Validate cerificate not worked . Please try again in sometime.'
export const validateCertificate = Router()

validateCertificate.post('/validate', async (req, res) => {
    try {
        if (!req.body.accessCode) {
            res.status(400).json({
              msg: 'AccessCode. can not be empty',
              status: 'error',
              status_code: 400,
            })
        }
        if (!req.body.certId) {
            res.status(400).json({
              msg: 'certId. can not be empty',
              status: 'error',
              status_code: 400,
            })
        }
        const { accessCode, certId} = req.body

        const response = await axios({
            ...axiosRequestConfig,
            data: {
              request: {
                accessCode,
                certId,
                verifySignature: true,
              },
            },
            headers: {
              Authorization: CONSTANTS.SB_API_KEY,
            },
            method: 'POST',
            url: API_END_POINTS.VALIDATE_CERTIFICATE,
          })
        if (response.data.responseCode === 'OK') {
            logInfo('Log of validate certificate if OK :')
            res.status(response.status).send(response.data.result)
          } else {
            throw new Error(
              _.get(response.data, 'params.errmsg') ||
                _.get(response.data, 'params.err')
            )
          }
    } catch (error) {
        logError('Error in validate certificate  >>>>>>' + error)
        res.status(500).send({
          message : VALIDATION_FAIL,
          status : 'failed',
        })
    }

})
