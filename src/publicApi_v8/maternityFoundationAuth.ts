import axios from 'axios'
import express from 'express'
import jwt_decode from 'jwt-decode'
import _ from 'lodash'
import qs from 'querystring'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { generateRandomPassword } from '../utils/randomPasswordGenerator'
import { getCurrentUserRoles } from './rolePermission'

const AUTH_FAIL =
  'Authentication failed ! Please check credentials and try again.'
const API_END_POINTS = {
  createUser: `${CONSTANTS.KONG_API_BASE}/user/v3/create`,
  fetchUserByEmail: `${CONSTANTS.KONG_API_BASE}/user/v1/exists/email/`,
  fetchUserByMobileNo: `${CONSTANTS.KONG_API_BASE}/user/v1/exists/phone/`,
  generateToken: `${CONSTANTS.HTTPS_HOST}/auth/realms/sunbird/protocol/openid-connect/token`,
  maternityFoundationUserDetailsUrl:
    CONSTANTS.MATERNITY_FOUNDATION_USER_DETAILS_URL,
  profileUpdate: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/private/v1/update`,
  userRoles: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/private/v1/assign/role`,
}
export const maternityFoundationAuth = express.Router()
// tslint:disable-next-line: no-any
maternityFoundationAuth.post('/login', async (req: any, res) => {
  logInfo('Entered into maternity foundation route', JSON.stringify(req.body))
  const courseId = req.body.moduleId
  const host = req.get('host')
  let resRedirectUrl = `https://sphere.aastrika.org/app/toc/${courseId}/overview?primaryCategory=Course`
  try {
    const maternityFoundationToken = {
      accessToken: decodeURIComponent(req.body.token),
    }
    let userDetailResponseFromMaternityFoundation
    try {
      userDetailResponseFromMaternityFoundation = await axios({
        ...axiosRequestConfig,
        data: maternityFoundationToken,
        headers: {
          'Ocp-Apim-Subscription-Key':
            CONSTANTS.MATERNITY_FOUNDATION_ACCESS_KEY,
        },
        method: 'POST',
        url: API_END_POINTS.maternityFoundationUserDetailsUrl,
      })
      logInfo("Data from Maternity foundation", JSON.stringify(userDetailResponseFromMaternityFoundation.data))
    } catch (error) {
      return res.status(400).json({
        msg: 'Token invalid or User not present in maternity foundation',
        status: 'error',
        status_code: 400,
      })
    }

    const maternityFoundationData =
      userDetailResponseFromMaternityFoundation.data
    const maternityFoundationEmail = maternityFoundationData.email
    const maternityFoundationPhone = maternityFoundationData.phone.slice(3)
    const typeOfLogin = maternityFoundationData.phone ? 'phone' : 'email'

    logInfo('User details from maternity foundation', maternityFoundationData)

    if (!maternityFoundationData) {
      res.status(400).json({
        msg: 'User not present in maternity foundation',
        status: 'error',
        status_code: 400,
      })
      logInfo('User details not present in maternity foundation')
    }
    const resultEmail = await fetchUserBymobileorEmail(
      maternityFoundationEmail,
      'email'
    )
    logInfo(resultEmail, 'resultEmail')
    const resultPhone = await fetchUserBymobileorEmail(
      maternityFoundationPhone,
      'phone'
    )
    logInfo(resultPhone, 'resultPhone')

    logInfo('User details sunbird', resultEmail)
    if (!resultEmail && !resultPhone) {
      const randomPassword = generateRandomPassword(8, {
        digits: true,
        lowercase: true,
        symbols: true,
        uppercase: true,
      })

      const responseCreateUser = await axios({
        ...axiosRequestConfig,
        data: {
          request: {
            channel: 'Maternity Foundation',
            firstName: maternityFoundationData.firstName,
            lastName: maternityFoundationData.lastName,
            password: randomPassword,
            [typeOfLogin]: maternityFoundationData[typeOfLogin],
            tcStatus: false,
          },
        },
        headers: {
          Authorization: CONSTANTS.SB_API_KEY,
        },
        method: 'POST',
        url: API_END_POINTS.createUser,
      })
      logInfo('Response after user creation', responseCreateUser.data)
      const userRoleUpdate = await axios({
        ...axiosRequestConfig,
        data: {
          request: {
            organisationId: '0139026512304373761757',
            roles: ['PUBLIC'],
            userId: responseCreateUser.data.result.userId,
          },
        },
        headers: { Authorization: CONSTANTS.SB_API_KEY },
        method: 'POST',
        url: API_END_POINTS.userRoles,
      })
      logInfo('Data after role update', userRoleUpdate.data)
      const userProfileUpdate = await axios({
        ...axiosRequestConfig,
        data: {
          request: {
            profileDetails: {
              profileReq: {
                id: responseCreateUser.data.result.userId,
                personalDetails: {
                  dob: '01-01-2000',
                  firstname: maternityFoundationData.firstName,
                  surname: maternityFoundationData.lastName,
                },
                userId: responseCreateUser.data.result.userId,
              },
            },
            userId: responseCreateUser.data.result.userId,
          },
        },
        headers: { Authorization: CONSTANTS.SB_API_KEY },
        method: 'PATCH',
        url: API_END_POINTS.profileUpdate,
      })
      logInfo('Data after profile update', userProfileUpdate.data)
    }
    const encodedData = qs.stringify({
      client_id: 'Maternity-Foundation',
      client_secret: CONSTANTS.KEYCLOAK_CLIENT_SECRET_MATERNITY_FOUNDATION,
      grant_type: 'password',
      scope: 'offline_access',
      username: maternityFoundationPhone || maternityFoundationEmail,
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
    if (authTokenResponse.data) {
      const accessToken = authTokenResponse.data.access_token
      // tslint:disable-next-line: no-any
      const decodedToken: any = jwt_decode(accessToken)
      const decodedTokenArray = decodedToken.sub.split(':')
      const userId = decodedTokenArray[decodedTokenArray.length - 1]
      req.session.userId = userId
      logInfo(userId, 'userid......................')
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
    } else {
      res.status(302).json({
        msg: AUTH_FAIL,
        status: 'error',
      })
    }
  } catch (err) {
    logError('Failed to process callback API.. error: ' + JSON.stringify(err))
    resRedirectUrl = `https://${host}/public/home`
  }
  logInfo(resRedirectUrl, 'redirectUrl')
  res.status(200).json({
    message: 'success',
    resRedirectUrl,
  })
})

const fetchUserBymobileorEmail = async (
  searchValue: string,
  searchType: string
) => {
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
