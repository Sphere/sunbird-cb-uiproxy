import axios from 'axios'
import cassandra from 'cassandra-driver'
import express, { Response } from 'express'
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
    tnaiUserDetailsUrl:
        CONSTANTS.TNAI_USER_DETAILS_URL,
    userRoles: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/private/v1/assign/role`,
}
interface UserDetails {
    firstname: string
    middlename: string | null
    lastname: string
    email: string
    gender: string | null
    phone: string
}

interface TnaiApiResponse {
    status: string
    message: string
    userId: number
    userDetails: UserDetails[]
}
interface AxiosResponse {
    data: TnaiApiResponse
}

export const tnaiAuth = express.Router()
// Endpoint to create TNAI foundation SSO
// tslint:disable-next-line: no-any
tnaiAuth.post('/login', async (req: any, res: Response) => {
    let resRedirectUrl = `${CONSTANTS.HTTPS_HOST}/app/org-details?orgId=TRAINED NURSES' ASSOCIATION OF INDIA (TNAI)`
    logInfo('Entered into tnai route')
    try {
        const tnaiAccessToken = decodeURIComponent(req.body.token)
        const tnaiAccessKey = CONSTANTS.TNAI_ACCESS_KEY
        let userDetailResponseFromTnai: AxiosResponse
        // Validating user details from TNAI endpoints
        try {
            userDetailResponseFromTnai = await axios({
                ...axiosRequestConfig,
                data: {
                    KEY: tnaiAccessKey, TOKEN: tnaiAccessToken,
                },
                headers: {
                    'Content-Type': 'application/json',
                },
                method: 'POST',
                url: API_END_POINTS.tnaiUserDetailsUrl,
            })
            logInfo('User details from TNAI', JSON.stringify(userDetailResponseFromTnai.data))
        } catch (error) {
            return res.status(400).json({
                msg: 'Token invalid or User not present in TNAI',
                status: 'error',
                status_code: 400,
            })
        }

        const tnaiUserData =
            userDetailResponseFromTnai.data.userDetails[0]
        const tnaiUserEmail = tnaiUserData.email
        const tnaiUserPhone = tnaiUserData.phone
        const typeOfLogin = tnaiUserPhone ? 'phone' : 'email'
        logInfo('User details from tnai', JSON.stringify(tnaiUserData))
        const resultEmail = await fetchUserBymobileorEmail(
            tnaiUserEmail,
            'email'
        )
        logInfo(resultEmail, 'resultemail')
        const resultPhone = await fetchUserBymobileorEmail(
            tnaiUserPhone,
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
            logInfo(randomPassword)
            const responseCreateUser = await axios({
                ...axiosRequestConfig,
                data: {
                    request: {
                        channel: 'THE TRAINED NURSES ASSOCIATION OF INDIA (TNAI)',
                        firstName: tnaiUserData.firstname,
                        lastName: tnaiUserData.lastname,
                        password: randomPassword,
                        [typeOfLogin]: tnaiUserData[typeOfLogin],
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
                        organisationId: '01402440090956595232672',
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
                                    firstname: tnaiUserData.firstname,
                                    surname: tnaiUserData.lastname,
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
                '01402440090956595232672',
                'success',
                userDetailResponseFromTnai.data.userId,
                'THE TRAINED NURSES ASSOCIATION OF INDIA (TNAI)',
            ]
            await client.execute(query, params, {
                prepare: true,
            })
        }
        const encodedData = qs.stringify({
            client_id: 'TNAI',
            client_secret: CONSTANTS.KEYCLOAK_CLIENT_SECRET_TNAI,
            grant_type: 'password',
            scope: 'offline_access',
            username: tnaiUserPhone || tnaiUserEmail,
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
        resRedirectUrl = `${CONSTANTS.HTTPS_HOST}/public/home`
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
