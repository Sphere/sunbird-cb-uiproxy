import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { API_END_POINTS } from './apiConstants'
import {  validateOTP } from './otp'

const PASSWORD_RESET_FAIL = 'Sorry ! There is some issue in resetting your account. Please contact admin.'
const VERIFY_OTP_FAIL = 'Sorry ! There is some issue in verifying your account. Please try after sometime.'

const indianCountryCode = '+91'
const msg91Headers = {
  accept: 'application/json',
  authkey: CONSTANTS.MSG_91_AUTH_KEY_SSO,
  'content-type': 'application/json',
}

/**
 * Phone OTP for forgot-password normally goes through lern (/otp/v1/generate and
 * /otp/v1/verify). On Sunbird Spark that path is unusable: lern's image ships a
 * mismatched sunbird-notification jar, so sendOTPViaSMS throws NoSuchMethodError on
 * SMSFactory.getInstance(), which kills the ActorSystem - no SMS is delivered and the
 * whole service is down for ~60s while it restarts.
 *
 * MSG91 is already the OTP provider for phone login (ssoLogin), so these two helpers
 * reuse that route. The password reset call itself is untouched: it does not
 * re-validate the OTP, which means the proxy is the only gate - verification must stay
 * mandatory before reset.
 *
 * Gated on FORGOT_PASSWORD_OTP_VIA_MSG91 so production keeps using lern. Remove both
 * helpers and the flag once the lern image is rebuilt.
 */
/**
 * MSG91 matches the OTP against the exact mobile string it was sent to, and the two
 * callers do not agree: the send path posts `userName` (trimmed by the UI) while the
 * verify path posts `key` (not trimmed). Normalising both to digits here means a
 * stray space or dash cannot make a correct OTP fail verification.
 */
function toMsg91Mobile(userPhone: string): string {
  return `${indianCountryCode}${userPhone.replace(/[^0-9]/g, '')}`
}

async function sendOtpViaMsg91(userPhone: string) {
  return axios({
    headers: msg91Headers,
    method: 'POST',
    params: {
      mobile: toMsg91Mobile(userPhone),
      template_id: CONSTANTS.MSG_91_TEMPLATE_ID_SEND_OTP_SSO,
    },
    url: API_END_POINTS.msg91SendOtp,
  })
}

async function isMsg91OtpValid(userPhone: string, otp: string): Promise<boolean> {
  const verifyResponse = await axios({
    headers: msg91Headers,
    method: 'GET',
    params: {
      mobile: toMsg91Mobile(userPhone),
      otp,
    },
    url: API_END_POINTS.msg91VerifyOtp,
  })
  logInfo('MSG91 verify response : ' + JSON.stringify(verifyResponse.data))
  return verifyResponse.data.type === 'success'
}

/**
 * `/private/user/v1/search` returns each user with `identifier` and `id`, and no `userId`
 * field at all - so `_.find(content, 'userId')` never matched and every caller below sent
 * `userId: undefined`. lern dropped the key, ResetPasswordActor called getUserById(null),
 * and the password reset hung with no error on either side. The OTP send path shares this
 * extraction but survived it, because generateOtp does not need a resolved user.
 */
interface ISearchUser {
  id?: string
  identifier?: string
  userId?: string
}

function extractUserId(searchresponse: unknown): string | undefined {
  const content: ISearchUser[] = _.get(searchresponse, 'data.result.response.content', [])
  const match = _.find(content, (entry: ISearchUser) =>
    Boolean(entry && (entry.userId || entry.identifier || entry.id))
  )
  return match ? match.userId || match.identifier || match.id : undefined
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
        const userUUId = extractUserId(searchresponse)
        logInfo('>>>>>>>> User Id : ', userUUId)

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
        logInfo('Sending Responses in email : ' + sendResponse)
        // res.status(200).send(userUUId)
        res.status(200).send({ message: 'Success ! Please verify the OTP .' })
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
        const userUUId = extractUserId(searchresponse)
        logInfo('User Id : ', userUUId)

        // generate otp
        if (CONSTANTS.FORGOT_PASSWORD_OTP_VIA_MSG91) {
          const msg91Response = await sendOtpViaMsg91(sbUsername)
          logInfo('Sent phone OTP via MSG91 : ' + JSON.stringify(msg91Response.data))
        } else {
          const sendResponse = await axios({
            ...axiosRequestConfig,
            data: {
              request: { userId: userUUId, key: sbUsername, type: userType },
            },
            headers: { Authorization: CONSTANTS.SB_API_KEY },
            method: 'POST',
            url: API_END_POINTS.generateOtp,
          })
          logInfo('Sending Responses in phone part : ' + sendResponse)
        }
        res.status(200).send({ message: 'Success ! Please verify the OTP .' })
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
    res.status(500).send({ message : PASSWORD_RESET_FAIL, status : 'failed'})
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
        const userUUId = extractUserId(searchresponse)
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
        const userUUId = extractUserId(searchresponse)
        logInfo('User Id in phone : ', userUUId)
        // The reset call below does NOT re-validate the OTP, so this check is the
        // only thing standing between a phone number and a password reset link.
        // Whichever provider issued the OTP must verify it here.
        const isOtpValid = CONSTANTS.FORGOT_PASSWORD_OTP_VIA_MSG91
          ? await isMsg91OtpValid(key, validOtp)
          : (await validateOTP(userUUId, key, userType, validOtp)).data.result
              .response === 'SUCCESS'
        if (isOtpValid) {
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
