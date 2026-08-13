import axios from 'axios'
import cassandra from 'cassandra-driver'
import express from 'express'
import { v4 as uuidv4 } from 'uuid'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
// sonar-cleanup: local fetchUserBymobileorEmail (byte-identical to the shared helper) replaced with the shared import (CHANGE 29)
import { fetchUserBymobileorEmail } from '../utils/fetchUserExists'
import { logError, logInfo } from '../utils/logger'
import { generateRandomPassword } from '../utils/randomPasswordGenerator'
// sonar-cleanup: local Keycloak token-exchange block replaced with the shared import (CHANGE 31)
import { exchangeSsoKeycloakToken } from './ssoKeycloakExchange'

const client = new cassandra.Client({
  contactPoints: [CONSTANTS.CASSANDRA_IP],
  keyspace: 'sunbird',
  localDataCenter: 'datacenter1',
})

const AUTH_FAIL =
  'Authentication failed ! Please check credentials and try again.'
const API_END_POINTS = {
  createUser: `${CONSTANTS.KONG_API_BASE}/user/v3/create`,
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

    const accessToken = await exchangeSsoKeycloakToken(
      req,
      'eShashakt',
      `${CONSTANTS.KEYCLOAK_CLIENT_SECRET_SASHAKT}`,
      sashaktPhone || sashaktEmail
    )
    if (!accessToken) {
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

const checkMandatoryUserProfileDetails = async (email, phone) => {
  try {
    logInfo('Inside check mandatory function')
    const filterType = phone ? 'phone' : 'email'
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
            userId: userDetails.data.result.response.content[0].id,
          },
        },
        headers: { Authorization: CONSTANTS.SB_API_KEY },
        method: 'PATCH',
        url: API_END_POINTS.profileUpdate,
      })
      return true
    }
  } catch (error) {
    logInfo(JSON.stringify(error))
    return false
  }

}
