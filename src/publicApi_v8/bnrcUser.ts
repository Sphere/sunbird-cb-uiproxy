/* eslint-disable */
import axios from 'axios'
import express, { Request, Response } from 'express'
import Joi from 'joi'
import { v4 as uuidv4 } from 'uuid'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'
import { logInfo } from '../utils/logger'

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

export const bnrcUserCreation = express.Router()

interface UserDetails {
    block?: string
    bnrcRegistrationNumber: string
    courseSelection?: string
    district: string
    email: string
    firstName: string
    facultyType?: string
    facilityName?: string
    hrmsId: string
    instituteName?: string
    instituteType?: string
    lastName: string
    nin?: string
    phone: number
    privateFacilityType?: string
    publicFacilityType?: string
    // tslint:disable-next-line: all
    roleForInService?: 'Public Health Facility' | 'Private Health Facility'
    // tslint:disable-next-line: all
    role: 'Student' | 'Faculty' | 'In Service',
    serviceType?: string
}

const shortHands = {
    cho: 'CHO',
    privateHealthFacility: 'Private Health Facility',
    publicHealthFacility: 'Public Health Facility',
}
const healthBihar = 'State Health Society Bihar'
const serviceSchemaJoi = Joi.object({
    block: Joi.string()
        .when('roleForInService', {
            is: shortHands.cho,
            otherwise: Joi.string().allow('', null).optional(),
            then: Joi.string().required(),
        })
        .messages({
            // tslint:disable-next-line: all
            'any.required': 'Block is required',
        }),
    bnrcRegistrationNumber: Joi.string().allow('', null).optional(),
    district: Joi.string()
        .required()
        .messages({
            // tslint:disable-next-line: all
            'any.required': 'District is required',
        }),
    firstName: Joi.string()
        .required()
        .messages({
            // tslint:disable-next-line: all
            'any.required': 'First name is required',
        }),

    lastName: Joi.string()
        .required()
        .messages({
            // tslint:disable-next-line: all
            'any.required': 'Last name is required',
        }),

    phone: Joi.number() // Adjusted to validate as a number
        .required()
        .integer()
        .positive()
        .messages({
            // tslint:disable-next-line: all
            'any.required': 'Phone number is required',
            'number.base': 'Phone number must be a number',
            'number.integer': 'Phone number must be an integer',
            'number.positive': 'Phone number must be a positive integer',
        }),

    email: Joi.string().allow('', null).email().optional(),
    hrmsId: Joi.string().allow('', null).optional(),
    role: Joi.string()
        .valid('Student', 'Faculty', 'In Service')
        .required()
        .messages({
            // tslint:disable-next-line: all
            'any.only': 'Role must be either Student, Faculty, or In Service',
            'any.required': 'Role is required',
        }),

    courseSelection: Joi.string()
        .when('role', {
            is: Joi.valid('Student'),
            otherwise: Joi.string().allow('', null).optional(),
            then: Joi.string().required(),
        })
        .messages({
            'any.required': 'Course selection is required for Student and Faculty roles',
        }),

    instituteType: Joi.string()
        .when('role', {
            // tslint:disable-next-line: all
            is: Joi.valid('Student', 'Faculty'),
            otherwise: Joi.string().allow('', null).optional(),
            then: Joi.string().required(),
        })
        .messages({
            // tslint:disable-next-line: all
            'any.required': 'Institute type is required for Student and Faculty roles',
        }),

    instituteName: Joi.string()
        .when('role', {
            is: Joi.valid('Student', 'Faculty'),
            otherwise: Joi.string().allow('', null).optional(),
            then: Joi.string().required(),
        })
        .messages({
            // tslint:disable-next-line: all
            'any.required': 'Institute name is required for Student and Faculty roles',
        }),

    facultyType: Joi.string()
        .when('role', {
            is: 'Faculty',
            otherwise: Joi.string().allow('', null).optional(),
            then: Joi.string().required(),
        })
        .messages({
            // tslint:disable-next-line: all
            'any.required': 'Faculty type is required for Faculty role',
        }),

    roleForInService: Joi.string()
        .valid(shortHands.publicHealthFacility, shortHands.privateHealthFacility, shortHands.cho)
        .when('role', {
            is: Joi.not('Student', 'Faculty'),
            otherwise: Joi.string().allow('', null).optional(),
            then: Joi.string().optional(),
        })
        .messages({
            'any.only': 'Role for In Service must be either Public Health Facility, CHO or Private Health Facility',
            // tslint:disable-next-line: all
            'any.required': 'Role for In Service is required',
        }),

    publicFacilityType: Joi.string()
        .when('roleForInService', {
            is: shortHands.publicHealthFacility,
            otherwise: Joi.string().allow('', null).optional(),
            then: Joi.string().required(),
        })
        .messages({
            // tslint:disable-next-line: all
            'any.required': 'Public Facility Type is required for Public Health Facility role',
        }),

    facilityName: Joi.string().when('roleForInService', {
        is: shortHands.cho,
        otherwise: Joi.string().allow('', null).optional(),
        then: Joi.string().required(),
    }).allow('', null).optional(),

    nin: Joi.string().when('roleForInService', {
        is: shortHands.cho,
        otherwise: Joi.string().allow('', null).optional(),
        then: Joi.string().required(),
    }).allow('', null).optional(),

    privateFacilityType: Joi.string()
        .when('roleForInService', {
            is: shortHands.privateHealthFacility,
            otherwise: Joi.string().allow('', null).optional(),
            then: Joi.string().required(),
        }),
    serviceType: Joi.string().allow('', null).optional(),
})
const API_END_POINTS = {
    assignRole: `${CONSTANTS.HTTPS_HOST}/api/user/private/v1/assign/role`,
    createUser: `${CONSTANTS.HTTPS_HOST}/api/user/v3/create`,
    migrateUser: `${CONSTANTS.SB_EXT_API_BASE_2}/user/v1/migrate`,
    msg91ResendOtp: `https://control.msg91.com/api/v5/otp/retry`,
    msg91SendOtp: `https://control.msg91.com/api/v5/otp`,
    msg91VerifyOtp: `https://control.msg91.com/api/v5/otp/verify`,
    profileUpdate: `${CONSTANTS.HTTPS_HOST}/api/user/private/v1/update`,
    userSearch: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
}
const registrationSource = 'Self Registration'
const getUserDesignationFromRole = {
    // tslint:disable-next-line: all
    Faculty: 'ANM-Faculty-Bihar',
    'In Service': 'ANM-Bihar',
    // tslint:disable-next-line: all
    Student: 'ANM-Student-Bihar',
}

const getDetailsAsPerRole = (userDetails: UserDetails) => {
    let designation: string
    let orgId: string
    let orgName: string

    switch (userDetails.role) {
        case 'Student':
            // tslint:disable-next-line: all
            designation = 'ANM-Student-Bihar'
            orgId = '014005962721189888281'
            // tslint:disable-next-line: all
            orgName = 'Bihar Nursing Registration Council'
            break
        case 'Faculty':
            designation = 'ANM-Faculty-Bihar'
            orgId = '014005962721189888281'
            orgName = 'Bihar Nursing Registration Council'
            break
        case 'In Service':
            if (userDetails.roleForInService === 'Public Health Facility') {
                if (userDetails.publicFacilityType === 'GNM-Bihar' || userDetails.privateFacilityType === 'GNM-Bihar') {
                    designation = 'GNM-Bihar'
                } else {
                    designation = 'ANM-Bihar'
                }
                orgId = '01403709013603123234776'
                orgName = healthBihar
            } else if (userDetails.roleForInService === 'Private Health Facility') {
                if (userDetails.publicFacilityType === 'GNM-Bihar' || userDetails.privateFacilityType === 'GNM-Bihar') {
                    designation = 'GNM-Bihar'
                } else {
                    designation = 'ANM-Bihar'
                }
                orgId = '01403708858877542434777'
                orgName = 'Private (Bihar)'
            } else if (userDetails.roleForInService === 'CHO') {
                designation = 'CHO-Bihar'
                orgId = '01403709013603123234776'
                orgName = healthBihar
            } else if (userDetails.roleForInService === 'Staff Nurses') {
                designation = 'Staff-Nurse-Bihar'
                orgId = '01403709013603123234776'
                orgName = healthBihar
            }
            break
        default:
            designation = 'NA'
            orgId = 'NA'
            orgName = 'NA'
            break
    }

    return {
        designation,
        orgId,
        orgName,
    }
}
const indianCountryCode = '+91'
const msg91Headers = {
    // tslint:disable-next-line: all
    accept: 'application/json',
    authkey: CONSTANTS.MSG_91_AUTH_KEY_SSO,
    'content-type': 'application/json',
}
const standardDob = '01/01/1970'
const biharOrgName = 'Bihar Nursing Registration Council'
const accessDeniedMessage = 'Access denied! Please contact admin at help.ekshamata@gmail.com for support.'
// tslint:disable-next-line: all
const userSuccessRegistrationMessage = `Registration Successful! Kindly download e-Kshamata app - <a class="blue" target="_blank" href="https://bit.ly/E-kshamataApp">https://bit.ly/E-kshamataApp</a> and login using your given mobile number using OTP.`;

bnrcUserCreation.post('/createUser', async (req: Request, res: Response) => {
    const userJourneyStatus = {
        createAccount: 'failed',
        isUserMigrated: false,
        profileUpdate: 'failed',
        registrationSuccessMessage: 'failed',
        roleAssign: 'failed',
        userAlreadyExists: false,
        userExistingOrganisation: 'NA',
        validationStatus: 'success',
        validationStatusFailedReason: 'NA',
    }
    const userFormDetails = req.body.value.request.formValues
    try {
        const phone = userFormDetails.phone
        logInfo('Request body BNRC', JSON.stringify(userFormDetails))
        const preServiceData = userFormDetails
        // tslint:disable-next-line: no-any
        const result: any = serviceSchemaJoi.validate(preServiceData, { abortEarly: false })
        if (result.error) {
            userJourneyStatus.validationStatus = 'failed'
            userJourneyStatus.validationStatusFailedReason = JSON.stringify(result.error.message) || result.error.message
            await updateUserStatusInDatabase(userFormDetails, userJourneyStatus)
            return res.status(400).json({
                message: result.error.message,
                status: 'FAILED',
            })
        }
        const isUserExists = await getUserDetails(phone)
        if (isUserExists.message === 'success' && isUserExists.userDetails) {
            userJourneyStatus.userAlreadyExists = true
            // tslint:disable-next-line: all
            if (isUserExists.userDetails.rootOrgName == 'Bihar Nursing Registration Council' || isUserExists.userDetails.rootOrgName == healthBihar || isUserExists.userDetails.rootOrgName == 'Private (Bihar)') {
                userJourneyStatus.userExistingOrganisation = isUserExists.userDetails.rootOrgName
                const newUserOrg = getDetailsAsPerRole(userFormDetails).orgName
                if (isUserExists.userDetails.rootOrgName !== newUserOrg) {
                    await migrateUserToBnrc(isUserExists.userDetails, userFormDetails)
                    const roleAssignResponse = await assignRoleToUser(isUserExists.userDetails.id, userFormDetails)
                    userJourneyStatus.roleAssign = roleAssignResponse ? 'success' : 'failed'
                    userJourneyStatus.isUserMigrated = true
                }

                const profileUpdateResponse = await userProfileUpdate(userFormDetails, isUserExists.userDetails.id)
                userJourneyStatus.profileUpdate = profileUpdateResponse ? 'success' : 'failed'
                await updateUserStatusInDatabase(userFormDetails, userJourneyStatus)
                return res.status(200).json({
                    message: userSuccessRegistrationMessage,
                    status: 'SUCCESS',
                })
            } else if (isUserExists.userDetails.rootOrgName == 'aastrika' || isUserExists.userDetails.rootOrgName == 'SPhere Team 1') {
                const userMigrationStatus = await migrateUserToBnrc(isUserExists.userDetails, userFormDetails)
                const assignRoleResponseForAastrikaOrg = await assignRoleToUser(isUserExists.userDetails.id, userFormDetails)
                const profileUpdateResponse = await userProfileUpdate(userFormDetails, isUserExists.userDetails.id)
                userJourneyStatus.profileUpdate = profileUpdateResponse ? 'success' : 'failed'
                userJourneyStatus.isUserMigrated = true

                if (!userMigrationStatus || !assignRoleResponseForAastrikaOrg) {
                    userJourneyStatus.userExistingOrganisation = 'aastrika || SPhere Team 1'
                    await updateUserStatusInDatabase(userFormDetails, userJourneyStatus)
                    return res.status(400).json({
                        message: accessDeniedMessage,
                        status: 'FAILED',
                    })
                }
                userJourneyStatus.userExistingOrganisation = 'aastrika'
                await updateUserStatusInDatabase(userFormDetails, userJourneyStatus)
                return res.status(200).json({
                    message: userSuccessRegistrationMessage,
                    status: 'SUCCESS',
                })
            }
            userJourneyStatus.userExistingOrganisation = isUserExists.userDetails.rootOrgName
            await updateUserStatusInDatabase(userFormDetails, userJourneyStatus)
            return res.status(400).json({
                message: accessDeniedMessage,
                status: 'FAILED',
            })

        } else if (isUserExists.message == 'failed') {
            await updateUserStatusInDatabase(userFormDetails, userJourneyStatus)
            return res.status(400).json({
                message: accessDeniedMessage,
                status: 'FAILED',
            })
        }
        // Step 1 Create user
        const createUserResponse = await createUser(userFormDetails)
        if (!createUserResponse.userId) {
            return res.status(400).json({
                message: accessDeniedMessage,
                status: 'FAILED',
                userJourneyStatus,
            })
        }
        logInfo('createUserResponse', JSON.stringify(createUserResponse))
        if (createUserResponse.userId) {
            userJourneyStatus.createAccount = 'success'
        }
        const userId = createUserResponse.userId
        logInfo('userId create user', JSON.stringify(userId))
        // Step 2 Role Assign
        const assignRoleResponse = await assignRoleToUser(userId, userFormDetails)
        if (assignRoleResponse) {
            userJourneyStatus.roleAssign = 'success'
        }
        // Step 3 User Profile Update
        const userProfileUpdateResponse = await userProfileUpdate(userFormDetails, userId)
        logInfo('userProfileUpdateResponse', JSON.stringify(userProfileUpdateResponse))
        if (userProfileUpdateResponse) {
            userJourneyStatus.profileUpdate = 'success'
        }
        // Step 4 Send Success Response Message
        // const sendMessageResponse = await sendRegistrationMessage(phone)
        // if (sendMessageResponse) {
        userJourneyStatus.registrationSuccessMessage = 'success'
        // }
        // Step 5 Insert User Status in Database
        await updateUserStatusInDatabase(userFormDetails, userJourneyStatus)
        logInfo('User Journey Status', JSON.stringify(userJourneyStatus))
        const isUserJourneySucceess = Object.values(userJourneyStatus).some((status) => status === 'failed')
        if (isUserJourneySucceess) {
            await updateUserStatusInDatabase(userFormDetails, userJourneyStatus)
            return res.status(400).json({
                message: accessDeniedMessage,
                status: 'FAILED',
                userJourneyStatus,
            })
        }
        res.status(200).json({
            message: userSuccessRegistrationMessage,
            status: 'SUCCESS',
            userJourneyStatus,
        })
    } catch (error) {
        logInfo('BNRC user creation error')
        logInfo('User Journey Status', JSON.stringify(userJourneyStatus))
        logInfo('Error BNRC', JSON.stringify(error))
        await updateUserStatusInDatabase(userFormDetails, userJourneyStatus)
        res.status(400).json({
            message: accessDeniedMessage,
            status: 'FAILED',
        })
    }

})
bnrcUserCreation.post('/otp/sendOtp', async (req, res) => {
    const phone = req.body.phone || ''
    try {
        logInfo('Entered into Send OTP for BNRC >>>>>')
        logInfo('User request body send otp', JSON.stringify(req.body))
        if (!phone) {
            res.status(400).json({
                message: 'Mandatory parameters phone missing',
                status: 'error',
            })
        }
        await axios({
            headers: msg91Headers,
            params: {
                mobile: `${indianCountryCode}${phone}`,
                template_id: CONSTANTS.MSG_91_TEMPLATE_ID_SEND_OTP_SSO,
            },

            method: 'POST',
            url: API_END_POINTS.msg91SendOtp,
        })
        logInfo('SEND_OTP: OTP sent successfully for BNRC', JSON.stringify(req.body))
        return res.status(200).json({
            message: `OTP successfully sent on phone ${phone}`,
            status: 'success',
        })
    } catch (error) {
        logError('SEND_OTP: Error while send OTP for BNRC', JSON.stringify(error))
        return res.status(500).send({
            message: `OTP generation fail for phone ${phone}`,
            status: 'failed',
        })
    }
})
bnrcUserCreation.post('/otp/resendOtp', async (req, res) => {
    const phone = req.body.phone || ''
    try {
        logInfo('RESEND_OTP: Entered into Re-Send OTP for BNRC >>>>>', JSON.stringify(req.body))
        if (!phone) {
            return res.status(400).json({
                message: 'Mandatory parameters phone missing',
                status: 'error',
            })
        }
        logInfo('RESEND_OTP: SSO Resend OTP through phone', phone)
        await axios({
            headers: msg91Headers,
            params: {
                mobile: `${indianCountryCode}${phone}`,
                retrytype: 'text',
            },

            method: 'POST',
            url: API_END_POINTS.msg91ResendOtp,
        })

        return res.status(200).json({
            message: `OTP successfully re-sent on phone ${phone}`,
            status: 'success',
        })
    } catch (error) {
        logError('RESEND_OTP: Error while resend OTP for BNRC', JSON.stringify(error))
        return res.status(500).send({
            message: `OTP generation fail for phone ${phone}`,
            status: 'failed',
        })
    }
})
bnrcUserCreation.post('/otp/validateOtp', async (req, res) => {
    const { phone, otp } = req.body
    try {
        logInfo('VALIDATE_OTP: Entered into validate OTP for BNRC >>>>>', JSON.stringify(req.body))
        if (!phone || !otp) {
            res.status(400).json({
                message: 'Mandatory parameters phone or otp missing',
                status: 'error',
            })
        }
        const verifyOtpResponse = await axios({
            headers: msg91Headers,
            method: 'GET',
            params: {
                mobile: `${indianCountryCode}${phone}`,
                otp,
            },

            url: API_END_POINTS.msg91VerifyOtp,
        })
        logInfo('VALIDATE_OTP: Verify OTP response BNRC', JSON.stringify(verifyOtpResponse.data))
        if (verifyOtpResponse.data.type !== 'success') {
            return res.status(400).json({
                message: 'Phone OTP validation failed try again',
                status: 'failed',
            })
        }
        return res.status(200).json({
            message: verifyOtpResponse.data,
            status: 'success',
        })
    } catch (error) {
        logError('VALIDATE_OTP: Error while validate OTP for BNRC', JSON.stringify(error))
        return res.status(500).send({
            message: `OTP validation failed for phone ${phone}`,
            status: 'failed',
        })
    }
})
// const sendRegistrationMessage = async (phone: number) => {
//     try {
//         const messageBody = {
//             recipients: [
//                 {
//                     mobiles: `91${phone}`,
//                 },
//             ],
//             template_id: CONSTANTS.BNRC_MSG91_TEMPLATE_ID,

//         }
//         const sendMessageResponse = await axios({
//             data: messageBody,
//             headers: {
//                 authkey: CONSTANTS.MSG_91_AUTH_KEY_SSO,
//                 'content-type': 'application/JSON',
//             },
//             method: 'post',
//             url: 'https://control.msg91.com/api/v5/flow/',
//         })
//         if (sendMessageResponse.data.type == 'success') {
//             return true
//         }
//         return false
//     } catch (error) {
//         logError('Error while sending message to user', JSON.stringify(error))
//         return false
//     }
// }
const getUserDetails = async (phone: number) => {
    try {
        const userDetails = await axios({
            data: {
                request: {
                    filters: {
                        phone: phone.toString(),
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

const createUser = async (userDetails: UserDetails) => {
    try {
        logInfo('Create user bnrc body', JSON.stringify(userDetails))
        const userChannel = getDetailsAsPerRole(userDetails).orgName
        const userCreationData = {
            request: {
                channel: userChannel,
                firstName: userDetails.firstName,
                lastName: userDetails.lastName || userDetails.firstName,
                password: CONSTANTS.BNRC_USER_DEFAULT_PASSWORD,
                phone: JSON.stringify(userDetails.phone),
            },
        }
        const userCreationResponse = await axios({
            data: userCreationData,
            headers: {
                authorization: CONSTANTS.SB_API_KEY,
            },

            method: 'POST',
            url: API_END_POINTS.createUser,
        })
        if (userCreationResponse.data.result.userId) {
            return {
                message: 'success',
                userId: userCreationResponse.data.result.userId,
            }
        }
    } catch (error) {
        logError('Error while user creation', JSON.stringify(error))
        return {
            message: 'failed',
            userId: '',
        }
    }
}
const assignRoleToUser = async (userId: string, userDetails: UserDetails) => {
    try {
        const userRoleAssignData = {
            request: {
                organisationId: getDetailsAsPerRole(userDetails).orgId,
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
            return true
        }
    } catch (error) {
        logError('Error while assigning user role', JSON.stringify(error))
        return false
    }
}
// tslint:disable-next-line: all
const userProfileUpdate = async (user: UserDetails, userId: string) => {
    try {
        let userProfileUpdateData = {
            request: {
                firstName: user.firstName,
                lastName: user.lastName || user.firstName,
                profileDetails: {
                    preferences: {
                        language: 'hi',
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
                            dob: standardDob,
                            email: '',
                            firstname: '',
                            gender: '',
                            knownLanguages: [],
                            mobile: '',
                            postalAddress: `India, Bihar, Patna`,
                            regNurseRegMidwifeNumber: 'NA',
                            registrationSource,
                            surname: '',

                        },
                        professionalDetails: [
                            {
                                block: user.block || '',
                                bnrcRegistrationNumber: '',
                                completePostalAddress: '',
                                designation: getDetailsAsPerRole(user).designation,
                                doj: '',
                                facilityName: '',
                                facultyType: '',
                                hrmsId: '',
                                instituteName: '',
                                instituteType: '',
                                name: biharOrgName,
                                nameOther: '',
                                nin: user.nin || '',
                                orgType: 'Government',
                                privateFacilityType: '',
                                profession: 'Nurse',
                                professionOtherSpecify: '',
                                publicFacilityType: '',
                                qualification: '',
                                roleForInService: '',
                                serviceType: '',
                            },
                        ],
                        userId,
                    },
                },
                userId,
            },
        }
        if (user.role == 'Student') {
            userProfileUpdateData = {
                request: {
                    firstName: user.firstName,
                    lastName: user.lastName || user.firstName,
                    profileDetails: {
                        preferences: {
                            language: 'hi',
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

                                dob: standardDob,
                                email: user.email,
                                firstname: user.firstName,
                                gender: '',
                                knownLanguages: [],
                                mobile: JSON.stringify(user.phone),
                                postalAddress: `India, Bihar, ${user.district}`,
                                regNurseRegMidwifeNumber: 'NA',
                                registrationSource,
                                surname: user.lastName || user.firstName,

                            },
                            professionalDetails: [
                                {
                                    block: user.block || '',
                                    bnrcRegistrationNumber: user.bnrcRegistrationNumber,
                                    completePostalAddress: '',
                                    designation: getDetailsAsPerRole(user).designation,
                                    doj: '',
                                    facilityName: '',
                                    facultyType: '',
                                    hrmsId: user.hrmsId,
                                    instituteName: user.instituteName,
                                    instituteType: user.instituteType,

                                    name: biharOrgName,
                                    nameOther: '',
                                    nin: user.nin || '',
                                    orgType: 'Government',
                                    privateFacilityType: '',
                                    profession: 'Student',
                                    professionOtherSpecify: '',
                                    publicFacilityType: '',
                                    qualification: user.courseSelection,
                                    roleForInService: '',
                                    serviceType: user.serviceType || '',
                                },
                            ],
                            userId,
                        },
                    },
                    userId,
                },
            }
        }
        if (user.role == 'Faculty') {
            userProfileUpdateData = {
                request: {
                    firstName: user.firstName,
                    lastName: user.lastName || user.firstName,
                    profileDetails: {
                        preferences: {
                            language: 'hi',
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
                            id: `${userId}`,
                            personalDetails: {
                                dob: standardDob,
                                email: user.email,
                                firstname: user.firstName,
                                gender: '',
                                knownLanguages: [],
                                mobile: JSON.stringify(user.phone),
                                postalAddress: `India, Bihar, ${user.district}`,
                                regNurseRegMidwifeNumber: 'NA',
                                registrationSource,
                                surname: user.lastName || user.firstName,

                            },
                            professionalDetails: [
                                {
                                    block: user.block || '',
                                    bnrcRegistrationNumber: user.bnrcRegistrationNumber,
                                    completePostalAddress: '',
                                    designation: 'ANM-Faculty-Bihar',
                                    doj: '',
                                    facilityName: '',
                                    facultyType: user.facultyType,
                                    hrmsId: user.hrmsId,
                                    instituteName: user.instituteName,
                                    instituteType: user.instituteType,
                                    name: biharOrgName,
                                    nameOther: '',
                                    nin: user.nin || '',
                                    orgType: 'Government',
                                    privateFacilityType: '',
                                    profession: 'Faculty',
                                    professionOtherSpecify: '',
                                    publicFacilityType: '',
                                    qualification: user.courseSelection,
                                    roleForInService: '',
                                    serviceType: user.serviceType || '',
                                },
                            ],
                            userId: `${userId}`,
                        },
                    },
                    userId: `${userId}`,
                },
            }
        }

        // tslint:disable-next-line: all
        if (user.role == "In Service") {
            userProfileUpdateData = {
                request: {
                    firstName: user.firstName,
                    lastName: user.lastName || user.firstName,
                    profileDetails: {
                        preferences: {
                            language: 'hi',
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
                                dob: standardDob,
                                email: user.email,
                                firstname: user.firstName,
                                gender: '',
                                knownLanguages: [],
                                mobile: JSON.stringify(user.phone),
                                postalAddress: `India, Bihar, ${user.district}`,
                                regNurseRegMidwifeNumber: 'NA',
                                registrationSource,
                                surname: user.lastName || user.firstName,

                            },
                            professionalDetails: [
                                {
                                    block: user.block || '',
                                    bnrcRegistrationNumber: user.bnrcRegistrationNumber,
                                    completePostalAddress: '',
                                    designation: getDetailsAsPerRole(user).designation,
                                    doj: '',
                                    facilityName: user.facilityName || '',
                                    facultyType: '',
                                    hrmsId: user.hrmsId,
                                    instituteName: '',
                                    instituteType: '',
                                    name: getDetailsAsPerRole(user).orgName,
                                    nameOther: '',
                                    nin: user.nin || '',
                                    orgType: 'Government',
                                    privateFacilityType: user.privateFacilityType || '',
                                    profession: 'Nurse',
                                    professionOtherSpecify: '',
                                    publicFacilityType: user.publicFacilityType || '',
                                    qualification: '',
                                    roleForInService: user.roleForInService || '',
                                    serviceType: user.serviceType || '',
                                },
                            ],
                            userId,
                        },
                    },
                    userId,
                },
            }
        }
        await axios({
            data: userProfileUpdateData,
            headers: {
                authorization: CONSTANTS.SB_API_KEY,
            },
            method: 'PATCH',
            url: API_END_POINTS.profileUpdate,
        })
        return true
    } catch (error) {
        logError('Error while user profile update', JSON.stringify(error))
        return false
    }
}
const updateUserStatusInDatabase = async (userDetails: UserDetails, userJourneyStatus) => {
    const userDetailedStructure = {
        block: userDetails.block || '',
        bnrcRegistrationNumber: userDetails.bnrcRegistrationNumber || '',
        courseSelection: userDetails.courseSelection || '',
        createdOn: new Date(),
        designation: getDetailsAsPerRole(userDetails).designation || '',
        district: userDetails.district || '',
        email: userDetails.email || '',
        facilityName: userDetails.facilityName || '',
        facultyType: userDetails.facultyType || '',
        firstName: userDetails.firstName || '',
        hrmsId: userDetails.hrmsId || '',
        instituteName: userDetails.instituteName || '',
        instituteType: userDetails.instituteType || '',
        lastName: userDetails.lastName || '',
        nin: userDetails.nin || '',
        organisationId: getDetailsAsPerRole(userDetails).orgId || '',
        organisationName: getDetailsAsPerRole(userDetails).orgName || '',
        phone: userDetails.phone || '',
        privateFacilityType: userDetails.privateFacilityType || '',
        publicFacilityType: userDetails.publicFacilityType || '',
        registrationSource: 'Self Registration',
        role: userDetails.role || '',
        roleForInService: userDetails.roleForInService || '',
        serviceType: userDetails.serviceType || '',
    }

    const userFinalStatus = { ...userDetailedStructure, ...userJourneyStatus }

    const uniqueId = uuidv4()

    try {

        // PostgreSQL Insert (Dual-write for migration) - bnrc_registration_data_prod
        const pgQuery = `INSERT INTO bnrc_registration_data_prod (
            unique_id, block, bnrc_registration_number, course_selection, create_account, created_on,
            designation, district, email, facility_name, faculty_type, first_name, hrms_id,
            institute_name, institute_type, is_user_migrated, last_name, nin, organisation_id,
            organisation_name, phone, private_facility_type, profile_update, public_facility_type,
            registration_source, registration_success_message, role, role_assign, role_for_in_service,
            service_type, user_already_exists, user_existing_organisation, validation_status,
            validation_status_failed_reason, etl_updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35)
        ON CONFLICT (unique_id) DO NOTHING`

        const pgParams = [
            uniqueId,
            userFinalStatus.block,
            userFinalStatus.bnrcRegistrationNumber,
            userFinalStatus.courseSelection,
            userFinalStatus.createAccount || '',
            userFinalStatus.createdOn,
            userFinalStatus.designation,
            userFinalStatus.district,
            userFinalStatus.email,
            userFinalStatus.facilityName
                ? (typeof userFinalStatus.facilityName === 'object'
                    ? (userFinalStatus.facilityName.name
                        ? String(userFinalStatus.facilityName.name)
                        : JSON.stringify(userFinalStatus.facilityName))
                    : String(userFinalStatus.facilityName))
                : '',
            userFinalStatus.facultyType,
            userFinalStatus.firstName,
            userFinalStatus.hrmsId,
            userFinalStatus.instituteName,
            userFinalStatus.instituteType,
            String(Boolean(userFinalStatus.isUserMigrated)),
            userFinalStatus.lastName,
            userFinalStatus.nin
                ? (typeof userFinalStatus.nin === 'object'
                    ? (userFinalStatus.nin.nin
                        ? String(userFinalStatus.nin.nin)
                        : JSON.stringify(userFinalStatus.nin))
                    : String(userFinalStatus.nin))
                : '',
            userFinalStatus.organisationId,
            userFinalStatus.organisationName,
            String(userFinalStatus.phone || ''),
            userFinalStatus.privateFacilityType,
            userFinalStatus.profileUpdate || '',
            userFinalStatus.publicFacilityType,
            userFinalStatus.registrationSource,
            userFinalStatus.registrationSuccessMessage || '',
            userFinalStatus.role,
            userFinalStatus.roleAssign || '',
            userFinalStatus.roleForInService,
            userFinalStatus.serviceType,
            String(Boolean(userFinalStatus.userAlreadyExists)),
            userFinalStatus.userExistingOrganisation || '',
            userFinalStatus.validationStatus || '',
            userFinalStatus.validationStatusFailedReason || '',
            new Date(), // etl_updated_at - PostgreSQL will convert to timestamp with timezone
        ]

        try {
            const maxRetries = 2
            let retryCount = 0

            while (retryCount < maxRetries) {
                try {
                    logInfo(`PostgreSQL insert attempt ${retryCount + 1}/${maxRetries}`, uniqueId)
                    await pgPool.query(pgQuery, pgParams)
                    logInfo('PostgreSQL insert successful for BNRC registration>>>>', uniqueId)
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
        } catch (pgError) {
            logError('Unexpected error in PostgreSQL insert', JSON.stringify(pgError))
        }

        return true
    } catch (error) {
        logError('Error inserting into Cassandra', JSON.stringify(error))
        return false
    }
}

const migrateUserToBnrc = async (userDetails, userFormDetails) => {
    try {
        const migrateUserData = {
            request: {
                channel: getDetailsAsPerRole(userFormDetails).orgName,
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
        const userProfileDetails = userDetails.profileDetails
        const updatedProfessionalDetails = { ...userProfileDetails.profileReq.professionalDetails[0], ...userFormDetails }
        userProfileDetails.profileReq.professionalDetails[0] = updatedProfessionalDetails
        userProfileDetails.profileReq.personalDetails.postalAddress = `India, Bihar, ${userFormDetails.district}`
        userProfileDetails.profileReq.professionalDetails[0].designation = getUserDesignationFromRole[userFormDetails.role]
        const userProfileUpdateBody = {
            request: {
                profileDetails: userProfileDetails,
                userId: userDetails.id,
            },
        }
        await axios({
            data: userProfileUpdateBody,
            headers: {
                authorization: CONSTANTS.SB_API_KEY,
            },
            method: 'PATCH',
            url: API_END_POINTS.profileUpdate,
        })
        if (migrateUserResponse.data.result.response == 'success') {
            return true
        }
    } catch (error) {
        logError('Error while migrating user to BNRC org', JSON.stringify(error))
        return false
    }
}
