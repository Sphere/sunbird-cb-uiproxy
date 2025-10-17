import axios from 'axios'
import { Router } from 'express'
import jwt_decode from 'jwt-decode'
import _ from 'lodash'
import qs from 'querystring'
import {
  axiosRequestConfig,
  axiosRequestConfigLong,
} from '../configs/request.config'
import { encryptData } from '../utils/emailHashPasswordGenerator'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { getOTP, validateOTP } from './otp'
import { getCurrentUserRoles } from './rolePermission'

const API_END_POINTS = {
  createUserWithMobileNo: `${CONSTANTS.KONG_API_BASE}/user/v3/create`,
  fetchUserByEmail: `${CONSTANTS.KONG_API_BASE}/user/v1/exists/email/`,
  fetchUserByMobileNo: `${CONSTANTS.KONG_API_BASE}/user/v1/exists/phone/`,
  generateOtp: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/otp/v1/generate`,
  grantAccessToken: `${CONSTANTS.HTTPS_HOST}/auth/realms/sunbird/protocol/openid-connect/token`,
  keycloak_redirect_url: `${CONSTANTS.KEYCLOAK_REDIRECT_URL}`,
  msg91ResendOtp: `https://control.msg91.com/api/v5/otp/retry`,
  msg91SendOtp: `https://control.msg91.com/api/v5/otp`,
  msg91VerifyOtp: `https://control.msg91.com/api/v5/otp/verify`,
  profileUpdate: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/private/v1/update`,
  searchSb: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
  userRoles: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/private/v1/assign/role`,
  verifyOtp: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/otp/v1/verify`,
}

const indianCountryCode = '+91'

const msg91Headers = {
  accept: 'application/json',
  authkey: CONSTANTS.MSG_91_AUTH_KEY_SSO,
  'content-type': 'application/json',
}

const VALIDATION_FAIL = 'Please provide correct otp and try again.'
const CREATION_FAIL = 'Sorry ! User not created. Please try again in sometime.'
const OTP_MISSING = 'Otp cannnot be blank'
const AUTH_FAIL =
  'Authentication failed ! Please check credentials and try again.'
const AUTHENTICATED = 'Success ! User is sucessfully authenticated.'

// function decryptData(encryptedData) {
//   const buff = Buffer.from(encryptedData, "base64");
//   const decipher = crypto.createDecipheriv(
//     aesData.ecnryption_method,
//     key,
//     encryptionIV
//   );
//   return (
//     decipher.update(buff.toString("utf8"), "hex", "utf8") +
//     decipher.final("utf8")
//   ); // Decrypts data and converts to utf8
// }
// tslint:disable-next-line: no-any
const createAccount = async (profileData: any) => {
  try {
    const typeOfAccount = profileData.email ? 'email' : 'phone'
    return await axios({
      ...axiosRequestConfig,
      data: {
        request: {
          firstName: profileData.firstName,
          lastName: profileData.lastName,
          password: profileData.password,
          [typeOfAccount]: profileData[typeOfAccount],
        },
      },
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
      },
      method: 'POST',
      url: API_END_POINTS.createUserWithMobileNo,
    })
  } catch (error) {
    logInfo(JSON.stringify(error))
  }
}
const updateRoles = async (userUUId: string, organisationId?: string) => {
  try {
    const orgId = organisationId || '0132317968766894088' // Default org ID
    logInfo('Updating roles for user: ' + userUUId + ' in org: ' + orgId)
    return await axios({
      ...axiosRequestConfigLong,
      data: {
        request: {
          organisationId: orgId,
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
// tslint:disable-next-line: no-any
const profileUpdate = async (profileData: any, userId: any) => {
  try {
    return await axios({
      ...axiosRequestConfig,
      data: {
        request: {
          profileDetails: {
            preferences: {
              language: 'en',
            },
            profileReq: {
              academics: [
                {
                  nameOfInstitute: '',
                  nameOfQualification: '',
                  type: 'GRADUATE',
                  yearOfPassing: '',
                },
              ],
              id: userId,
              personalDetails: {
                dob: profileData.dob || '01/01/2000',
                email: profileData.email,
                firstname: profileData.firstName,
                mobile: profileData.phone,
                phone: profileData.phone,
                postalAddress: `India, ${profileData.state ?? ''}, ${profileData.district ?? ''}`,
                primaryEmail: profileData.email,
                surname: profileData.lastName,
              },
              professionalDetails: [
                {
                  designation: profileData.role || '',
                  name: profileData.channelName || '',
                  orgType: 'Public/Government Sector',
                  profession: 'Healthcare Worker',
                },
              ],
              userId,
            },
          },
          userId,
        },
      },
      headers: { Authorization: CONSTANTS.SB_API_KEY },
      method: 'PATCH',
      url: API_END_POINTS.profileUpdate,
    })
  } catch (error) {
    logInfo(JSON.stringify(error))
  }
}
export const signupWithAutoLoginOrgForm = Router()
signupWithAutoLoginOrgForm.post('/register', async (req, res) => {
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
    logInfo('User Data >>>>>' + userData)
    const { organisationId, role, channelName, state } = userData

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
      channelName,
      email: userEmail,
      firstName,
      lastName,
      organisationId,
      password,
      phone: userPhone,
      role,
      state
    }
    logInfo('Profile Data before creation >>>>>' + profileData)

    const newUserDetail = await createAccount(profileData)
    const userId = newUserDetail?.data.result.userId
    await updateRoles(userId, organisationId)
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
signupWithAutoLoginOrgForm.post('/validateOtpWithLogin', async (req: any, res) => {
  try {
    if (!req.body.otp) {
      res.status(400).json({
        msg: 'OTP is required',
        status: 'success',
      })
    }
    logInfo('Entered into /validateOtp ', req.body)
    const mobileNumber = req.body.phone || ''
    const email = req.body.email || ''
    const validOtp = req.body.otp
    const userUUId = req.body.userId
    const { organisationId } = req.body
    if (!validOtp) {
      res.status(400).send({ message: OTP_MISSING, status: 'error' })
      return
    }
    let userOtpVerified = false
    if (mobileNumber) {
      logInfo('Validate otp for phone', mobileNumber, validOtp)
      const verifyOtpResponse = await axios({
        headers: msg91Headers,
        method: 'GET',
        params: {
          mobile: `${indianCountryCode}${mobileNumber}`,
          otp: validOtp,
        },
        url: API_END_POINTS.msg91VerifyOtp,
      })
      logInfo('validate OTP response phone', JSON.stringify(verifyOtpResponse.data))
      if (verifyOtpResponse.data.type !== 'success') {
        return res.status(400).json({
          message: 'Phone OTP validation failed try again',
        })
      }
      userOtpVerified = true
    }
    if (email) {
      logInfo('Validate otp for email')
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
      logInfo('Otp is verified. Now autologin started.')
      await updateRoles(userUUId, organisationId)
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
            logInfo('Entered into authorization part.' + transformedData)
            const authTokenResponse = await axios({
              ...axiosRequestConfig,
              data: transformedData,
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              method: 'POST',
              url: API_END_POINTS.grantAccessToken,
            })
            logInfo('Entered into authTokenResponsev2 :' + authTokenResponse)
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
              logInfo('Success ! Entered into usertokenResponse..')
              await getCurrentUserRoles(req, accessToken)
              res.status(200).json({
                msg: AUTHENTICATED,
                status: 'success',
              })
              res.end()
            }
          } catch (e) {
            logInfo('Error throwing Cookie inside auth route : ' + e)
            res.status(400).send({
              error: AUTH_FAIL,
              status: 'failed',
            })
          }
        })
      })
    } else {
      res.status(400).json({
        message: 'OTP validation failed',
        status: 'failed',
      })
    }
  } catch (error) {
    res.status(500).send({
      message: VALIDATION_FAIL,
      status: 'failed',
    })
  }
})

const fetchUserBymobileorEmail = async (
  searchValue: string,
  searchType: string
) => {
  logInfo(
    'Checking Fetch Mobile no : ',
    API_END_POINTS.fetchUserByMobileNo + searchValue
  )
  try {
    const response = await axios({
      ...axiosRequestConfig,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
      },
      method: 'GET',
      url:
        searchType === 'email'
          ? API_END_POINTS.fetchUserByEmail + searchValue
          : API_END_POINTS.fetchUserByMobileNo + searchValue,
    })
    logInfo('Response Data in JSON :', JSON.stringify(response.data))
    logInfo('Response Data in Success :', response.data.responseCode)
    if (response.data.responseCode === 'OK') {
      logInfo(
        'Response result.exists :',
        _.get(response, 'data.result.exists')
      )
      return _.get(response, 'data.result.exists')
    }
  } catch (err) {
    logError('fetchUserByMobile  failed')
  }
}
