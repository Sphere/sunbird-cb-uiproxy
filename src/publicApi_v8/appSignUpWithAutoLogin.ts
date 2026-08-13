import axios from 'axios'
import { Router } from 'express'
import qs from 'querystring'
import { axiosRequestConfig } from '../configs/request.config'
import {
  API_END_POINTS,
  INDIAN_COUNTRY_CODE as indianCountryCode,
  MSG91_HEADERS as msg91Headers,
} from '../utils/autoLoginSignupConstants'
import { encryptData } from '../utils/emailHashPasswordGenerator'
import { CONSTANTS } from '../utils/env'
import { fetchUserBymobileorEmail } from '../utils/fetchUserExists'
import { logInfo } from '../utils/logger'
import { createAccount, profileUpdate, updateRoles } from '../utils/signupAccountHelpers'
import { validateOTP } from './otp'
// sonar-cleanup: OTP-dispatch tail replaced with the shared import (CHANGE 33)
import { sendRegistrationOtp } from './signupOtpDispatch'

const VALIDATION_FAIL = 'Please provide correct otp and try again.'
const CREATION_FAIL = 'Sorry ! User not created. Please try again in sometime.'

export const appSignUpWithAutoLogin = Router()
appSignUpWithAutoLogin.post('/register', async (req, res) => {
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
    await sendRegistrationOtp(res, userPhone, userEmail, userId, { userUUId: userId })
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
appSignUpWithAutoLogin.post('/validateOtpWithLogin', async (req: any, res) => {
  try {
    if (!req.body.otp) {
      return res.status(400).json({
        msg: 'OTP is required',
        status: 'success',
      })
    }
    logInfo('Entered into /validateOtp ', req.body)
    const mobileNumber = req.body.mobileNumber || ''
    const email = req.body.email || ''
    const validOtp = req.body.otp
    const userUUId = req.body.userId || req.body.userUUID

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
      logInfo('VALIDATE_OTP: for email', email, validOtp)
      const verifyOtpResponse = await validateOTP(
        userUUId,
        email,
        'email',
        validOtp
      )
      if (verifyOtpResponse.data.result.response !== 'SUCCESS') {
        return res.status(400).json({
          message: 'Email OTP validation failed try again',
        })
      }
      userOtpVerified = true
    }
    if (userOtpVerified) {
      logInfo('VALIDATE_OTP: OTP validated')
      await updateRoles(userUUId)
      try {
        const transformedData = qs.stringify({
          client_id: 'aastrika-sso-login',
          client_secret: CONSTANTS.APP_SSO_KEYCLOAK_SECRET,
          grant_type: 'password',
          scope: 'offline_access',
          username: mobileNumber ? mobileNumber : email,
        })
        logInfo('VALIDATE_OTP:Entered into authorization part.' + transformedData)
        const authTokenResponse = await axios({
          ...axiosRequestConfig,
          data: transformedData,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          method: 'POST',
          url: API_END_POINTS.grantAccessToken,
        })
        authTokenResponse.data.status = 200
        res.status(200).json(authTokenResponse.data)
      } catch (error) {
        res.status(401).send({
          message: 'Keycloak failed',
        })
      }
    }
  } catch (error) {
    logInfo('VALIDATE_OTP: in validate otp >>>>>>' + error)
    res.status(500).send({
      message: VALIDATION_FAIL,
      status: 'failed',
    })
  }
})
