import axios from 'axios'
import { Router } from 'express'
import jwt_decode from 'jwt-decode'
import qs from 'querystring'
import {
  axiosRequestConfig,
  axiosRequestConfigLong,
} from '../configs/request.config'
import {
  API_END_POINTS,
  INDIAN_COUNTRY_CODE as indianCountryCode,
  MSG91_HEADERS as msg91Headers,
} from '../utils/autoLoginSignupConstants'
import { encryptData } from '../utils/emailHashPasswordGenerator'
import { CONSTANTS } from '../utils/env'
import { fetchUserBymobileorEmail } from '../utils/fetchUserExists'
import { logError, logInfo } from '../utils/logger'
import { createAccount, profileUpdate } from '../utils/signupAccountHelpers'
import { getOTP, validateOTP } from './otp'
import { getCurrentUserRoles } from './rolePermission'

const VALIDATION_FAIL = 'Please provide correct otp and try again.'
const CREATION_FAIL = 'Sorry ! User not created. Please try again in sometime.'
const OTP_MISSING = 'Otp cannnot be blank'
const AUTH_FAIL =
  'Authentication failed ! Please check credentials and try again.'
const AUTHENTICATED = 'Success ! User is sucessfully authenticated.'

const updateRoles = async (userUUId: string) => {
  try {
    return await axios({
      ...axiosRequestConfigLong,
      data: {
        request: {
          organisationId: '0132317968766894088',
          roles: ['PUBLIC'],
          userId: userUUId,
        },
      },
      headers: { Authorization: CONSTANTS.SB_API_KEY },
      method: 'POST',
      url: API_END_POINTS.userRoles,
    })
  } catch (err) {
    logError('update roles failed ' + err)
    return 'false'
  }
}
export const signupWithAutoLoginV2 = Router()
signupWithAutoLoginV2.post('/register', async (req, res) => {
  try {
    logInfo('Entered into Register >>>>>', req.body.email)
    if (!req.body.email && !req.body.phone) {
      res.status(400).json({
        msg: 'Email id or phone both can not be empty',
        status: 'error',
        status_code: 400,
      })
    }
    const userData = req.body
    const firstName = userData.firstName
    const lastName = userData.lastName
    const userEmail = userData.email || ''
    const userPhone = userData.phone || ''
    const password = userData.password || encryptData(userEmail || userPhone)
    const resultEmail = await fetchUserBymobileorEmail(userEmail, 'email')
    logInfo(resultEmail, 'resultemail')
    const resultPhone = await fetchUserBymobileorEmail(userPhone, 'phone')
    logInfo(resultPhone, 'resutPhone')
    if (resultEmail || resultPhone) {
      return res.status(400).json({
        msg: 'User already exists',
        status: 'error',
        status_code: 400,
      })
    }
    const profileData = {
      email: userEmail,
      firstName,
      lastName,
      password,
      phone: userPhone,
    }
    const newUserDetail = await createAccount(profileData)
    const userId = newUserDetail.data.result.userId
    await updateRoles(userId)
    await profileUpdate(profileData, userId)
    if (userPhone) {
      try {
        logInfo('Autologin send otp through phone', userPhone)
        await axios({
          headers: msg91Headers,
          params: {
            mobile: `${indianCountryCode}${userPhone}`,
            template_id: CONSTANTS.MSG_91_TEMPLATE_ID_SEND_OTP_SSO,
          },

          method: 'POST',
          url: API_END_POINTS.msg91SendOtp,
        })
        return res.status(200).json({
          data: `OTP successfully sent on email ${userPhone}`,
          message: 'User successfully created',
          status: 200,
          userId,
        })
      } catch (error) {
        logError('Error while sending mobile OTP', JSON.stringify(error))
        return res.status(500).send({
          message: `OTP generation fail for phone ${userPhone}`,
          status: 'failed',
        })
      }

    }
    if (userEmail) {
      try {
        logInfo('Autologin send otp through email', userEmail)
        await getOTP(
          userId,
          userEmail,
          'email'
        )
        res.status(200).json({
          data: `OTP successfully sent on email ${userEmail}`,
          message: 'User successfully created',
          status: 200,
          userId,
        })
      } catch (error) {
        logError('Error while sending email OTP', JSON.stringify(error))
        res.status(500).send({
          message: `OTP generation fail for email ${userEmail}`,
          status: 'failed',
        })
      }
    }
  } catch (error) {
    logInfo('Error in user creation >>>>>>' + error)
    res.status(500).send({
      message: CREATION_FAIL,
      status: 'failed',
    })
  }
})

// validate  otp for  register's the user
// tslint:disable-next-line: no-any
signupWithAutoLoginV2.post('/validateOtpWithLogin', async (req: any, res) => {
  try {
    if (!req.body.otp) {
      res.status(400).json({
        msg: 'OTP is required',
        status: 'success',
      })
    }
    logInfo('Entered into VALIDATE_OTP: ', JSON.stringify(req.body))
    const mobileNumber = req.body.phone || ''
    const email = req.body.email || ''
    const validOtp = req.body.otp
    const userUUId = req.body.userId
    if (!validOtp) {
      res.status(400).send({ message: OTP_MISSING, status: 'error' })
      return
    }
    let userOtpVerified = false
    if (mobileNumber) {
      logInfo('VALIDATE_OTP: for phone', mobileNumber, validOtp)
      const verifyOtpResponse = await axios({
        headers: msg91Headers,
        method: 'GET',
        params: {
          mobile: `${indianCountryCode}${mobileNumber}`,
          otp: validOtp,
        },
        url: API_END_POINTS.msg91VerifyOtp,
      })
      logInfo('VALIDATE_OTP: response phone', JSON.stringify(verifyOtpResponse.data))
      if (verifyOtpResponse.data.type !== 'success') {
        return res.status(400).json({
          message: 'Phone OTP validation failed try again',
        })
      }
      userOtpVerified = true
    }
    if (email) {
      logInfo('VALIDATE_OTP: for email')
      const verifyOtpResponse = await validateOTP(
        userUUId,
        email,
        'email',
        validOtp
      )
      logInfo('VALIDATE_OTP: response email', JSON.stringify(verifyOtpResponse.data))
      if (verifyOtpResponse.data.result.response !== 'SUCCESS') {
        return res.status(400).json({
          message: 'Email OTP validation failed try again',
        })
      }
      userOtpVerified = true
    }
    if (userOtpVerified) {
      logInfo('VALIDATE_OTP: Otp is verified. Now autologin started.')
      await updateRoles(userUUId)
      res.clearCookie('connect.sid')
      req.session.user = null
      // tslint:disable-next-line: no-any
      req.session.save(async () => {
        req.session.regenerate(async () => {
          // A new session and cookie will be generated from here
          try {
            const transformedData = qs.stringify({
              client_id: 'aastrika-sso-login',
              client_secret: CONSTANTS.APP_SSO_KEYCLOAK_SECRET,
              grant_type: 'password',
              scope: 'offline_access',
              username: mobileNumber ? mobileNumber : email,
            })
            logInfo('VALIDATE_OTP:Entered into authorization part.' + JSON.stringify(transformedData))
            const authTokenResponse = await axios({
              ...axiosRequestConfig,
              data: transformedData,
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              method: 'POST',
              url: API_END_POINTS.grantAccessToken,
            })
            logInfo('VALIDATE_OTP:Entered into authTokenResponsev2 :' + JSON.stringify(authTokenResponse.data))
            if (authTokenResponse.data) {
              const accessToken = authTokenResponse.data.access_token
              // tslint:disable-next-line: no-any
              const decodedToken: any = jwt_decode(accessToken)
              const decodedTokenArray = decodedToken.sub.split(':')
              const userId = decodedTokenArray[decodedTokenArray.length - 1]
              req.session.userId = userId
              req.kauth = {
                grant: {
                  access_token: {
                    content: decodedToken,
                    token: accessToken,
                  },
                },
              }
              req.session.grant = {
                access_token: { content: decodedToken, token: accessToken },
              }
              logInfo('VALIDATE_OTP:  Success ! Entered into usertokenResponse..')
              await getCurrentUserRoles(req, accessToken)
              res.status(200).json({
                msg: AUTHENTICATED,
                status: 'success',
              })
              res.end()
            }
          } catch (e) {
            logInfo('VALIDATE_OTP:Error throwing Cookie inside auth route : ' + e)
            res.status(400).send({
              error: AUTH_FAIL,
              status: 'failed',
            })
          }
        })
      })
    } else {
      logInfo('VALIDATE_OTP: OTP validation failed')
      res.status(400).json({
        message: 'OTP validation failed',
        status: 'failed',
      })
    }
  } catch (error) {
    logInfo('VALIDATE_OTP:Error in validate otp >>>>>>' + JSON.stringify(error))
    res.status(500).send({
      message: VALIDATION_FAIL,
      status: 'failed',
    })
  }
})
