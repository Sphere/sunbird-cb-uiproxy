import axios from 'axios'
import { Router } from 'express'
import { Request, Response } from 'express'
import jwt_decode from 'jwt-decode'
import _ from 'lodash'
import qs from 'querystring'
import {
  axiosRequestConfig,
  axiosRequestConfigLong,
} from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { fetchUserBymobileorEmail } from '../utils/fetchUserExists'
import { logError, logInfo } from '../utils/logger'
import { generateRandomPassword } from '../utils/randomPasswordGenerator'
import { getOTP, validateOTP } from './otp'
import { getCurrentUserRoles } from './rolePermission'

const API_END_POINTS = {
  createUserWithMobileNo: `${CONSTANTS.KONG_API_BASE}/user/v3/create`,
  fetchUserByEmail: `${CONSTANTS.KONG_API_BASE}/user/v1/exists/email/`,
  fetchUserByMobileNo: `${CONSTANTS.KONG_API_BASE}/user/v1/exists/phone/`,
  generateOtp: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/otp/v1/generate`,
  generateToken: `${CONSTANTS.HTTPS_HOST}/auth/realms/sunbird/protocol/openid-connect/token`,
  keycloak_redirect_url: `${CONSTANTS.KEYCLOAK_REDIRECT_URL}`,
  msg91ResendOtp: `https://control.msg91.com/api/v5/otp/retry`,

  searchSb: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
  searchUser: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,

  userRoles: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/private/v1/assign/role`,
  verifyOtp: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/otp/v1/verify`,
}
const indianCountryCode = '+91'

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'
const VALIDATION_FAIL = 'Please provide correct otp and try again.'
const CREATION_FAIL = 'Sorry ! User not created. Please try again in sometime.'
const VALIDATION_SUCCESS = 'Otp is successfully validated.'
const OTP_MISSING = 'Otp cannnot be blank'
const EMAIL_OR_MOBILE_ERROR_MSG = 'Mobile no. or Email Id can not be empty'
const AUTH_FAIL =
  'Authentication failed ! Please check credentials and try again.'
const AUTHENTICATED = 'Success ! User is sucessfully authenticated.'
const USER_NOT_CREATED = 'User does not exist please signup and login again'

export const emailOrMobileLogin = Router()
emailOrMobileLogin.post('/signup', async (req, res) => {
  try {
    logInfo('Entered into signup >>>>>', req.body.email)
    if (!req.body.email) {
      res.status(400).json({
        msg: 'Email id. can not be empty',
        status: 'error',
        status_code: 400,
      })
    }
    const { firstName, email, lastName } = req.body
    // tslint:disable-next-line: no-any
    let profile: any = {}
    let isUserExist = {}
    let password = req.body.password

    // tslint:disable-next-line: no-any
    let newUserDetails: any = {}
    logInfo('Req body', req.body)
    isUserExist = await fetchUserBymobileorEmail(email, 'email')
    if (!isUserExist) {
      logInfo('creating new  user')
      // tslint:disable-next-line: no-any
      if (!password) {
        password = generateRandomPassword(8, {
          digits: true,
          lowercase: true,
          symbols: true,
          uppercase: true,
        })
      }
      profile = {
        emailId: email,
        fname: firstName,
        lname: lastName,
        psw: password,
        type: 'email',
      }
      logInfo('Checking profile data ' + profile)
      newUserDetails = await createuserWithmobileOrEmail(profile).catch(
        handleCreateUserError
      )
      if (newUserDetails) {
        const userUUId = newUserDetails.result.userId
        const response = await getOTP(userUUId, email, 'email')
        // tslint:disable-next-line: no-console
        console.log('response form getOTP : ' + response)
        if (response.data.result.response === 'SUCCESS') {
          await updateRoles(userUUId)
          res.status(200).json({
            msg: 'user created successfully',
            status: 'success',
            status_code: 200,
            userUUId: newUserDetails.result.userId,
          })
        }
      } else {
        logInfo('Email already exists.')
        res.status(400).json({
          msg: 'Email id  already exists.',
          status: 'error',
          status_code: 400,
        })
        return
      }
    } else {
      logInfo('Email already exists.')
      res.status(400).json({
        msg: 'Email id  already exists.',
        status: 'error',
        status_code: 400,
      })
      return
    }
  } catch (error) {
    logInfo('Error in user creation >>>>>>' + error)
    res.status(500).send({
      message: CREATION_FAIL,
      status: 'failed',
    })
  }
})
const getUserDetails = async (userEmail: string, userPhone: string) => {
  const typeOfAccount = userEmail ? 'email' : 'phone'
  return axios({
      ...axiosRequestConfig,
      data: {
          request: {
              filters: {
                  [typeOfAccount]: typeOfAccount == 'email' ? userEmail : userPhone,
              },
          },
      },
      method: 'POST',
      url: API_END_POINTS.searchUser,
  })

}
const msg91Headers = {
  accept: 'application/json',
  authkey: CONSTANTS.MSG_91_AUTH_KEY_SSO,
  'content-type': 'application/json',
}
// generate otp for  register's user
emailOrMobileLogin.post('/generateOtp', async (req, res) => {
  try {
    const userPhone = req.body.mobileNumber || req.body.phone || ''
    let userEmail = req.body.email || ''
    userEmail = userEmail.toLowerCase()
    logInfo('SSO login resend OTP route request body', req.body)
    if (!userPhone && !userEmail) {
      return res.status(400).json({
        message: 'Mandatory parameters email/phone missing',
      })
    }
    const userDetails = await getUserDetails(userEmail, userPhone)
    if (userDetails.data.result.response.count <= 0) {
      logInfo("SSO re-sendotp: User doesn't exists please signup and try again")
      return res.status(400).json({
        msg: "User Doesn't exists please signup and try again",
        status: 'error',
      })
    }
    const userId = userDetails.data.result.response.content[0].id
    // User OTP send through MSG91 for phone
    if (userPhone) {
      try {
        logInfo('SSO Resend OTP through phone', userPhone)
        await axios({
          headers: msg91Headers,
          params: {
            mobile: `${indianCountryCode}${userPhone}`,
            retrytype: 'text',
          },

          method: 'POST',
          url: API_END_POINTS.msg91ResendOtp,
        })
        return res.status(200).json({
          message: `OTP successfully re-sent on phone ${userPhone}`,
          status: 200,
          userId,
        })
      } catch (error) {
        return res.status(500).send({
          message: `OTP generation fail for phone ${userPhone}`,
          status: 'failed',
        })
      }

    }
    // User otp send through learner service for email users
    if (userEmail) {
      try {
        logInfo('SSO Resend OTP through email', userEmail)
        await getOTP(
          userId,
          userEmail,
          'email'
        )
        res.status(200).json({
          message: `OTP successfully re-sent on email ${userEmail}`,
          status: 200,
          userId,
        })
      } catch (error) {
        res.status(500).send({
          message: `OTP generation fail for email ${userEmail}`,
          status: 'failed',
        })
      }
    }
  } catch (error) {
    res.status(500).send({
      message: 'OTP regeneration failed',
    })
  }
})
// tslint:disable-next-line: no-any
const validateRequestBody = (req: Request, res: Response, next: any) => {
  if (!req.body.otp) {
    res.status(400).json({
      msg: 'OTP. can not be empty',
      status: 'error',
      status_code: 400,
    })
  }

  next()
}

// validate  otp for  register's the user
emailOrMobileLogin.post(
  '/validateOtp',
  validateRequestBody,
  async (req, res) => {
    try {
      if (req.body.mobileNumber || req.body.email) {
        logInfo('Entered into /validateOtp ', req.body)
        const mobileNumber = req.body.mobileNumber
        const email = req.body.email
        const validOtp = req.body.otp
        const userUUId = req.body.userUUId || req.body.userUUID
        await updateRoles(userUUId)
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
        res.status(200).send({ message: VALIDATION_SUCCESS, status: 200 })
        logInfo('Sending Responses in phone part : ' + verifyOtpResponse)
      } else {
        res.status(400).json({
          msg: EMAIL_OR_MOBILE_ERROR_MSG,
          status: 'error',
          status_code: 400,
        })
      }
    } catch (error) {
      res.status(500).send({
        message: VALIDATION_FAIL,
        status: 'failed',
      })
    }
  }
)
emailOrMobileLogin.post('/registerUserWithMobile', async (req, res) => {
  try {
    if (!req.body.phone) {
      res.status(400).json({
        msg: EMAIL_OR_MOBILE_ERROR_MSG,
        status: 'error',
        status_code: 400,
      })
    }
    const { firstName, phone, lastName } = req.body
    // tslint:disable-next-line: no-any
    let profile: any = {}
    let isUserExist = {}
    // tslint:disable-next-line: no-any
    let newUserDetails: any = {}
    let password = req.body.password
    logInfo('Req body', req.body)
    isUserExist = await fetchUserBymobileorEmail(phone, 'phone')
    if (!isUserExist) {
      logInfo('creating new  user')
      if (!password) {
        password = generateRandomPassword(8, {
          digits: true,
          lowercase: true,
          symbols: true,
          uppercase: true,
        })
      }
      profile = {
        fname: firstName,
        lname: lastName,
        mobile: phone,
        psw: password,
        type: 'phone',
      }
      newUserDetails = await createuserWithmobileOrEmail(profile).catch(
        handleCreateUserError
      )
      if (newUserDetails) {
        const userUUId = newUserDetails.result.userId
        await updateRoles(userUUId)
        const response = await getOTP(userUUId, phone, 'phone')
        // tslint:disable-next-line: no-console
        console.log('response form getOTP : ' + response)
        if (response.data.result.response === 'SUCCESS') {
          res.status(200).json({
            msg: 'user created successfully',
            status: 'success',
            status_code: 200,
            userUUId: newUserDetails.result.userId,
          })
        }
        logInfo('Sending Responses in phone part : ' + newUserDetails)
      }
    } else {
      logInfo('Mobile no. already exists.')
      res.status(400).json({
        msg: 'Mobile no.  already exists.',
        status: 'error',
        status_code: 400,
      })
      return
    }
  } catch (error) {
    res.status(500).send({
      error: GENERAL_ERROR_MSG,
    })
  }
})

// tslint:disable-next-line: no-any
const handleCreateUserError = (error: any) => {
  logInfo('Error ocurred while creating user' + error)
  if (_.get(error, 'error.params')) {
    throw error.error.params
  } else if (error instanceof Error) {
    throw error.message
  } else {
    throw new Error('unhandled exception while getting userDetails')
  }
}
// tslint:disable-next-line: no-any

// tslint:disable-next-line: no-any
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
// tslint:disable-next-line: no-any
const createuserWithmobileOrEmail = async (accountDetails: any) => {
  if (!accountDetails.fname || accountDetails.fname === '') {
    throw new Error('USER_NAME_NOT_PRESENT')
  }

  try {
    const response = await axios({
      ...axiosRequestConfig,
      data: {
        request: {
          firstName: accountDetails.fname,
          lastName: accountDetails.lname,
          password: accountDetails.psw,
          [accountDetails.type]: accountDetails.mobile
            ? accountDetails.mobile
            : accountDetails.emailId,
        },
      },
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
      },
      method: 'POST',
      url: API_END_POINTS.createUserWithMobileNo,
    })
    if (response.data.responseCode === 'OK') {
      logInfo('Log of createuser if OK :')
      return response.data
    } else {
      throw new Error(
        _.get(response.data, 'params.errmsg') ||
        _.get(response.data, 'params.err')
      )
    }
  } catch (err) {
    logError('createuserwithmobile failed')
  }
}

// login endpoint for public users
// tslint:disable-next-line: no-any
emailOrMobileLogin.post('/auth', async (req: any, res, next) => {
  req.session.user = null
  // tslint:disable-next-line: no-any
  req.session.save(async (err: any) => {
    if (err) next(err)
    req.session.regenerate(async () => {
      // will have a new session here
      try {
        if (req.body.mobileNumber || req.body.email) {
          logInfo('Entered into /login/auth endpoint >>> ')
          const mobileNumber = req.body.mobileNumber
          const email = req.body.email
          let password = req.body.password
          if (!password) {
            password = generateRandomPassword(8, {
              digits: true,
              lowercase: true,
              symbols: true,
              uppercase: true,
            })
          }
          const username = mobileNumber ? mobileNumber : email
          const isEmailUserExist = await fetchUserBymobileorEmail(
            email,
            'email'
          )
          const isMobileUserExist = await fetchUserBymobileorEmail(
            mobileNumber,
            'phone'
          )
          if (!isEmailUserExist && !isMobileUserExist) {
            res.status(400).json({
              msg: USER_NOT_CREATED,
              status: 'error',
            })
            return
          }
          logInfo('Step i : mobileNumber response value :->' + mobileNumber)
          logInfo('Step ii : email response value :->' + email)
          logInfo('Step iii : password response value :->' + password)

          try {
            const encodedData = qs.stringify({
              client_id: 'portal',
              // client_secret: `${CONSTANTS.KEYCLOAK_CLIENT_SECRET}`,
              grant_type: 'password',
              password,
              username,
            })
            logInfo('Entered into authorization part.' + encodedData)

            const authTokenResponse = await axios({
              ...axiosRequestConfig,
              data: encodedData,
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              method: 'POST',
              url: API_END_POINTS.generateToken,
            })

            logInfo('Entered into authTokenResponse :' + authTokenResponse)

            if (authTokenResponse.data) {
              const accessToken = authTokenResponse.data.access_token
              // tslint:disable-next-line: no-any
              const decodedToken: any = jwt_decode(accessToken)
              const decodedTokenArray = decodedToken.sub.split(':')
              const userId = decodedTokenArray[decodedTokenArray.length - 1]
              req.session.userId = userId
              req.kauth = {
                grant: {
                  access_token: { content: decodedToken, token: accessToken },
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
            } else {
              res.status(302).json({
                msg: AUTH_FAIL,
                status: 'error',
              })
            }
          } catch (e) {
            logInfo('Error throwing Cookie inside auth route : ' + e)
            res.status(400).send({
              error: AUTH_FAIL,
            })
          }
        } else if (!req.body.mobileNumber || !req.body.email) {
          res.status(400).json({
            msg: EMAIL_OR_MOBILE_ERROR_MSG,
            status: 'error',
            status_code: 400,
          })
        }
      } catch (error) {
        logInfo('error' + error)
        res.status(500).send({
          error: GENERAL_ERROR_MSG,
        })
      }
    })
  })
})
// tslint:disable-next-line: no-any
emailOrMobileLogin.post('/authv2/*', async (req: any, res, next) => {
  req.session.user = null
  // tslint:disable-next-line: no-any
  req.session.save(async (err: any) => {
    if (err) next(err)
    req.session.regenerate(async () => {
      // will have a new session here
      try {
        logInfo('Entered into /login/authv2 endpoint >>> ')

        try {
          const code = req.query.code

          logInfo('Valdating Code >>> ', code)
          logInfo('Redirect URI:>>>>', API_END_POINTS.keycloak_redirect_url)

          const transformedData = qs.stringify({
            client_id: 'portal',
            code,
            grant_type: 'authorization_code',
            redirect_uri: API_END_POINTS.keycloak_redirect_url,
          })
          logInfo('Entered into authorization part.' + transformedData)
          const authTokenResponse = await axios({
            ...axiosRequestConfig,
            data: transformedData,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            method: 'POST',
            url: API_END_POINTS.generateToken,
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
                access_token: { content: decodedToken, token: accessToken },
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
          } else {
            res.status(302).json({
              msg: AUTH_FAIL,
              status: 'error',
            })
          }
        } catch (e) {
          logInfo('Error throwing Cookie inside auth route : ' + e)

          res.status(400).send({
            error: AUTH_FAIL,
          })
        }
      } catch (error) {
        logInfo('error' + error)

        res.status(500).send({
          error: GENERAL_ERROR_MSG,
        })
      }
    })
  })
})
