import axios from 'axios'
import { Router } from 'express'
import jwt_decode from 'jwt-decode'
import qs from 'querystring'
import { axiosRequestConfig } from '../configs/request.config'
import { API_END_POINTS } from '../utils/autoLoginSignupConstants'
import { encryptData } from '../utils/emailHashPasswordGenerator'
import { CONSTANTS } from '../utils/env'
import { fetchUserBymobileorEmail } from '../utils/fetchUserExists'
import { logError, logInfo } from '../utils/logger'
import { createAccount, profileUpdate } from '../utils/signupAccountHelpers'
import { getCurrentUserRoles } from './rolePermission'
// sonar-cleanup: OTP-dispatch/verify tails replaced with the shared import (CHANGE 33)
import { sendRegistrationOtp, verifyRegistrationOtp } from './signupOtpDispatch'

const VALIDATION_FAIL = 'Please provide correct otp and try again.'
const CREATION_FAIL = 'Sorry ! User not created. Please try again in sometime.'
const OTP_MISSING = 'Otp cannnot be blank'
const AUTH_FAIL =
  'Authentication failed ! Please check credentials and try again.'
const AUTHENTICATED = 'Success ! User is sucessfully authenticated.'

const updateRoles = async (userUUId: string) => {
  try {
    return await axios({
      ...axiosRequestConfig,
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
export const signupWithAutoLogin = Router()
signupWithAutoLogin.post('/register', async (req, res) => {
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
    const password = encryptData(userEmail || userPhone)
    const resultEmail = await fetchUserBymobileorEmail(userEmail, 'email')
    logInfo(resultEmail, 'resultemail')
    const resultPhone = await fetchUserBymobileorEmail(userPhone, 'phone')
    logInfo(resultPhone, 'resutPhone')
    if (resultEmail || resultPhone) {
      res.status(400).json({
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
    await profileUpdate(profileData, userId)
    await sendRegistrationOtp(res, userPhone, userEmail, userId)
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
signupWithAutoLogin.post('/validateOtpWithLogin', async (req: any, res) => {
  try {
    if (!req.body.otp) {
      res.status(400).json({
        msg: 'OTP is required',
        status: 'success',
      })
    }
    if (req.body.phone || req.body.email) {
      logInfo('VALIDATE_OTP: Entered into /validateOtp ', JSON.stringify(req.body))
      const mobileNumber = req.body.phone
      const email = req.body.email
      const validOtp = req.body.otp
      const userUUId = req.body.userUUId || req.body.userUUID
      const password = encryptData(email || mobileNumber)
      if (!validOtp) {
        res.status(400).send({ message: OTP_MISSING, status: 'error' })
        return
      }
      const userOtpVerified = await verifyRegistrationOtp(res, mobileNumber, email, userUUId, validOtp)
      if (userOtpVerified === undefined) return
      if (userOtpVerified) {
        logInfo('VALIDATE_OTP: Otp is verified. Now autologin started.')
        await updateRoles(userUUId)
        res.clearCookie('connect.sid')
        req.session.user = null
        // tslint:disable-next-line: no-any
        req.session.save(async () => {
          req.session.regenerate(async () => {
            // A new session and cookie will be generated from here. Keycloak activated.
            try {
              const transformedData = qs.stringify({
                client_id: 'portal',
                grant_type: 'password',
                password,
                username: mobileNumber || email,
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
                logInfo('VALIDATE_OTP:Success ! Entered into usertokenResponse..')
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
      }
    }
  } catch (error) {
    logInfo('VALIDATE_OTP:Error in validate otp >>>>>>' + JSON.stringify(error))
    res.status(500).send({
      message: VALIDATION_FAIL,
      status: 'failed',
    })
  }
})
