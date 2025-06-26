/* tslint:disable */
/* tslint:disable:no-console no-any function-length */
import axios from 'axios'
import crypto from 'crypto'
import express, { Response } from 'express'
import jwt_decode from 'jwt-decode'
import _ from 'lodash'
import qs from 'querystring'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { generateRandomPassword } from '../utils/randomPasswordGenerator'
import { getCurrentUserRoles } from './rolePermission'

const AUTH_FAIL = 'Authentication failed ! Please check credentials and try again.'

const API_END_POINTS = {
    createUser: `${CONSTANTS.KONG_API_BASE}/user/v3/create`,
    fetchUserByEmail: `${CONSTANTS.KONG_API_BASE}/user/v1/exists/email/`,
    fetchUserByMobileNo: `${CONSTANTS.KONG_API_BASE}/user/v1/exists/phone/`,
    generateToken: `${CONSTANTS.HTTPS_HOST}/auth/realms/sunbird/protocol/openid-connect/token`,
    profileUpdate: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/private/v1/update`,
    tnnmcUserDetailsUrl: CONSTANTS.TNNMC_USER_DETAILS_URL,
    userRoles: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/private/v1/assign/role`,
    migrateUser: `${CONSTANTS.SB_EXT_API_BASE_2}/user/v1/migrate`,
    assignRole: `${CONSTANTS.HTTPS_HOST}/api/user/private/v1/assign/role`,
    userSearch: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
}

const tnnmcApiKey = CONSTANTS.TNNMC_API_KEY
const tnmcApiSecret = CONSTANTS.TNNMC_API_SECRET
const getUserDesignationFromRole = {
    RANM: 'Registered Auxiliary Nurse Midwife',
    RHV: 'Registered Health Visitor',
    RNM: 'Registered Nurse Midwife',
}
const userOtherText = `User already exist on the Sphere platform. Please log in using your email ID. For any queries, please contact: support@aastrika.org`

function generateSignature(data, secret) {
    return crypto.createHmac('sha256', secret).update(data).digest('hex')
}

export const tnnmcAuth = express.Router()

// Helper: Validate Token and Fetch TNNMC User
const validateTnnmcToken = async (token: string) => {
    const requestTime = new Date().toISOString()
    const verb = 'POST'
    const uri = 'IsValidUser'
    const signature = generateSignature(`${requestTime}${verb}${uri}`, tnmcApiSecret)
    const headers = {
        'Content-Type': 'application/json',
        'Request-Time': requestTime,
        APIKey: tnnmcApiKey,
        Signature: signature,
        'Cache-Control': 'no-cache',
    }
    try {
        const response = await axios.post(API_END_POINTS.tnnmcUserDetailsUrl, { Token: token }, { headers })
        if (response.data.success) return response.data.data
        throw new Error('Invalid token or user not present in TNNMC')
    } catch (error) {
        throw new Error('Error while validating token with TNNMC')
    }
}

// Helper: Create New User
const handleNewUserRegistration = async (tnnmcUserData) => {
    const randomPassword = generateRandomPassword(8, {
        digits: true,
        lowercase: true,
        symbols: true,
        uppercase: true,
    })
    const trimmedName = tnnmcUserData.name.trim()
    const [firstName, ...rest] = trimmedName.split(' ')
    const lastName = rest.length ? rest.join(' ') : firstName

    const responseCreateUser = await axios({
        ...axiosRequestConfig,
        data: {
            request: {
                channel: 'Tamil nadu Nurses & Midwives Council',
                firstName,
                lastName,
                password: randomPassword,
                email: tnnmcUserData.email,
                tcStatus: false,
            },
        },
        headers: { Authorization: CONSTANTS.SB_API_KEY },
        method: 'POST',
        url: API_END_POINTS.createUser,
    })

    await assignRoleToUser(responseCreateUser.data.result.userId)
    await userProfileUpdate(axiosRequestConfig, responseCreateUser.data.result.userId, tnnmcUserData)
}

// Helper: Migrate Existing User
const handleExistingUserMigration = async (existingUser, tnnmcUserData) => {
    const existingUserResult = existingUser.userDetails
    const org = existingUserResult.userDetails.rootOrgName
    if (['aastrika', 'SPhere Team 1'].includes(org)) {
        await migrateUserToTnnmc(existingUser)
        await assignRoleToUser(existingUser.id)
    }

    await userProfileUpdate(axiosRequestConfig, existingUser.userId, tnnmcUserData)
}

// Route: TNNMC Login
// tslint:disable-next-line: no-any

tnnmcAuth.post('/login', async (req: any, res: Response) => {
    try {
        const tnnmcToken = decodeURIComponent(req.body.token)
        const tnnmcUserData = await validateTnnmcToken(tnnmcToken)
        const email = tnnmcUserData.email

        if (!email) {
            return res.status(400).json({ message: 'Email is required for login.', status: 'error' })
        }

        const resultEmail = await fetchUserBymobileorEmail(email, 'email')
        const existingUserResult = await getUserDetails(email)

        if (existingUserResult.message === 'success' && existingUserResult.userDetails) {
            const org = existingUserResult.userDetails.rootOrgName
            if (!['Tamil nadu Nurses & Midwives Council', 'aastrika', 'SPhere Team 1'].includes(org)) {
                return res.status(400).json({ message: userOtherText, status: 'FAILED' })
            }
        }

        if (!resultEmail) {
            await handleNewUserRegistration(tnnmcUserData)
        } else if (existingUserResult.userDetails) {
            await handleExistingUserMigration(existingUserResult, tnnmcUserData)
        }

        const encodedData = qs.stringify({
            client_id: 'TNNMC',
            client_secret: CONSTANTS.KEYCLOAK_CLIENT_SECRET_TNNMC,
            grant_type: 'password',
            scope: 'offline_access',
            username: email,
        })
        const authTokenResponse = await axios({
            ...axiosRequestConfig,
            data: encodedData,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            method: 'POST',
            url: API_END_POINTS.generateToken,
        })
        const accessToken = authTokenResponse.data.access_token
        const decodedToken: any = jwt_decode(accessToken)
        const userId = decodedToken.sub.split(':').pop()
        req.session.userId = userId
        req.kauth = { grant: { access_token: { content: decodedToken, token: accessToken } } }
        req.session.grant = { access_token: { content: decodedToken, token: accessToken } }
        await getCurrentUserRoles(req, accessToken)
        res.status(200).json({ message: 'success' })
    } catch (error) {
        logError('TNNMC login failed: ' + error.message)
        res.status(400).json({ msg: AUTH_FAIL, message: 'error' })
    }
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
const userProfileUpdate = async (axiosRequestConfig, userId, tnnmcUserData) => {
    try {
        const result = await axios({
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
                                email: tnnmcUserData.email,
                                phone: tnnmcUserData.phone,
                                firstname: tnnmcUserData.firstname,
                                surname: tnnmcUserData.surname,
                                regNurseRegMidwifeNumber: tnnmcUserData.tnncno,
                                gender: tnnmcUserData.gender,
                                postalAddress: 'India,Tamil Nadu,Chennai',
                                dob: tnnmcUserData
                            },
                            professionalDetails: [
                                {
                                    profession: "Healthcare Worker",
                                    designation: getUserDesignationFromRole[tnnmcUserData.category],
                                    orgType: "Public/Government Sector",
                                }
                            ],
                            userId: userId,
                        },
                    },
                    userId: userId,
                },
            },
            headers: { Authorization: CONSTANTS.SB_API_KEY },
            method: 'PATCH',
            url: API_END_POINTS.profileUpdate,
        })
        if (result.data.result.response === 'SUCCESS') {
            logInfo('User profile updated successfully')
            return result.data
        }
    } catch (error) {
        logError('Error while updating user profile', JSON.stringify(error))
    }
}
const migrateUserToTnnmc = async (userDetails) => {
    try {
        const migrateUserData = {
            request: {
                channel: 'Tamil nadu Nurses & Midwives Council',
                forceMigration: true,
                notifyMigration: false,
                softDeleteOldOrg: true,
                userId: userDetails.userId,
            },
        }
        const migrateUserResponse = await axios({
            data: migrateUserData,
            headers: {
                'X-Authenticated-User-Token': '',
                authorization: CONSTANTS.SB_API_KEY,
            },
            method: 'PATCH',
            url: API_END_POINTS.migrateUser,
        })

        if (migrateUserResponse.data.result.response == 'success') {
            return true
        }
    } catch (error) {
        logError('Error while migrating user to BNRC org', JSON.stringify(error))
        return false
    }
}

const assignRoleToUser = async (userId: string) => {
    try {
        const userRoleAssignData = {
            request: {
                organisationId: "01432740157737369679",
                roles: ['PUBLIC'],
                userId,
            },
        }
        const roleAssignResponse = await axios({
            data: userRoleAssignData,
            headers: {
                authorization: CONSTANTS.SB_API_KEY,
            },
            method: 'POST',
            url: API_END_POINTS.assignRole,
        })
        if (roleAssignResponse.data.result.response == 'SUCCESS') {
            return roleAssignResponse.data
        }
    } catch (error) {
        logError('Error while assigning user role', JSON.stringify(error))
        return false
    }
}

const getUserDetails = async (email: string) => {
    try {
        const userDetails = await axios({
            data: {
                request: {
                    filters: {
                        email: email,
                    },
                },
            },
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                'Content-Type': 'application/json',
            },
            method: 'POST',
            url: API_END_POINTS.userSearch,
        })
        // tslint:disable-next-line: all
        if (userDetails.data.result.response.content.length > 0) return { message: 'success', userDetails: userDetails.data.result.response.content[0] }
        return { message: 'success', userDetails: '' }
    } catch (error) {
        logError('Error while user search', JSON.stringify(error))
        return { message: 'failed' }
    }

}
