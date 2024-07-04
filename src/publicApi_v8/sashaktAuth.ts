import axios from 'axios'
import cassandra from 'cassandra-driver'
import express from 'express'
import jwt_decode from 'jwt-decode'
import _ from 'lodash'
import qs from 'querystring'
import { v4 as uuidv4 } from 'uuid'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { generateRandomPassword } from '../utils/randomPasswordGenerator'
import { getCurrentUserRoles } from './rolePermission'

const client = new cassandra.Client({
  contactPoints: [CONSTANTS.CASSANDRA_IP],
  keyspace: 'sunbird',
  localDataCenter: 'datacenter1',
})

const AUTH_FAIL =
  'Authentication failed ! Please check credentials and try again.'
const API_END_POINTS = {
  createUser: `${CONSTANTS.KONG_API_BASE}/user/v3/create`,
  fetchUserByEmail: `${CONSTANTS.KONG_API_BASE}/user/v1/exists/email/`,
  fetchUserByMobileNo: `${CONSTANTS.KONG_API_BASE}/user/v1/exists/phone/`,
  generateToken: `${CONSTANTS.HTTPS_HOST}/auth/realms/sunbird/protocol/openid-connect/token`,
  profileUpdate: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/private/v1/update`,
  sashaktUserDetailsUrl: `${CONSTANTS.SASHAKT_USER_DETAILS_URL}`,
  searchSb: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
  userRoles: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/private/v1/assign/role`,
}
export const sashakt = express.Router()
// tslint:disable-next-line: no-any
sashakt.get('/login', async (req: any, res) => {
  logInfo('Entered into sashakt route')
  const courseId = req.query.moduleId
  const host = req.get('host')
  let resRedirectUrl = `https://sphere.aastrika.org/app/toc/${courseId}/overview?primaryCategory=Course&org=nhsrc`
  try {
    const sashaktToken = 'Bearer ' + req.query.token
    const userDetailResponseFromShashakt = await axios({
      ...axiosRequestConfig,
      headers: {
        Authorization: sashaktToken,
      },
      method: 'POST',
      url: API_END_POINTS.sashaktUserDetailsUrl,
    })
    const sashaktData = userDetailResponseFromShashakt.data.userDetails[0]
    const sashaktEmail = sashaktData.email || ''
    const sashaktPhone = sashaktData.phone || ''
    const typeOfLogin = sashaktData.phone ? 'phone' : 'email'

    logInfo('User details from shashakt', sashaktData)

    if (!sashaktData) {
      res.status(400).json({
        msg: 'User not present in sashakt',
        status: 'error',
        status_code: 400,
      })
      logInfo('User details not present in e shashakt')
    }
    const resultEmail = await fetchUserBymobileorEmail(sashaktEmail, 'email')
    logInfo(resultEmail, 'resultemail')
    const resultPhone = await fetchUserBymobileorEmail(sashaktPhone, 'phone')
    logInfo(resultPhone, 'resultPhone')
    if (resultEmail || resultPhone) {
      const isMandatoryFieldsPresentInUserProfile = await checkMandatoryUserProfileDetails(sashaktEmail, sashaktPhone)
      if (!isMandatoryFieldsPresentInUserProfile) {
        logInfo('Something went wrong while checking Sashakt user profile details', JSON.stringify(sashaktData))
      }
    }
    logInfo('User details sunbird', resultEmail)
    if (!resultEmail && !resultPhone) {
      const randomPassword = generateRandomPassword(8, {
        digits: true,
        lowercase: true,
        symbols: true,
        uppercase: true,
      })

      logInfo(randomPassword)
      const responseCreateUser = await axios({
        ...axiosRequestConfig,
        data: {
          request: {
            channel: 'ShashaktOrg',
            firstName: sashaktData.firstname,
            lastName: sashaktData.lastname,
            password: randomPassword,
            [typeOfLogin]: sashaktData[typeOfLogin],
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
            organisationId: '0136856524313067523939',
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
                academics: [
                  {
                    nameOfInstitute: '',
                    nameOfQualification: '',
                    type: 'GRADUATE',
                    yearOfPassing: '',
                  },
                ],
                id: responseCreateUser.data.result.userId,
                personalDetails: {
                  dob: '01-01-2000',
                  firstname: sashaktData.firstname,
                  surname: sashaktData.lastname,
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
      const uniqueSSOuserId = uuidv4()
      const query =
        // tslint:disable-next-line: max-line-length
        'INSERT INTO sunbird.user_sso_bulkupload_v2 ( id, code, mainuseruuid, orgid, status, shashaktUserId, provider) VALUES ( ?, ?, ?, ?, ?, ?, ? )'

      const params = [
        uniqueSSOuserId,
        'ASHAs',
        responseCreateUser.data.result.userId,
        '0136856524313067523939',
        'success',
        userDetailResponseFromShashakt.data.userId,
        'SHASHAKT',
      ]
      await client.execute(query, params, {
        prepare: true,
      })

    }

    const encodedData = qs.stringify({
      client_id: 'eShashakt',
      client_secret: `${CONSTANTS.KEYCLOAK_CLIENT_SECRET_SASHAKT}`,
      grant_type: 'password',
      scope: 'offline_access',
      username: sashaktPhone || sashaktEmail,
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
    resRedirectUrl = `https://${host}/public/home?org=nhsrc`
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
const checkMandatoryUserProfileDetails = async (email, phone) => {
  try {
    logInfo('Inside check mandatory function')
    const filterType = email ? 'email' : 'phone'
    const contactInfo = filterType === 'email' ? email : phone
    logInfo(filterType, contactInfo)
    const userDetails = await axios({
      ...axiosRequestConfig,
      data: {
        request: {
          filters: {
            [filterType]: contactInfo,
          },
        },
      },
      method: 'POST',
      url: API_END_POINTS.searchSb,
    })
    const userProfileDetails = userDetails.data.result.response.content[0].profileDetails
    logInfo('User profile details sahskat inside check', JSON.stringify(userProfileDetails))
    if (!userProfileDetails.profileReq.academics) {
      userProfileDetails.profileReq.academics = [
        {
          nameOfInstitute: '',
          nameOfQualification: '',
          type: 'GRADUATE',
          yearOfPassing: '',
        },
      ]
      await axios({
        ...axiosRequestConfig,
        data: {
          request: {
            profileDetails: userProfileDetails,
            userId: userDetails.data.result.response.content.id,
          },
        },
        headers: { Authorization: CONSTANTS.SB_API_KEY },
        method: 'PATCH',
        url: API_END_POINTS.profileUpdate,
      })
      return true
    }
  } catch (error) {
    return false
  }

}
