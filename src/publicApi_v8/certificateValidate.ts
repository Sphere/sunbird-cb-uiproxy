import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
const API_END_POINTS = {
    USER_SEARCH: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
    VALIDATE_CERTIFICATE:  `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/certreg/v1/certs/validate`,
}

// Fetches the user's masked email/phone via the Sunbird user-search API for a given userId.
// Mirrors the search pattern used in maharastraNursingCouncilAuth.ts (getUserDetails).
async function getUserContactDetails(userId: string) {
    try {
        const userResponse = await axios({
            ...axiosRequestConfig,
            data: {
                request: {
                    filters: { userId },
                },
            },
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                'Content-Type': 'application/json',
            },
            method: 'POST',
            url: API_END_POINTS.USER_SEARCH,
        })
        const userData = _.get(userResponse, 'data.result.response.content[0]', {})
        return {
            maskedEmail: _.get(userData, 'maskedEmail') || _.get(userData, 'email') || '',
            maskedPhone: _.get(userData, 'maskedPhone') || _.get(userData, 'phone') || '',
        }
    } catch (error) {
        logError('Error fetching user contact details in validate certificate >>>>>>' + error)
        return { maskedEmail: '', maskedPhone: '' }
    }
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
            const result = response.data.result
            // The recipient userId lives inside the certificate result. Paths vary by
            // deployment, so confirm the correct one against this logged result and trim below.
            logInfo('Validate certificate result >>>>>>' + JSON.stringify(result))
            const recipientId =
                _.get(result, 'recipient.id') ||
                _.get(result, 'recipient.identity') ||
                _.get(result, 'json.recipient.id') ||
                _.get(result, 'json.recipient.identity') ||
                ''
            if (recipientId) {
                const contactDetails = await getUserContactDetails(recipientId)
                result.maskedEmail = contactDetails.maskedEmail
                result.maskedPhone = contactDetails.maskedPhone
            }
            res.status(response.status).send(result)
          } else {
            throw new Error(
              _.get(response.data, 'params.errmsg') ||
                _.get(response.data, 'params.err')
            )
          }
    } catch (error) {
        logError('Error in validate certificate  >>>>>>' + error)
        logError('Validate certificate upstream response >>>>>>' +
            JSON.stringify(_.get(error, 'response.data') || _.get(error, 'message')))
        // Forward the upstream status (e.g. 400 for an invalid certId/accessCode)
        // so the client can distinguish a bad certificate from a real server error.
        const upstreamStatus = _.get(error, 'response.status')
        const upstreamMessage =
            _.get(error, 'response.data.params.errmsg') ||
            _.get(error, 'response.data.params.err')
        res.status(upstreamStatus || 500).send({
          message : upstreamMessage || VALIDATION_FAIL,
          status : 'failed',
        })
    }

})
