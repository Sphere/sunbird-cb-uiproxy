import axios from 'axios'
import { Router } from 'express'
import * as fs from 'fs'
import _ from 'lodash'
import { IPersonalDetails, ISBUser, ISunbirdbUserResponse} from '../../../src/models/user.model'
import { axiosRequestConfig, axiosRequestConfigLong, axiosRequestConfigVeryLong } from '../../configs/request.config'
import { CONSTANTS } from '../../utils/env'
import { logError, logInfo } from '../../utils/logger'
import { ERROR } from '../../utils/message'
import { extractUserIdFromRequest, extractUserToken } from '../../utils/requestExtract'

const uuidv1            = require('uuid/v1')
const dateFormat        = require('dateformat')

const API_END_POINTS = {
    createOSUserRegistry: (userId: string) => `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/v1/user/create/profile?userId=${userId}`,
    createSb: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/v1/user/signup`,
    createUserRegistry: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/createUserRegistry`,
    getMasterLanguages: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/getMasterLanguages`,
    getMasterNationalities: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/getMasterNationalities`,
    getOSUserRegistryById: (userId: string) => `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/v1/user/search/profile?userId=${userId}`,
    getProfilePageMeta: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/getProfilePageMeta`,
    getUserRegistry: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/getUserRegistry`,
    getUserRegistryById: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/getUserRegistryById`,
    kongCreateUser: `${CONSTANTS.KONG_API_BASE}/user/v3/create`,
    kongSearchUser: `${CONSTANTS.KONG_API_BASE}/user/v1/search`,
    kongSendWelcomeEmail: `${CONSTANTS.KONG_API_BASE}/private/user/v1/notification/email`,
    kongUpdateUser: `${CONSTANTS.KONG_API_BASE}/user/private/v1/update`,
    kongUserRead: (userId: string) => `${CONSTANTS.KONG_API_BASE}/user/v2/read/${userId}`,
    kongUserResetPassword: `${CONSTANTS.KONG_API_BASE}/private/user/v1/password/reset`,
    // tslint:disable-next-line: object-literal-sort-keys
    migrateRegistry: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/migrateRegistry`,
    resetPassword: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/password/reset`,
    searchSb: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
    sendWelcomeEmail: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/notification/email`,
    setUserProfileStatus: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/setUserProfileStatus`,
    updateOSUserRegistry: (userId: string) => `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/v1/user/update/profile?userId=${userId}`,
    userProfileStatus: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/userProfileStatus`,
    userRead: (userId: string) => `${CONSTANTS.LEARNER_SERVICE_API_BASE}/v1/user/read/${userId}`,
}

export async function getUserProfileStatus(wid: string) {
    try {
        const response = await axios.post(API_END_POINTS.userProfileStatus, { wid }, {
            ...axiosRequestConfig,
        })
        if (response.data.status) {
            return true
        } else {
            return false
        }
    } catch (err) {
        logError('ERROR GETTING USER PROFILE STATUS FROM  ${API_END_POINTS.userProfileStatus} >', err)
        return false
    }
}

export const profileDeatailsApi = Router()

profileDeatailsApi.post('/createUserRegistry', async (req, res) => {
    try {
        const userId = extractUserIdFromRequest(req)
        logInfo('Create user registry for', userId)
        const response = await axios.post(API_END_POINTS.createUserRegistry, { ...req.body, userId }, {
            ...axiosRequestConfigLong,
        })
        res.status(response.status).json(response.data)
    } catch (err) {
        logError('ERROR CREATING USER REGISTRY >', err)
        res.status((err && err.response && err.response.status) || 500).send(err)
    }
})

// tslint:disable-next-line: no-identical-functions
profileDeatailsApi.get('/getUserRegistry', async (req, res) => {
    try {
        const userId = extractUserIdFromRequest(req)
        logInfo('Get user registry for', userId)
        const response = await axios.post(API_END_POINTS.getUserRegistry, { userId }, {
            ...axiosRequestConfig,
        })
        res.status(response.status).send(response.data)
    } catch (err) {
        logError('ERROR FETCHING USER REGISTRY >', err)
        res.status((err && err.response && err.response.status) || 500).send(err)
    }
})

// tslint:disable-next-line: no-identical-functions
profileDeatailsApi.get('/getUserRegistryById/:id', async (req, res) => {
    try {
        let userId = req.params.id
        if (!userId) {
            userId = extractUserIdFromRequest(req)
        }
        logInfo('Get user registry for', userId)

        const response = await axios.post(API_END_POINTS.getUserRegistry, { userId }, {
            ...axiosRequestConfig,
        })
        res.status(response.status).send(response.data)
    } catch (err) {
        logError('ERROR FETCHING USER REGISTRY >', err)
        res.status((err && err.response && err.response.status) || 500).send(err)
    }
})

profileDeatailsApi.get('/userProfileStatus', async (req, res) => {
    try {
        const org = req.header('org')
        const rootOrg = req.header('rootOrg')
        if (!org || !rootOrg) {
            res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
            return
        }
        req.body.wid = extractUserIdFromRequest(req)
        const response = await axios.post(API_END_POINTS.userProfileStatus, req, {
            ...axiosRequestConfig,
            headers: { rootOrg },
        })
        res.status(response.status).send(response.data)
    } catch (err) {
        logError('ERROR FETCHING USER PROFILE STATUS >', err)
        res.status((err && err.response && err.response.status) || 500).send(err)
    }
})

profileDeatailsApi.post('/setUserProfileStatus', async (req, res) => {
    try {
        req.body.wid = extractUserIdFromRequest(req)
        const response = await axios.post(API_END_POINTS.setUserProfileStatus, req, {
            ...axiosRequestConfig,
            headers: req.headers,
        })
        res.status(response.status).send(response.data)
    } catch (err) {
        logError('ERROR SETTING USER PROFILE STATUS >', err)
        res.status((err && err.response && err.response.status) || 500).send(err)
    }
})

profileDeatailsApi.get('/getMasterLanguages', async (_req, res) => {
    try {
        const response = await axios.get(API_END_POINTS.getMasterLanguages, {
            ...axiosRequestConfig,
        })
        res.status(response.status).send(response.data)
    } catch (err) {
        logError('ERROR FETCHING MASTER LANGUAGES >', err)
        res.status((err && err.response && err.response.status) || 500).send(err)
    }
})

// tslint:disable-next-line: no-identical-functions
profileDeatailsApi.get('/getMasterNationalities', async (_req, res) => {
    try {
        const response = await axios.get(API_END_POINTS.getMasterNationalities, {
            ...axiosRequestConfig,
        })
        res.status(response.status).send(response.data)
    } catch (err) {
        logError('ERROR FETCHING MASTER NATIONALITIES >', err)
        res.status((err && err.response && err.response.status) || 500).send(err)
    }
})

profileDeatailsApi.get('/getProfilePageMeta', async (_req, res) => {
    try {
        const response = await axios.get(API_END_POINTS.getProfilePageMeta, {
            ...axiosRequestConfig,
        })
        res.status(response.status).send(response.data)
    } catch (err) {
        logError('ERROR FETCHING MASTER NATIONALITIES >', err)
        res.status((err && err.response && err.response.status) || 500).send(err)
    }
})

// Api to migrate data from eagleUser opensaber  to new userProfile opensaber
profileDeatailsApi.get('/migrateRegistry', async (req, res) => {
    const filePath = CONSTANTS.USER_BULK_UPLOAD_DIR || process.cwd() + '/user_upload/'
    try {
        // tslint:disable-next-line: no-any
        fs.readFile(filePath + 'migrateRegistry.json', async (err: any, json: any) => {
            if (!err) {
                const obj = JSON.parse(json)
                const widList = obj.widList
                const userId = extractUserIdFromRequest(req)

                logInfo('migrating the registry')
                const response = await axios.post(
                    API_END_POINTS.migrateRegistry,
                    { ...req.body, userId, widList },
                    {
                        ...axiosRequestConfigVeryLong,
                    }
                )
                res.status(response.status).json(response.data)
            } else {
                res.status(500).send(err)
            }
        })
    } catch (err) {
        logError('ERROR CREATING USER REGISTRY >', err)
        res.status((err && err.response && err.response.status) || 500).send(err)
    }
})

const channelParamMissing = 'Channel param is missing in personalDetails. Use DeptName as Channel value.'
const emailAdressExist = 'Email address already exist'
const failedToCreateUser = 'Not able to create User in SunBird'
const failedToReadUser = 'Failed to read newly created user details.'
const failedToCreateUserInOpenSaber = 'Not able to create User Registry in Opensaber'
const createUserFailed = 'ERROR CREATING USER >'
const failedToUpdateUser = 'Failed to update user profile data.'
const unknownError = 'Failed due to unknown reason'

profileDeatailsApi.post('/createUser', async (req, res) => {
    try {
        const sbChannel = req.body.personalDetails.channel
        if (!sbChannel) {
            res.status(400).send(channelParamMissing)
            return
        }
        const sbemail_ = req.body.personalDetails.email
        const sbemailVerified_ = true
        const sbfirstName_ = req.body.personalDetails.firstName
        const sblastName_ = req.body.personalDetails.lastName

        const searchresponse = await axios({
            ...axiosRequestConfig,
            data: { request: { query: '', filters: { email: sbemail_.toLowerCase() } } },
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                // tslint:disable-next-line: all
                'x-authenticated-user-token': extractUserToken(req),
            },
            method: 'POST',
            url: API_END_POINTS.kongSearchUser,
        })
        if (searchresponse.data.result.response.count > 0) {
            res.status(400).send(
            {
                id: 'api.error.createUser',
                ver: '1.0',
                // tslint:disable-next-line: object-literal-sort-keys
                ts: dateFormat(new Date(), 'yyyy-mm-dd HH:MM:ss:lo'),
                params:
                {
                    resmsgid: uuidv1(),
                    // tslint:disable-next-line: object-literal-sort-keys
                    msgid: null,
                    status: 'failed',
                    err: 'USR_EMAIL_EXISTS',
                    errmsg: emailAdressExist,
                },
                responseCode: 'USR_EMAIL_EXISTS',
                result: {},
            })
            return
        } else {
            const sbUserProfile: Partial<ISBUser> = {
                channel: sbChannel, email: sbemail_, emailVerified: sbemailVerified_, firstName: sbfirstName_,
                lastName: sblastName_,
            }
            const response = await axios({
                ...axiosRequestConfig,
                data: { request: sbUserProfile },
                 headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    // tslint:disable-next-line: all
                    'x-authenticated-user-token': extractUserToken(req),
                },
                method: 'POST',
                url: API_END_POINTS.kongCreateUser,
            })
            if (response.data.responseCode === 'CLIENT_ERROR') {
                res.status(400).send(failedToCreateUser)
                return
            } else {
                const sbUserId = response.data.result.userId
                const sbUserReadResponse = await axios({
                    ...axiosRequestConfig,
                    headers: {
                        Authorization: CONSTANTS.SB_API_KEY,
                        // tslint:disable-next-line: all
                        'x-authenticated-user-token': extractUserToken(req),
                    },
                    method: 'GET',
                    url: API_END_POINTS.kongUserRead(sbUserId),
                })
                if (sbUserReadResponse.data.params.status !== 'success') {
                    res.status(500).send(failedToReadUser)
                    return
                }

                const sbProfileUpdateReq = {
                    profileDetails: {
                        employmentDetails: {
                            departmentName: sbChannel,
                        },
                        personalDetails: {
                            firstname: sbfirstName_,
                            primaryEmail: sbemail_,
                            surname: sblastName_,
                        },
                    },
                    userId: sbUserId,
                }

                const sbUserProfileUpdateResp = await axios({
                    ...axiosRequestConfig,
                    data: { request: sbProfileUpdateReq },
                    headers: {
                        Authorization: CONSTANTS.SB_API_KEY,
                    },
                    method: 'PATCH',
                    url: API_END_POINTS.kongUpdateUser,
                })
                if (sbUserProfileUpdateResp.data.responseCode === 'CLIENT_ERROR') {
                    res.status(400).send(failedToUpdateUser)
                    return
                }

                const passwordResetRequest = {
                    key: 'email',
                    type: 'email',
                    userId: sbUserId,
                }

                logInfo('Sending Password reset request -> ' + passwordResetRequest)
                const passwordResetResponse = await axios({
                    ...axiosRequestConfig,
                    data: { request: passwordResetRequest },
                    headers: {
                        Authorization: CONSTANTS.SB_API_KEY,
                    },
                    method: 'POST',
                    url: API_END_POINTS.kongUserResetPassword,
                })
                logInfo('Received response from password reset -> ' + passwordResetResponse)

                if (passwordResetResponse.data.params.status === 'success') {
                    const welcomeMailRequest = {
                        allowedLoging: 'You can use your email to Login',
                        body: 'Hello',
                        emailTemplateType: 'iGotWelcome',
                        firstName: sbUserProfile.firstName,
                        link: passwordResetResponse.data.result.link,
                        mode: 'email',
                        orgName: sbChannel,
                        recipientEmails: [ sbemail_ ],
                        setPasswordLink: true,
                        subject: 'Welcome Email',
                        welcomeMessage: 'Hello',
                    }

                    const welcomeMailResponse = await axios({
                        ...axiosRequestConfig,
                        data: { request: welcomeMailRequest },
                        headers: {
                            Authorization: CONSTANTS.SB_API_KEY,
                        },
                        method: 'POST',
                        url: API_END_POINTS.kongSendWelcomeEmail,
                    })

                    if (welcomeMailResponse.data.params.status !== 'success') {
                        res.status(500).send('Failed to send Welcome Email.')
                        return
                    }
                } else {
                    res.status(500).send('Failed to reset the password for user.')
                    return
                }

                const sbUserProfileResponse: Partial<ISunbirdbUserResponse> = {
                    email: sbemail_, firstName: sbfirstName_, lastName: sblastName_,
                    userId: sbUserId,
                }
                res.send(sbUserProfileResponse)
            }
        }
    } catch (err) {
        logError(createUserFailed, err)
        res.status((err && err.response && err.response.status) || 500).send(err)
    }
})

profileDeatailsApi.patch('/updateUser', async (req, res) => {
    try {
          // tslint:disable-next-line: max-line-length
        if (req.body.request.profileDetails.profileReq.personalDetails && !req.body.request.profileDetails.profileReq.personalDetails.regNurseRegMidwifeNumber) {
            req.body.request.profileDetails.profileReq.personalDetails.regNurseRegMidwifeNumber = '[NA]'
        }
          // tslint:disable-next-line: max-line-length
        req.body.request.profileDetails.profileReq.personalDetails = _.omitBy(req.body.request.profileDetails.profileReq.personalDetails, (v) => _.isUndefined(v) || _.isNull(v) || _.isEmpty(v))
        logInfo(JSON.stringify(req.body))
        const response = await axios.patch(API_END_POINTS.kongUpdateUser, req.body, {
            ...axiosRequestConfig,
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
            },
        })
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(failedToUpdateUser + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
})

profileDeatailsApi.post('/createUserV2WithRegistry', async (req, res) => {
    try {
        const sbChannel = req.body.personalDetails.channel
        if (!sbChannel) {
            res.status(400).send(channelParamMissing)
            return
        }
        const sbemail_ = req.body.personalDetails.email
        const sbemailVerified_ = true
        const sbfirstName_ = req.body.personalDetails.firstName
        const sblastName_ = req.body.personalDetails.lastName

        const searchresponse = await axios({
            ...axiosRequestConfig,
            data: { request: { query: '', filters: { email: sbemail_.toLowerCase() } } },
            method: 'POST',
            url: API_END_POINTS.searchSb,
        })
        if (searchresponse.data.result.response.count > 0) {
            res.status(400).send(emailAdressExist)
            return
        } else {
            const sbUserProfile: Partial<ISBUser> = {
                channel: sbChannel, email: sbemail_, emailVerified: sbemailVerified_, firstName: sbfirstName_,
                lastName: sblastName_,
            }
            const response = await axios({
                ...axiosRequestConfig,
                data: { request: sbUserProfile },
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    // tslint:disable-next-line: all
                    'x-authenticated-user-token': extractUserToken(req),
                },
                method: 'POST',
                url: API_END_POINTS.createSb,
            })
            if (response.data.responseCode === 'CLIENT_ERROR') {
                res.status(400).send(failedToCreateUser)
                return
            } else {
                const sbUserId = response.data.result.userId
                const sbUserReadResponse = await axios({
                    ...axiosRequestConfig,
                    headers: {
                        Authorization: CONSTANTS.SB_API_KEY,
                        'x-authenticated-user-token': extractUserToken(req),
                    },
                    method: 'GET',
                    url: API_END_POINTS.userRead(sbUserId),
                })
                if (sbUserReadResponse.data.params.status !== 'success') {
                    res.status(500).send(failedToReadUser)
                    return
                }
                const personalDetailsRegistry: IPersonalDetails = {
                    firstname: sbfirstName_,
                    primaryEmail: sbemail_,
                    surname: sblastName_,
                    userName: sbUserReadResponse.data.result.response.userName,
                }
                const userRegistry = getUserRegistry(personalDetailsRegistry, sbChannel)
                const userRegistryResponse = await axios({
                    ...axiosRequestConfig,
                    data: userRegistry,
                    headers: {
                        wid: sbUserId,
                    },
                    method: 'POST',
                    url: API_END_POINTS.createOSUserRegistry(sbUserId),
                })
                if (userRegistryResponse.data === null) {
                    res.status(500).send(failedToCreateUserInOpenSaber)
                } else {
                    const sbUserProfileResponse: Partial<ISunbirdbUserResponse> = {
                        email: sbemail_, firstName: sbfirstName_, lastName: sblastName_,
                        userId: sbUserId,
                    }
                    res.send(sbUserProfileResponse)
                }
            }
        }
    } catch (err) {
        logError(createUserFailed, err)
        res.status((err && err.response && err.response.status) || 500).send(err)
    }
})

profileDeatailsApi.post('/createUserV2WithoutRegistry', async (req, res) => {
    try {
        const sbChannel = req.body.personalDetails.channel
        if (!sbChannel) {
            res.status(400).send(channelParamMissing)
            return
        }
        const sbemail_ = req.body.personalDetails.email
        const sbemailVerified_ = true
        const sbfirstName_ = req.body.personalDetails.firstName
        const sblastName_ = req.body.personalDetails.lastName

        const searchresponse = await axios({
            ...axiosRequestConfig,
            data: { request: { query: '', filters: { email: sbemail_.toLowerCase() } } },
            method: 'POST',
            url: API_END_POINTS.searchSb,
        })
        if (searchresponse.data.result.response.count > 0) {
            res.status(400).send(emailAdressExist)
            return
        } else {
            const sbUserProfile: Partial<ISBUser> = {
                channel: sbChannel, email: sbemail_, emailVerified: sbemailVerified_, firstName: sbfirstName_,
                lastName: sblastName_,
            }
            const response = await axios({
                ...axiosRequestConfig,
                data: { request: sbUserProfile },
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    // tslint:disable-next-line: all
                    'x-authenticated-user-token': extractUserToken(req),
                },
                method: 'POST',
                url: API_END_POINTS.createSb,
            })
            if (response.data.responseCode === 'CLIENT_ERROR') {
                res.status(400).send(failedToCreateUser)
                return
            } else {
                const sbUserId = response.data.result.userId
                const sbUserReadResponse = await axios({
                    ...axiosRequestConfig,
                    headers: {
                        Authorization: CONSTANTS.SB_API_KEY,
                        'x-authenticated-user-token': extractUserToken(req),
                    },
                    method: 'GET',
                    url: API_END_POINTS.userRead(sbUserId),
                })
                if (sbUserReadResponse.data.params.status !== 'success') {
                    res.status(500).send(failedToReadUser)
                    return
                } else {
                    const sbUserProfileResponse: Partial<ISunbirdbUserResponse> = {
                        email: sbemail_, firstName: sbfirstName_, lastName: sblastName_,
                        userId: sbUserId,
                    }
                    res.send(sbUserProfileResponse)
                }
            }
        }
    } catch (err) {
        logError(createUserFailed, err)
        res.status((err && err.response && err.response.status) || 500).send(err)
    }
})

// tslint:disable-next-line
profileDeatailsApi.post('/createUserWithoutInvitationEmail', async (req, res) => {
    try {
        const sbChannel = req.body.personalDetails.channel
        if (!sbChannel) {
            res.status(400).send(channelParamMissing)
            return
        }
        const sbemail_ = req.body.personalDetails.email
        const sbemailVerified_ = true
        const sbfirstName_ = req.body.personalDetails.firstName
        const sblastName_ = req.body.personalDetails.lastName

        const searchresponse = await axios({
            ...axiosRequestConfig,
            data: { request: { query: '', filters: { email: sbemail_.toLowerCase() } } },
            method: 'POST',
            url: API_END_POINTS.searchSb,
        })
        if (searchresponse.data.result.response.count > 0) {
            res.status(400).send(emailAdressExist)
            return
        } else {
            const sbUserProfile: Partial<ISBUser> = {
                channel: sbChannel, email: sbemail_, emailVerified: sbemailVerified_, firstName: sbfirstName_,
                lastName: sblastName_,
            }
            const response = await axios({
                ...axiosRequestConfig,
                data: { request: sbUserProfile },
                 headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    // tslint:disable-next-line: all
                    'x-authenticated-user-token': extractUserToken(req),
                },
                method: 'POST',
                url: API_END_POINTS.createSb,
            })
            if (response.data.responseCode === 'CLIENT_ERROR') {
                res.status(400).send(failedToCreateUser)
                return
            } else {
                const sbUserId = response.data.result.userId
                const sbUserReadResponse = await axios({
                    ...axiosRequestConfig,
                    headers: {
                        Authorization: CONSTANTS.SB_API_KEY,
                        // tslint:disable-next-line: all
                        'x-authenticated-user-token': extractUserToken(req),
                    },
                    method: 'GET',
                    url: API_END_POINTS.userRead(sbUserId),
                })
                if (sbUserReadResponse.data.params.status !== 'success') {
                    res.status(500).send(failedToReadUser)
                    return
                }

                const personalDetailsRegistry: IPersonalDetails = {
                    firstname: sbfirstName_,
                    primaryEmail: sbemail_,
                    surname: sblastName_,
                    userName: sbUserReadResponse.data.result.response.userName,
                }
                const userRegistry = getUserRegistry(personalDetailsRegistry, sbChannel)
                const userRegistryResponse = await axios({
                    ...axiosRequestConfig,
                    data: userRegistry,
                    headers: {
                        wid: sbUserId,
                    },
                    method: 'POST',
                    url: API_END_POINTS.createOSUserRegistry(sbUserId),
                })
                if (userRegistryResponse.data === null) {
                    res.status(500).send(failedToCreateUserInOpenSaber)
                } else {
                    const sbUserProfileResponse: Partial<ISunbirdbUserResponse> = {
                        email: sbemail_, firstName: sbfirstName_, lastName: sblastName_,
                        userId: sbUserId,
                    }
                    res.send(sbUserProfileResponse)
                }
            }
        }
    } catch (err) {
        logError(createUserFailed, err)
        res.status((err && err.response && err.response.status) || 500).send(err)
    }
})

function getUserRegistry(personalDetailsRegistry: IPersonalDetails, deptName: string) {
    return {
        academics: [
            {
                nameOfInstitute: '',
                nameOfQualification: '',
                type: 'X_STANDARD',
                yearOfPassing: '',
            },
            {
                nameOfInstitute: '',
                nameOfQualification: '',
                type: 'XII_STANDARD',
                yearOfPassing: '',
            },
        ],
        employmentDetails: {
            allotmentYearOfService: '',
            cadre: '',
            civilListNo: '',
            departmentName: deptName,
            dojOfService: '',
            employeeCode: '',
            officialPostalAddress: '',
            payType: '',
            pinCode: '',
            service: '',
        },
        interests: {
            hobbies: [],
            professional: [],
        },
        personalDetails: personalDetailsRegistry,
        professionalDetails: [
            {
                name: '',
            },
        ],
        skills: {
            additionalSkills: '',
            certificateDetails: '',
        },
    }
}
