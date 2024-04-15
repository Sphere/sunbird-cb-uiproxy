import axios from 'axios'
import { Router } from 'express'
import jwt_decode from 'jwt-decode'
import _ from 'lodash'
import qs from 'querystring'
import {
    axiosRequestConfig,
} from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { getOTP, validateOTP } from './otp'
import { getCurrentUserRoles } from './rolePermission'

const API_END_POINTS = {
    generateOtp: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/otp/v1/generate`,
    grantAccessToken: `${CONSTANTS.HTTPS_HOST}/auth/realms/sunbird/protocol/openid-connect/token`,
    msg91ResendOtp: `https://control.msg91.com/api/v5/otp/retry`,
    msg91SendOtp: `https://control.msg91.com/api/v5/otp`,
    msg91VerifyOtp: `https://control.msg91.com/api/v5/otp/verify`,
    searchUser: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
    verifyOtp: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/otp/v1/verify`,

}
const indianCountryCode = '+91'
const VALIDATION_FAIL = 'Please provide correct otp and try again.'
const AUTH_FAIL =
    'Authentication failed ! Please check credentials and try again.'
const AUTHENTICATED = 'Success ! User is successfully authenticated.'
const USER_NOT_EXISTS = "User doesn't exists please signup and try again"
const msg91Headers = {
    accept: 'application/json',
    authkey: CONSTANTS.MSG_91_AUTH_KEY_SSO,
    'content-type': 'application/json',
}
export const ssoLogin = Router()
ssoLogin.post('/otp/sendOtp', async (req, res) => {
    try {
        logInfo('Entered into SSO Login with SSO >>>>>')
        const userPhone = req.body.userPhone || ''
        let userEmail = req.body.userEmail || ''
        userEmail = userEmail.toLowerCase()
        logInfo("User request body send otp", JSON.stringify(req.body))
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
        logInfo("SSO Login user details from search", userDetails.data.result.response.content[0])
        const userId = userDetails.data.result.response.content[0].id
        // User OTP send through MSG91 for phone
        if (userPhone) {
            try {
                logInfo("SSO Login send otp through phone", userPhone)
                await axios({
                    headers: msg91Headers,
                    params: {
                        mobile: `${indianCountryCode}${userPhone}`,
                        template_id: CONSTANTS.MSG_91_TEMPLATE_ID_SEND_OTP_SSO,
                    },

                    method: 'POST',
                    url: API_END_POINTS.msg91SendOtp,
                })
                return res.status(200).json({
                    message: `OTP successfully sent on phone ${userPhone}`,
                    userId,
                })
            } catch (error) {
                logError("Error while sending mobile OTP", JSON.stringify(error))
                return res.status(500).send({
                    message: `OTP generation fail for phone ${userPhone}`,
                    status: 'failed',
                })
            }

        }
        // User otp send through learner service for email users
        if (userEmail) {
            try {
                logInfo("SSO Login send otp through email", userEmail)
                await getOTP(
                    userId,
                    userEmail,
                    'email'
                )
                res.status(200).json({
                    message: `OTP successfully sent on email ${userEmail}`,
                    userId,
                })
            } catch (error) {
                logError("Error while sending email OTP", JSON.stringify(error))
                res.status(500).send({
                    message: `OTP generation fail for email ${userEmail}`,
                    status: 'failed',
                })
            }
        }
    } catch (error) {
        logInfo('Error in sending user OTP' + error)
        res.status(500).send({
            message: 'Error in sending user OTP',
            status: 'failed',
        })
    }
})
ssoLogin.post('/otp/resendOtp', async (req, res) => {
    try {
        const userPhone = req.body.userPhone || ''
        let userEmail = req.body.userEmail || ''
        userEmail = userEmail.toLowerCase()
        logInfo("SSO login resend OTP route request body", req.body)
        if (!userPhone && !userEmail) {
            return res.status(400).json({
                message: 'Mandatory parameters email/phone missing',
            })
        }
        const userDetails = await getUserDetails(userEmail, userPhone)
        if (userDetails.data.result.response.count <= 0) {
            return res.status(400).json({
                msg: USER_NOT_EXISTS,
                status: 'error',
            })
        }
        const userId = userDetails.data.result.response.content[0].id
        // User OTP send through MSG91 for phone
        if (userPhone) {
            try {
                logInfo("SSO Resend OTP through phone", userPhone)
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
                logInfo("SSO Resend OTP through email", userEmail)
                await getOTP(
                    userId,
                    userEmail,
                    'email'
                )
                res.status(200).json({
                    message: `OTP successfully re-sent on email ${userEmail}`,
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
ssoLogin.post('/login', async (req: any, res) => {
    try {
        logInfo('SSO login endpoint request body', JSON.stringify(req.body))
        const { userPhone = '', otp = '', userPassword = '', typeOfLogin = '' } = req.body
        let userEmail = req.body.userEmail || ''
        userEmail = userEmail.toLowerCase()
        if ((!userPhone && !userEmail) || !typeOfLogin) {
            return res.status(400).send({ message: 'Mandatory parameters typeOfLogin and email/phone', status: 'error' })

        }
        const userDetails = await getUserDetails(userEmail, userPhone)
        if (userDetails.data.result.response.count <= 0) {
            return res.status(400).json({
                msg: USER_NOT_EXISTS,
                status: 'error',
            })
        }
        logInfo("User details from search SSO login", JSON.stringify(userDetails.data))
        const userId = userDetails.data.result.response.content[0].id
        logInfo("SSO login userid", userId)
        if (typeOfLogin == 'otp' && userEmail) {
            logInfo("Validate otp for email")
            const verifyOtpResponse = await validateOTP(
                userId,
                userEmail,
                'email',
                otp
            )
            if (verifyOtpResponse.data.result.response !== 'SUCCESS') {
                return res.status(400).json({
                    message: 'Email OTP validation failed try again',
                })
            }
        }
        if (typeOfLogin == 'otp' && userPhone) {
            logInfo("Validate otp for phone")

            const verifyOtpResponse = await axios({
                headers: msg91Headers,
                method: 'GET',
                params: {
                    mobile: `${indianCountryCode}${userPhone}`,
                    otp,
                },

                url: API_END_POINTS.msg91VerifyOtp,
            })
            if (verifyOtpResponse.data.type !== 'success') {
                return res.status(400).json({
                    message: 'Phone OTP validation failed try again',
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
                        msg: AUTH_FAIL,
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
