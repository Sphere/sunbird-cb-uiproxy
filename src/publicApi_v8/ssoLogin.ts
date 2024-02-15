import axios from 'axios'
import { Router } from 'express'
import jwt_decode from 'jwt-decode'
import _ from 'lodash'
import qs from 'querystring'
import {
    axiosRequestConfig,
} from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
import { getOTP, validateOTP } from './otp'
import { getCurrentUserRoles } from './rolePermission'

const API_END_POINTS = {
    generateOtp: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/otp/v1/generate`,
    grantAccessToken: `${CONSTANTS.HTTPS_HOST}/auth/realms/sunbird/protocol/openid-connect/token`,
    searchUser: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
    verifyOtp: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/otp/v1/verify`,
}

const VALIDATION_FAIL = 'Please provide correct otp and try again.'
const AUTH_FAIL =
    'Authentication failed ! Please check credentials and try again.'
const AUTHENTICATED = 'Success ! User is sucessfully authenticated.'

export const ssoLogin = Router()
ssoLogin.post('/otp/sendOtp', async (req, res) => {
    try {
        logInfo('Entered into SSO Login with SSO >>>>>')
        const { userEmail = '', userPhone = '' } = req.body
        if (!userEmail && !userPhone) {
            res.status(400).json({
                msg: "Email id and phone both can't be empty",
                status: 'error',
            })
        }
        const userDetails = await getUserDetails(userEmail, userPhone)
        if (userDetails.data.result.response.count <= 0) {
            return res.status(400).json({
                msg: "User doesn't exists please signup and try again",
                status: 'error',
            })
        }
        const userId = userDetails.data.result.response.content[0].id
        try {
            await getOTP(
                userId,
                userEmail ? userEmail : userPhone,
                userEmail ? 'email' : 'phone'
            )
            res.status(200).json({
                message: 'User otp successfully sent',
                userId,
            })
        } catch (error) {
            res.status(500).send({
                message: 'OTP generation fail',
                status: 'failed',
            })
        }

    } catch (error) {
        logInfo('Error in sending user OTP >>>>>>' + error)
        res.status(500).send({
            message: '',
            status: 'failed',
        })
    }
})

ssoLogin.post('/otp/resendOtp', async (req, res) => {
    try {
        const { userId, userEmail, userPhone } = req.body
        if ((!userPhone && !userEmail) || !userId) {
            return res.status(400).json({
                message: 'Mandatory parameters userId, email/phone missing',
            })
        }
        await getOTP(
            userId,
            userEmail ? userEmail : userPhone,
            userEmail ? 'email' : 'phone'
        )
        res.status(200).json({
            message: 'User otp successfully resent',
            userId,
        })
    } catch (error) {
        res.status(500).send({
            message: 'OTP generation fail',
        })
    }
})
// tslint:disable-next-line: no-any
ssoLogin.post('/login', async (req: any, res) => {
    try {
        logInfo('Entered into /validateOtp ', req.body)
        let userId = ''
        const { userEmail = '', userPhone = '', otp = '', userPassword = '', typeOfLogin = '' } = req.body
        if ((!userPhone && !userEmail) || !typeOfLogin) {
            return res.status(400).send({ message: 'Mandatory parameters typeOfLogin and email/phone', status: 'error' })

        }
        if (typeOfLogin == 'otp') {
            const verifyOtpResponse = await validateOTP(
                userId,
                userEmail ? userEmail : userPhone,
                userEmail ? 'email' : 'phone',
                otp
            )
            if (verifyOtpResponse.data.result.response !== 'SUCCESS') {
                return res.status(400).json({
                    message: 'OTP validation failed try again',
                })
            }
        }
        res.clearCookie('connect.sid')
        req.session.user = null
        // tslint:disable-next-line: no-any
        req.session.save(async () => {
            req.session.regenerate(async () => {
                // A new session and cookie will be generated from here
                try {
                    const keycloakLoginData = {
                        otp: {
                            client_id: 'aastrika-sso-login',
                            client_secret: CONSTANTS.APP_SSO_KEYCLOAK_SECRET,
                            grant_type: 'password',
                            scope: 'offline_access',
                            username: userPhone ? userPhone : userEmail,
                        },
                        password: {
                            client_id: 'portal',
                            grant_type: 'password',
                            password: userPassword,
                            username: userEmail ? userEmail : userPhone,
                        },
                    }
                    const transformedData = qs.stringify(typeOfLogin == 'otp' ? keycloakLoginData.otp : keycloakLoginData.password)
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
                        userId = decodedTokenArray[decodedTokenArray.length - 1]
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
                            token: authTokenResponse.data,
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

    } catch (error) {
        res.status(500).send({
            message: VALIDATION_FAIL,
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
