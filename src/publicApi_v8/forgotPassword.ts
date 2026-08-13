import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import {  validateOTP } from './otp'
const API_END_POINTS = {
  generateOtp: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/otp/v1/generate`,
  recoverPassword: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/password/reset`,
  searchSb: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
  verifyOtp: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/otp/v1/verify`,
}

const ACCOUNT_RESET_FAIL_MSG = 'Sorry ! There is some issue in resetting your account. Please contact admin.'
const VERIFY_OTP_FAIL = 'Sorry ! There is some issue in verifying your account. Please try after sometime.'

// sonar-cleanup: extracted from /reset/proxy/password's byte-identical
// email/phone success tails (CHANGE 48) — same generateOtp call, same
// 200 response. Real difference threaded through: each branch's own
// userId-found log label and send-confirmation log label.
/**
 * Sends a password-reset OTP for a user that was just found by email or
 * phone, then responds 200. Shared by `/reset/proxy/password`'s email and
 * phone branches.
 *
 * @param res - the Express response to send the 200 confirmation on
 * @param userUUId - the id of the user found by the preceding search
 * @param sbUsername - the raw email or phone the caller submitted
 * @param userType - `'email'` or `'phone'`, forwarded to the generateOtp request
 * @param userIdLogLabel - text logged (with `userUUId` appended) once the user id is resolved
 * @param sentLogLabel - text logged (with the generateOtp response appended) after the OTP request completes
 */
async function sendPasswordResetOtp(
  // tslint:disable-next-line: no-any
  res: any, userUUId: string, sbUsername: string, userType: string, userIdLogLabel: string, sentLogLabel: string
) {
  logInfo(userIdLogLabel, userUUId)

  // generate otp
  const sendResponse = await axios({
    ...axiosRequestConfig,
    data: {
      request: { userId: userUUId, key: sbUsername, type: userType },
    },
    headers: { Authorization: CONSTANTS.SB_API_KEY },
    method: 'POST',
    url: API_END_POINTS.generateOtp,
  })
  logInfo(sentLogLabel + sendResponse)
  res.status(200).send({ message: 'Success ! Please verify the OTP .' })
}

export const forgotPassword = Router()

forgotPassword.post('/reset/proxy/password', async (req, res) => {
  logInfo('Entered into /reset/proxy/password ')
  try {
    logInfo('Entered into try block ')
    const sbUsername = req.body.userName
    const userType = await emailOrMobile(sbUsername)
    logInfo('Entered into try block userName : ', sbUsername)
    if (userType === 'email') {
      logInfo('Entered into email ')
      const searchresponse = await axios({
        ...axiosRequestConfig,
        data: {
          request: { filters: {
                       email: sbUsername.toLowerCase(),
                      },
                    },
        },
        method: 'POST',
        url: API_END_POINTS.searchSb,
      })

      if (searchresponse.data.result.response.count > 0) {
        const userUUId = _.get(
          _.find(searchresponse.data.result.response.content, 'userId'),
          'userId'
        )
        await sendPasswordResetOtp(
          res, userUUId, sbUsername, userType, '>>>>>>>> User Id : ', 'Sending Responses in email : '
        )
        return
      } else {
        logInfo(
          'Couldnot find the user : ',
          searchresponse.data.result.response
        )
        res.status(302).send(searchresponse.data.result.response.count)
      }
    } else if (userType === 'phone') {
      const searchresponse = await axios({
        ...axiosRequestConfig,
        data: {
          request: { query: '', filters: { phone: sbUsername.toLowerCase() } },
        },
        method: 'POST',
        url: API_END_POINTS.searchSb,
      })
      logInfo('Inside phone type checking..')
      if (searchresponse.data.result.response.count > 0) {
        const userUUId = _.get(
          _.find(searchresponse.data.result.response.content, 'userId'),
          'userId'
        )
        await sendPasswordResetOtp(
          res, userUUId, sbUsername, userType, 'User Id : ', 'Sending Responses in phone part : '
        )
        return
      } else {
        logInfo(
          'Couldnot find the user : ',
          searchresponse.data.result.response
        )
        res.status(302).send(searchresponse.data.result.response.count)
      }
    } else {
      logError('Error in Usertype : Neither validated email nor phone ')
      res.status(500).send('Error Ocurred ')
    }
    return
  } catch (err) {
    logError('ERROR in Searching Users : ' + err)
    res.status(500).send({ message : ACCOUNT_RESET_FAIL_MSG, status : 'failed'})
  }
})

forgotPassword.post('/verifyOtp', async (req, res) => {
  const key = req.body.key
  const userType = req.body.type
  const validOtp = req.body.otp
  try {
    if (userType === 'email') {
      logInfo('Entered inside email')
      const searchresponse = await axios({
        ...axiosRequestConfig,
        data: { request: { filters: { email: key.toLowerCase() } } },
        method: 'POST',
        url: API_END_POINTS.searchSb,
      })

      if (searchresponse.data.result.response.count > 0) {
        const userUUId = _.get(
          _.find(searchresponse.data.result.response.content, 'userId'),
          'userId'
        )
        logInfo('User Id in Email : ', userUUId)
        const verifyOtpResponse = await validateOTP(
          userUUId,
          key,
          userType,
          validOtp
        )
        if (verifyOtpResponse.data.result.response === 'SUCCESS') {
          logInfo('opt verify : ')
          const sendResponse = await axios({
            ...axiosRequestConfig,
            data: {
              request: { userId: userUUId, key, type: userType, otp: validOtp },
            },
            headers: { Authorization: CONSTANTS.SB_API_KEY },
            method: 'POST',
            url: API_END_POINTS.recoverPassword,
          })
          logInfo('Success ! Recover password working for email.. ')
          res.status(200).send(sendResponse.data.result)
        } else {
          logInfo('otp verify is not working ')
          res
          .status(400)
          .send('OTP is not valid')
        }

      }
    } else if (userType === 'phone') {
      logInfo('Entered inside email')
      const searchresponse = await axios({
        ...axiosRequestConfig,
        data: { request: { query: '', filters: { phone: key.toLowerCase() } } },
        method: 'POST',
        url: API_END_POINTS.searchSb,
      })
      if (searchresponse.data.result.response.count > 0) {
        const userUUId = _.get(
          _.find(searchresponse.data.result.response.content, 'userId'),
          'userId'
        )
        logInfo('User Id in phone : ', userUUId)
        const verifyOtpResponse = await validateOTP(
          userUUId,
          key,
          userType,
          validOtp
        )
        if (verifyOtpResponse.data.result.response === 'SUCCESS') {
          const sendResponse = await axios({
            ...axiosRequestConfig,
            data: {
              request: { userId: userUUId, key, type: userType, otp: validOtp },
            },
            headers: { Authorization: CONSTANTS.SB_API_KEY },
            method: 'POST',
            url: API_END_POINTS.recoverPassword,
          })
          logInfo('Success ! Recover password working for phone.. ')
          res.status(200).send(sendResponse.data.result)
        } else {
          logInfo('otp verify is not working ')
          res
          .status(400)
          .send('OTP is not valid')
        }

      }
    } else {
      logError('Error in Usertype : Neither validated email nor phone ')
      res
        .status(403)
        .send('Error in Usertype : Neither validated email nor phone')
    }
    return
  } catch (err) {
    logError('ERROR in verifying otp : ' + err)
    res.status(500).send({ message : VERIFY_OTP_FAIL, status : 'failed'})
  }
})

export function emailOrMobile(value: string) {
  const isValidEmail = emailValidator(value)
  if (isValidEmail) {
    return 'email'
  } else {
    const isValidMobile = mobileValidator(value)
    if (isValidMobile) {
      return 'phone'
    }
  }
  return 'error'
}

export function emailValidator(value: string) {
  // tslint:disable-next-line: max-line-length
  return /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/.test(
    value
  )
}

const mobileValidator = (value: string) => {
  return /^([7-9][0-9]{9})$/.test(value)
}
