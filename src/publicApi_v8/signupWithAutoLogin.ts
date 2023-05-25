import axios from 'axios'
import crypto from 'crypto'
import { Router } from 'express'
import jwt_decode from 'jwt-decode'
import _ from 'lodash'
import qs from 'querystring'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { getOTP, validateOTP } from './otp'
import { getCurrentUserRoles } from './rolePermission'

const aesData = {
  encryption_method: CONSTANTS.AES_ENCRYPTION_METHOD,
  encryption_secret: CONSTANTS.AES_ENCRYPTION_SECRET,
  secret_iv: CONSTANTS.AES_SECRET_IV,
  secret_key: CONSTANTS.AES_SECRET_KEY,
}

// Generate secret hash with crypto to use for encryption
const key = crypto
  .createHash('sha512')
  .update(aesData.secret_key)
  .digest('hex')
  .substring(0, 32)
const encryptionIV = crypto
  .createHash('sha512')
  .update(aesData.secret_iv)
  .digest('hex')
  .substring(0, 16)

const API_END_POINTS = {
  createUserWithMobileNo: `${CONSTANTS.KONG_API_BASE}/user/v3/create`,
  fetchUserByEmail: `${CONSTANTS.KONG_API_BASE}/user/v1/exists/email/`,
  fetchUserByMobileNo: `${CONSTANTS.KONG_API_BASE}/user/v1/exists/phone/`,
  generateOtp: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/otp/v1/generate`,
  grantAccessToken: `${CONSTANTS.HTTPS_HOST}/auth/realms/sunbird/protocol/openid-connect/token`,
  keycloak_redirect_url: `${CONSTANTS.KEYCLOAK_REDIRECT_URL}`,
  profileUpdate: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/private/v1/update`,
  searchSb: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
  userRoles: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/private/v1/assign/role`,
  verifyOtp: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/otp/v1/verify`,
}

const VALIDATION_FAIL = 'Please provide correct otp and try again.'
const CREATION_FAIL = 'Sorry ! User not created. Please try again in sometime.'
const OTP_MISSING = 'Otp cannnot be blank'
const AUTH_FAIL =
  'Authentication failed ! Please check credentials and try again.'
const AUTHENTICATED = 'Success ! User is sucessfully authenticated.'

function encryptData(data) {
  const cipher = crypto.createCipheriv(
    aesData.encryption_method,
    key,
    encryptionIV
  )
  return Buffer.from(
    cipher.update(data, 'utf8', 'hex') + cipher.final('hex')
  ).toString('base64') // Encrypts data and converts to hex and base64
}

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
              id: userId,
              personalDetails: {
                firstname: profileData.firstName,
                surname: profileData.lastName,
              },
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
    try {
      await getOTP(
        userId,
        userEmail ? userEmail : userPhone,
        userEmail ? 'email' : 'phone'
      )
      res.status(200).json({
        message: 'User successfully created',
        userId,
      })
    } catch (error) {
      res.status(500).send({
        message: 'OTP generation fail',
        status: 'failed',
      })
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
signupWithAutoLogin.post('/validateOtpWithLogin', async (req: any, res) => {
  try {
    if (!req.body.otp) {
      res.status(400).json({
        msg: 'OTP is required',
        status: 'success',
      })
    }
    if (req.body.phone || req.body.email) {
      logInfo('Entered into /validateOtp ', req.body)
      const mobileNumber = req.body.phone
      const email = req.body.email
      const validOtp = req.body.otp
      const userUUId = req.body.userUUId || req.body.userUUID
      const password = encryptData(email || mobileNumber)
      if (!validOtp) {
        res.status(400).send({ message: OTP_MISSING, status: 'error' })
        return
      }
      const verifyOtpResponse = await validateOTP(
        userUUId,
        mobileNumber ? mobileNumber : email,
        email ? 'email' : 'phone',
        validOtp
      )
      if (verifyOtpResponse.data.result.response === 'SUCCESS') {
        logInfo('Otp is verified. Now autologin started.')
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
      }
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
