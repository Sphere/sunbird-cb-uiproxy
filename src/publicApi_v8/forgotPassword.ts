import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import {  validateOTP } from './otp'
import { API_END_POINTS } from './apiConstants'

const PASSWORD_RESET_FAIL = 'Sorry ! There is some issue in resetting your account. Please contact admin.'
const VERIFY_OTP_FAIL = 'Sorry ! There is some issue in verifying your account. Please try after sometime.'

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
        const userUUId = _.get(
          _.find(searchresponse.data.result.response.content, 'userId'),
          'userId'
        )
        logInfo('User Id : ', userUUId)

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
        logInfo('Sending Responses in phone part : ' + sendResponse)
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
