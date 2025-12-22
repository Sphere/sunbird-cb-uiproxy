import axios from 'axios'
import cassandra from 'cassandra-driver'
import { Router } from 'express'
import jwt_decode from 'jwt-decode'
import _ from 'lodash'
import qs from 'querystring'
import { v4 as uuidv4 } from 'uuid'
import {
  axiosRequestConfig,
  axiosRequestConfigLong,
} from '../configs/request.config'
import { encryptData } from '../utils/emailHashPasswordGenerator'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { getOTP, validateOTP } from './otp'
import { getCurrentUserRoles } from './rolePermission'

const pgPool = new (require('pg')).Pool({
  connectionTimeoutMillis: 10000,  // 10 seconds to establish connection
  database: CONSTANTS.DATA_LAKE_POSTGRES_DATABASE,
  host: CONSTANTS.DATA_LAKE_POSTGRES_HOST,
  idleTimeoutMillis: 30000,        // 30 seconds idle before closing
  max: 20,                          // Max 20 connections in pool
  password: CONSTANTS.DATA_LAKE_POSTGRES_PASSWORD,
  port: CONSTANTS.DATA_LAKE_POSTGRES_PORT,
  statement_timeout: 30000,         // 30 seconds for query execution
  user: CONSTANTS.DATA_LAKE_POSTGRES_USER,
})

// Add error handling for pool
pgPool.on('error', (error) => {
  logError('Unexpected error on idle client in pool', JSON.stringify(error))
})

pgPool.on('connect', () => {
  logInfo('New PostgreSQL connection established')
})

pgPool.on('remove', () => {
  logInfo('PostgreSQL connection removed from pool')
})

// Type Interfaces
interface ProfileData {
  channelName?: string
  district?: string
  email?: string
  firstName: string
  instituteName?: string
  lastName: string
  organisationId?: string
  password: string
  phone?: string
  role?: string
  state?: string
  dob?: string
  userId?: string
}

interface UserDetails {
  userId: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  organisationId?: string
  channelName?: string
  rootOrgName?: string
  identifier?: string
}

interface UserJourneyStatus {
  createAccount?: string
  isUserMigrated?: boolean
  profileUpdate?: string
  registrationSuccessMessage?: string
  roleAssign?: string
  userAlreadyExists?: boolean
  userExistingOrganisation?: string
  validationStatus?: string
  validationStatusFailedReason?: string
}

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
const SUCCESS_MESSAGE = 'User successfully created'
const VALIDATION_FAIL = 'Please provide correct otp and try again.'
const CREATION_FAIL = 'Sorry ! User not created. Please try again in sometime.'
const OTP_MISSING = 'Otp cannnot be blank'
const AUTH_FAIL =
  'Authentication failed ! Please check credentials and try again.'
const AUTHENTICATED = 'Success ! User is sucessfully authenticated.'

// Cassandra client setup
const { types } = cassandra
// =======================================================
// HELPER FUNCTIONS
// =======================================================

// Create Account
const createAccount = async (profileData: ProfileData) => {
  try {
    logInfo('Creating account with data:', JSON.stringify(profileData))
    const typeOfAccount = profileData.email ? 'email' : 'phone'
    const response = await axios({
      ...axiosRequestConfig,
      data: {
        request: {
          channel: profileData.channelName || 'aastrika',
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
    logInfo('Account created successfully:', JSON.stringify(response.data))
    return response
  } catch (error) {
    logError('Error creating account:', JSON.stringify(error))
    throw error
  }
}

// ✅ FIXED: Assign Roles with proper response checking
// tslint:disable-next-line: no-any
const updateRoles = async (userUUId: string, organisationId?: string) => {
  const orgId = organisationId || '0132317968766894088'
  try {
    logInfo(`Updating roles for user: ${userUUId} in org: ${orgId}`)

    const response = await axios({
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

    logInfo('Role assignment response: ' + JSON.stringify(response.data))

    // FIXED: Check for both possible success responses
    const ok =
      response.data?.responseCode === 'OK' &&
      (response.data?.result?.rolesAssigned ||
        response.data?.result?.response === 'SUCCESS')

    if (ok) {
      logInfo(`Role PUBLIC successfully assigned to user: ${userUUId}`)
      return true
    }

    logError(
      `Role assignment failed for user: ${userUUId} in org: ${orgId}. Response: ${JSON.stringify(
        response.data
      )}`
    )
    return false
  } catch (err: unknown) {
    let errorMessage = ''

    if (typeof err === 'object' && err !== null && 'response' in err) {
      // Likely an AxiosError
      const axiosErr = err as { response?: { data?: unknown }; message?: string }
      errorMessage = JSON.stringify(axiosErr.response?.data || axiosErr.message || axiosErr)
    } else if (err instanceof Error) {
      errorMessage = err.message
    } else {
      errorMessage = JSON.stringify(err)
    }

    logError(`Update roles failed for user: ${userUUId}. Error: ${errorMessage}`)
    return false
  }

}

// Update Profile
const profileUpdate = async (profileData: ProfileData, userId: string): Promise<unknown> => {
  try {
    return await axios({
      ...axiosRequestConfig,
      data: {
        request: {
          profileDetails: {
            preferences: { language: 'en' },
            profileReq: {
              academics: [
                {
                  nameOfInstitute: profileData.instituteName || '',
                  nameOfQualification: '',
                  type: 'GRADUATE',
                  yearOfPassing: '',
                },
              ],
              id: userId,
              personalDetails: {
                // dob: profileData.dob || '01/01/2000',
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
    logError('Error updating profile:', JSON.stringify(error))
    return false
  }
}

// Migrate User
const migrateUserToOrg = async (
  userDetails: UserDetails,
  profileData: ProfileData
): Promise<boolean> => {
  try {
    const migrateData = {
      request: {
        channel: profileData.channelName,
        forceMigration: true,
        notifyMigration: false,
        softDeleteOldOrg: true,
        userId: userDetails.userId,
      },
    }
    logInfo(`Migrating user ${userDetails.userId} to ${profileData.channelName}`)
    const migrateResponse = await axios({
      data: migrateData,
      headers: { Authorization: CONSTANTS.SB_API_KEY },
      method: 'PATCH',
      url: `${CONSTANTS.SB_EXT_API_BASE_2}/user/v1/migrate`,
    })
    if (migrateResponse.data?.result?.response === 'SUCCESS') {
      logInfo(`User ${userDetails.userId} migrated successfully`)
      return true
    }
    logError(`Migration failed: ${JSON.stringify(migrateResponse.data)}`)
    return false
  } catch (error) {
    logError(`Error migrating user ${userDetails.userId}: ${JSON.stringify(error)}`)
    return false
  }
}

// ✅  Audit Trail Logging with better error handling
const updateUserStatusInDatabase = async (
  userDetails: ProfileData,
  userJourneyStatus: UserJourneyStatus
): Promise<void> => {
  try {
    const uniqueId = uuidv4()
    const record = {
      create_account: userJourneyStatus.createAccount || '',
      created_on: new Date(),
      email: userDetails.email || '',
      first_name: userDetails.firstName || '',
      institute_name: userDetails.instituteName || '',
      is_user_migrated: Boolean(userJourneyStatus.isUserMigrated),
      last_name: userDetails.lastName || '',
      organisation_id: userDetails.organisationId || '',
      organisation_name: userDetails.channelName || '',
      phone: String(userDetails.phone || ''),
      profile_update: userJourneyStatus.profileUpdate || '',
      registration_success_message: userJourneyStatus.registrationSuccessMessage || '',
      role_assign: userJourneyStatus.roleAssign || '',
      unique_id: types.Uuid.fromString(uniqueId),
      user_already_exists: Boolean(userJourneyStatus.userAlreadyExists),
      user_existing_organisation: userJourneyStatus.userExistingOrganisation || '',
      user_id: userDetails.userId || '',
      validation_status: userJourneyStatus.validationStatus || 'success',
      validation_status_failed_reason: userJourneyStatus.validationStatusFailedReason || '',
    }

    // Insert into Cassandra
    // const cassandraQuery = `
    //   INSERT INTO sunbird.user_registration_audit (
    //     create_account, created_on, email, first_name, is_user_migrated,
    //     last_name, organisation_id, organisation_name, phone, profile_update,
    //     registration_success_message, role_assign, unique_id, user_already_exists,
    //     user_existing_organisation, validation_status, validation_status_failed_reason
    //   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    // `
    // const params = Object.values(record)
    // await client.execute(cassandraQuery, params, { prepare: true })
    // logInfo('User journey status inserted successfully into Cassandra audit log')

    // Insert into PostgreSQL
    const postgresQuery = `INSERT INTO user_registration_audit (
      create_account, created_on, email, first_name, institute_name, is_user_migrated,
      last_name, organisation_id, organisation_name, phone, profile_update,
      registration_success_message, role_assign, unique_id, user_already_exists,
      user_existing_organisation, user_id, validation_status, validation_status_failed_reason,
      etl_updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
    ON CONFLICT (unique_id) DO NOTHING`

    const postgresParams = [
      record.create_account,
      record.created_on,
      record.email,
      record.first_name,
      record.institute_name,
      String(Boolean(record.is_user_migrated)),
      record.last_name,
      record.organisation_id,
      record.organisation_name,
      record.phone,
      record.profile_update,
      record.registration_success_message,
      record.role_assign,
      uniqueId,
      String(Boolean(record.user_already_exists)),
      record.user_existing_organisation,
      record.user_id,
      record.validation_status,
      record.validation_status_failed_reason,
      new Date(), // etl_updated_at - PostgreSQL will convert to timestamp with timezone
    ]

    const maxRetries = 2
    let retryCount = 0

    while (retryCount < maxRetries) {
      try {
        logInfo(`PostgreSQL insert attempt ${retryCount + 1}/${maxRetries}`, uniqueId)
        await pgPool.query(postgresQuery, postgresParams)
        logInfo('User journey status inserted successfully into PostgreSQL audit log')
        break
      } catch (queryError) {
        retryCount++
        logError(`PostgreSQL insert error (attempt ${retryCount}/${maxRetries})`, JSON.stringify(queryError))

        if (retryCount >= maxRetries) {
          logError('PostgreSQL insert failed after max retries', JSON.stringify(queryError))
          break
        }

        // Wait before retry (1s, 2s)
        const waitTime = retryCount * 1000
        logInfo(`Retrying PostgreSQL insert in ${waitTime}ms`)
        await new Promise((resolve) => setTimeout(resolve, waitTime))
      }
    }
  } catch (error) {
    logError('Error inserting user journey status', JSON.stringify(error))
    // Don't throw - logging failure shouldn't stop registration
  }
}

// =======================================================
// MAIN ROUTES
// =======================================================

export const signupWithAutoLoginOrgForm = Router()

// REGISTER
signupWithAutoLoginOrgForm.post('/register', async (req, res) => {
  try {
    logInfo('Entered into Register >>>>>', req.body.email)
    if (!req.body.email && !req.body.phone) {
      return res.status(400).json({
        msg: 'Email id or phone both can not be empty',
        status: 'error',
        status_code: 400,
      })
    }

    const userData = req.body
    logInfo('User Data >>>>>' + JSON.stringify(userData))
    const { organisationId, role, channelName, state, district, instituteName } = userData

    const firstName = userData.firstName
    const lastName = userData.lastName
    const userEmail = userData.email || ''
    const userPhone = userData.phone || ''
    const password = userData.password || encryptData(userEmail || userPhone)


    const resultEmail = await fetchUserBymobileorEmail(userEmail, 'email')
    const resultPhone = await fetchUserBymobileorEmail(userPhone, 'phone')

    if (resultEmail || resultPhone) {
      // Migration Logic if user already exists
      try {
        const existingUserResponse = await axios({
          ...axiosRequestConfig,
          data: { request: { filters: { phone: userPhone || userEmail } } },
          headers: { Authorization: CONSTANTS.SB_API_KEY },
          method: 'POST',
          url: API_END_POINTS.searchSb,
        })
        const existingUser = existingUserResponse.data.result.response.content[0]
        logInfo('Existing user found: ' + JSON.stringify(existingUser))

        if (
          existingUser &&
          (existingUser.rootOrgName === 'aastrika' ||
            existingUser.rootOrgName === 'SPhere Team 1')
        ) {
          logInfo(`Migrating user ${existingUser.identifier}`)
          // tslint:disable-next-line: no-any
          const migrated = await migrateUserToOrg(existingUser, userData)
          const roleAssign = await updateRoles(existingUser.identifier, organisationId)
          const profileUpdatedData = await profileUpdate(userData, existingUser.identifier)

          const userJourneyStatus = {
            createAccount: 'skipped',
            isUserMigrated: migrated,
            profileUpdate: profileUpdatedData ? 'success' : 'failed',
            registrationSuccessMessage: 'User migrated successfully',
            roleAssign: roleAssign ? 'success' : 'failed',
            userAlreadyExists: true,
            userExistingOrganisation: existingUser.rootOrgName,
            validationStatus: 'success',
            validationStatusFailedReason: '',
          }

          await updateUserStatusInDatabase({ ...userData, userId: existingUser.identifier }, userJourneyStatus)

          return res.status(200).json({
            message: SUCCESS_MESSAGE,
            status: 'success',
            userId: existingUser.identifier,
          })
        }
      } catch (migrationError) {
        logError('Error during migration:', JSON.stringify(migrationError))
      }

      return res.status(400).json({
        msg: 'User already exists',
        status: 'error',
        status_code: 400,
      })
    }

    const profileData = {
      channelName,
      district,
      email: userEmail,
      firstName,
      lastName,
      organisationId,
      password,
      phone: userPhone,
      role,
      state,
      instituteName
    }
    logInfo('Profile Data before creation >>>>>' + JSON.stringify(profileData))

    // FIXED: Better error handling
    let newUserDetail
    try {
      newUserDetail = await createAccount(profileData)
    } catch (error) {
      logError('Account creation failed:', JSON.stringify(error))
      return res.status(500).json({
        message: CREATION_FAIL,
        status: 'failed',
      })
    }

    const userId = newUserDetail?.data?.result?.userId
    if (!userId) {
      logError('No userId returned from account creation')
      return res.status(500).json({
        message: CREATION_FAIL,
        status: 'failed',
      })
    }

    logInfo(`User created successfully with ID: ${userId}`)

    const roleAssigned = await updateRoles(userId, organisationId)
    const profileUpdated = await profileUpdate(profileData, userId)

    await updateUserStatusInDatabase({ ...profileData, userId }, {
      createAccount: 'success',
      isUserMigrated: false,
      profileUpdate: profileUpdated ? 'success' : 'failed',
      registrationSuccessMessage: 'User created successfully',
      roleAssign: roleAssigned ? 'success' : 'failed',
      userAlreadyExists: false,
      userExistingOrganisation: '',
      validationStatus: 'success',
      validationStatusFailedReason: '',
    })

    if (userPhone) {
      try {
        logInfo('VALIDATE_OTP:Autologin send otp through phone', userPhone)
        await axios({
          headers: msg91Headers,
          method: 'POST',
          params: {
            mobile: `${indianCountryCode}${userPhone}`,
            template_id: CONSTANTS.MSG_91_TEMPLATE_ID_SEND_OTP_SSO,
          },
          url: API_END_POINTS.msg91SendOtp,
        })
        return res.status(200).json({
          data: `OTP successfully sent on phone ${userPhone}`,
          message: SUCCESS_MESSAGE,
          status: 200,
          userId,
        })
      } catch (error) {
        logError('VALIDATE_OTP: Error while sending mobile OTP', JSON.stringify(error))
        return res.status(500).send({
          message: `OTP generation fail for phone ${userPhone}`,
          status: 'failed',
        })
      }
    }

    if (userEmail) {
      try {
        logInfo('VALIDATE_OTP: Autologin send otp through email', userEmail)
        await getOTP(userId, userEmail, 'email')
        return res.status(200).json({
          data: `OTP successfully sent on email ${userEmail}`,
          message: SUCCESS_MESSAGE,
          status: 200,
          userId,
        })
      } catch (error) {
        logError('VALIDATE_OTP: Error while sending email OTP', JSON.stringify(error))
        return res.status(500).send({
          message: `OTP generation fail for email ${userEmail}`,
          status: 'failed',
        })
      }
    }
  } catch (error) {
    logError('Error in user creation >>>>>>' + JSON.stringify(error))
    res.status(500).send({
      message: CREATION_FAIL,
      status: 'failed',
    })
  }
})

// VALIDATE OTP + AUTO LOGIN
// tslint:disable-next-line: no-any
signupWithAutoLoginOrgForm.post('/validateOtpWithLogin', async (req: any, res) => {
  try {
    if (!req.body.otp) {
      return res.status(400).json({
        msg: 'OTP is required',
        status: 'error',
      })
    }

    logInfo('VALIDATE_OTP:Entered into /validateOtp ', JSON.stringify(req.body))
    const mobileNumber = req.body.phone || ''
    const email = req.body.email || ''
    const validOtp = req.body.otp
    const userUUId = req.body.userId
    const { organisationId } = req.body

    if (!validOtp) {
      return res.status(400).send({ message: OTP_MISSING, status: 'error' })
    }

    let userOtpVerified = false

    if (mobileNumber) {
      logInfo('VALIDATE_OTP: for phone', mobileNumber, validOtp)
      try {
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
        if (verifyOtpResponse.data.type === 'success') {
          userOtpVerified = true
        } else {
          return res.status(400).json({
            message: 'Phone OTP validation failed try again',
          })
        }
      } catch (error) {
        logError('Phone OTP error:', JSON.stringify(error))
        return res.status(400).json({
          message: 'Phone OTP validation failed',
        })
      }
    }

    if (email && !userOtpVerified) {
      logInfo('VALIDATE_OTP: for email')
      try {
        const verifyOtpResponse = await validateOTP(
          userUUId,
          email,
          'email',
          validOtp
        )
        if (verifyOtpResponse.data.result.response === 'SUCCESS') {
          userOtpVerified = true
        } else {
          return res.status(400).json({
            message: 'Email OTP validation failed try again',
          })
        }
      } catch (error) {
        logError('Email OTP error:', JSON.stringify(error))
        return res.status(400).json({
          message: 'Email OTP validation failed',
        })
      }
    }

    if (userOtpVerified) {
      logInfo('Otp is verified. Now autologin started.')
      await updateRoles(userUUId, organisationId)
      res.clearCookie('connect.sid')
      req.session.user = null
      req.session.save(async () => {
        req.session.regenerate(async () => {
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
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              method: 'POST',
              url: API_END_POINTS.grantAccessToken,
            })
            if (authTokenResponse.data?.access_token) {
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
            logError('Error throwing Cookie inside auth route : ' + JSON.stringify(e))
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
    logError('Validation error:', JSON.stringify(error))
    res.status(500).send({
      message: VALIDATION_FAIL,
      status: 'failed',
    })
  }
})

// FETCH USER BY EMAIL / PHONE
const fetchUserBymobileorEmail = async (searchValue: string, searchType: string) => {
  logInfo(
    'Checking Fetch Mobile no : ',
    API_END_POINTS.fetchUserByMobileNo + searchValue
  )
  try {
    const response = await axios({
      ...axiosRequestConfig,
      headers: { Authorization: CONSTANTS.SB_API_KEY },
      method: 'GET',
      url:
        searchType === 'email'
          ? API_END_POINTS.fetchUserByEmail + searchValue
          : API_END_POINTS.fetchUserByMobileNo + searchValue,
    })
    logInfo('Response Data in JSON :', JSON.stringify(response.data))
    logInfo('Response Data in Success :', response.data.responseCode)
    if (response.data.responseCode === 'OK') {
      return _.get(response, 'data.result.exists')
    }
  } catch (err) {
    logError('fetchUserByMobile failed')
    return false
  }
}
