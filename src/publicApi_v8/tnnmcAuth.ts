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

const AUTH_FAIL =
    'Authentication failed ! Please check credentials and try again.'
const API_END_POINTS = {
    createUser: `${CONSTANTS.KONG_API_BASE}/user/v3/create`,
    fetchUserByEmail: `${CONSTANTS.KONG_API_BASE}/user/v1/exists/email/`,
    fetchUserByMobileNo: `${CONSTANTS.KONG_API_BASE}/user/v1/exists/phone/`,
    generateToken: `${CONSTANTS.HTTPS_HOST}/auth/realms/sunbird/protocol/openid-connect/token`,
    profileUpdate: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/private/v1/update`,
    tnnmcUserDetailsUrl:
        CONSTANTS.TNNMC_USER_DETAILS_URL,
    userRoles: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/private/v1/assign/role`,
}

const tnnmcApiKey = CONSTANTS.TNNMC_API_KEY
const tnmcApiSecret = CONSTANTS.TNNMC_API_SECRET
const getUserDesignationFromRole = {
    "RANM": "Registered Auxiliary Nurse Midwife",
    "RHV": "Registered Health Visitor",
    "RNM": "Registered Nurse Midwife"
}
// Signature generation function
function generateSignature(data, secret) {
    return crypto
        .createHmac('sha256', secret)
        .update(data)
        .digest('hex')
}
export const tnnmcAuth = express.Router()
// Endpoint to create TNAI foundation SSO
// tslint:disable-next-line: no-any
tnnmcAuth.post('/login', async (req: any, res: Response) => {
    logInfo('Entered into tnnmc route')
    try {
        const tnnmcAccessToken = decodeURIComponent(req.body.token)
        const requestTime = new Date().toISOString() // ISO 8601 UTC
        const verb = 'POST'
        const uri = 'IsValidUser' // Used for signature generation only
        const stringToSign = `${requestTime}${verb}${uri}`
        const signature = generateSignature(stringToSign, tnmcApiSecret)
        logInfo('Signature generated:', signature)
        logInfo('Request Time:', requestTime)
        const headers = {
            'Content-Type': 'application/json',
            'Request-Time': requestTime,
            APIKey: tnnmcApiKey,
            Signature: signature,
            'Cache-Control': 'no-cache',
        }
        const body = {
            Token: tnnmcAccessToken,
        }
        let userDetailResponseFromTnnmc
        // Validating user details from TNNMC endpoints
        try {
            userDetailResponseFromTnnmc = await axios.post(
                API_END_POINTS.tnnmcUserDetailsUrl,
                body,
                { headers }
            )
            logInfo('User details from TNNMC', JSON.stringify(userDetailResponseFromTnnmc.data))
            if (userDetailResponseFromTnnmc.data.success != true) {
                return res.status(400).json({
                    msg: 'Token invalid or User not present in TNNMC',
                    status: 'error',
                    status_code: 400,
                })
            }
        } catch (error) {
            logInfo('Error details from TNNMC', JSON.stringify(error))
            return res.status(400).json({
                msg: 'Issued occured while fetching user details from TNNMC',
                status: 'error',
                status_code: 400,
            })
        }

        const tnnmcUserData =
            userDetailResponseFromTnnmc.data.data
        const tnnmcUserEmail = tnnmcUserData.email || ''
        const tnnmcUserPhone = tnnmcUserData.mobile || ''
        logInfo('tnnmcuseremail', tnnmcUserEmail, 'tnnmcuserphone', tnnmcUserPhone)
        const typeOfLogin = tnnmcUserEmail ? 'email' : 'phone'
        const tnnmcLoginType = tnnmcUserEmail ? 'email' : 'mobile'
        logInfo(
            'Type of login and tnnmcLoginType',
            typeOfLogin,
            tnnmcLoginType
        )
        logInfo('User details from tnai', JSON.stringify(tnnmcUserData))
        const resultEmail = await fetchUserBymobileorEmail(
            tnnmcUserEmail,
            'email'
        )
        logInfo(resultEmail, 'resultemail')
        const resultPhone = await fetchUserBymobileorEmail(
            tnnmcUserPhone,
            'phone'
        )
        logInfo(resultPhone, 'resultPhone')
        if (!resultEmail && !resultPhone) {
            logInfo("User doesn't exists user creation process begins")
            const randomPassword = generateRandomPassword(8, {
                digits: true,
                lowercase: true,
                symbols: true,
                uppercase: true,
            })
            const trimmedName = tnnmcUserData.name.trim()
            const parts = trimmedName.split(' ')
            let firstName: string, lastName: string

            if (parts.length > 1) {
                firstName = parts[0]
                lastName = parts.slice(1).join(' ') // Handles middle names too
            } else {
                firstName = lastName = trimmedName
            }
            logInfo('First Name:', firstName, 'Last Name:', lastName)
            const responseCreateUser = await axios({
                ...axiosRequestConfig,
                data: {
                    request: {
                        channel: 'Tamil nadu Nurses & Midwives Council',
                        firstName,
                        lastName,
                        password: randomPassword,
                        [typeOfLogin]: tnnmcUserData[tnnmcLoginType],
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
                        organisationId: '01432740157737369679',
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
                                id: responseCreateUser.data.result.userId,
                                personalDetails: {
                                    email: tnnmcUserEmail,
                                    phone: tnnmcUserPhone,
                                    firstname: firstName,
                                    surname: lastName,
                                    regNurseRegMidwifeNumber: tnnmcUserData.tnncno,
                                    gender: tnnmcUserData.gender,
                                    postalAddress: 'India,Tamil Nadu,Chennai',
                                    dob: "01/01/2000"
                                },
                                professionalDetails: [
                                    {
                                        profession: "Healthcare Worker",
                                        designation: getUserDesignationFromRole[tnnmcUserData.category],
                                        orgType: "Public/Government Sector",
                                    }
                                ],
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
            client_id: 'TNNMC',
            client_secret: CONSTANTS.KEYCLOAK_CLIENT_SECRET_TNNMC,
            grant_type: 'password',
            scope: 'offline_access',
            username: tnnmcUserEmail || tnnmcUserPhone,
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
        return res.status(400).json({
            msg: AUTH_FAIL,
            message: 'error',
        })
    }
    res.status(200).json({
        message: 'success',
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
