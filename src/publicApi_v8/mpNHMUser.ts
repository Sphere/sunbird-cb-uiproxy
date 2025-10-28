/* eslint-disable */
import axios from 'axios'
import cassandra from 'cassandra-driver'
import express, { Request, Response } from 'express'
import Joi from 'joi'
import { v4 as uuidv4 } from 'uuid'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'
import { logInfo } from '../utils/logger'
import { getDetailsAsPerRole, validRootOrgs } from '../utils/mpUtils'
export const mpNHMUserCreation = express.Router()
const dayjs = require('dayjs')
const { types } = cassandra

interface UserDetails {
    courseSelection?: string
    district: string
    email: string
    firstName: string
    facultyType?: string
    hrmsId: string
    instituteName?: string
    instituteType?: string
    lastName: string
    phone: number
    facilityName?: string
    facilityCode?: string
    block?: string
    ehrmsNumber?: string
    // tslint:disable-next-line: all
    role: 'Student' | 'Faculty' | 'ANM-MP' | 'CHO-MP',
    regNurseRegMidwifeNumber?: string
    employmentType?: string
    dob?: string
    facilityType?: string
    roleForInService?: 'Government' | 'Private'
    serviceType?: 'Regular' | 'Contractual' | 'Private'

}
const client = new cassandra.Client({
    contactPoints: [CONSTANTS.CASSANDRA_IP],
    keyspace: 'sunbird',
    localDataCenter: 'datacenter1',
})
const ERHMS_CODE_KEY = 'ERHMS-code'
const GOV_KEY = 'Government'
const serviceSchemaJoi = Joi.object({
    courseSelection: Joi.string()
        .when('role', {
            is: Joi.valid('Student'),
            otherwise: Joi.string().allow('', null).optional(),
            then: Joi.string().required(),
        })
        .messages({
            // tslint:disable-next-line: all
            'any.required': 'Course selection is required for Student and Faculty roles',
        }),
    district: Joi.string()
        .required()
        .messages({
            // tslint:disable-next-line: all
            'any.required': 'District is required',
        }),
    dob: Joi.string()
        .allow('', null)
        .optional()
        .messages({
            'string.base': 'Date of Birth must be a string',
        }),

    email: Joi.string().allow('', null).email().optional(),
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
    firstName: Joi.string()
        .required()
        .messages({
            // tslint:disable-next-line: all
            'any.required': 'First name is required',
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
    role: Joi.string()
        .valid('Student', 'Faculty', 'ANM-MP', 'CHO-MP')
        .required()
        .messages({
            // tslint:disable-next-line: all
            'any.only': 'Role must be either Student, Faculty, ANM-MP, or CHO-MP',
            'any.required': 'Role is required',
        }),
    // ✅ Newly Added Fields

    nursingRegistrationNumber: Joi.string().optional().messages({
        'any.required': 'Nursing Registration Number is required',
    }),

    employmentType: Joi.string().allow('', null).optional(),

    serviceType: Joi.string()
        .allow('', null)
        .optional()
        .messages({
            'string.base': 'Service type must be a string',
        }),


    hrmsId: Joi.string()
        .when('roleForInService', {
            is: GOV_KEY,
            otherwise: Joi.string().allow('', null).optional(),
            then: Joi.string().required(),
        })
        .pattern(/^\d{5,8}$/)
        .required()
        .messages({
            'any.required': 'EHRMS Number is required',
            'string.pattern.base': 'EHRMS Number must be 5–8 digits',
        }),

    block: Joi.string()
        .when('roleForInService', {
            is: GOV_KEY,
            otherwise: Joi.string().allow('', null).optional(),
            then: Joi.string().required(),
        })
        .messages({
            // tslint:disable-next-line: all
            'any.required': 'block is required',
        }),

    facilityCode: Joi.string()
        .when('roleForInService', {
            is: GOV_KEY,
            otherwise: Joi.string().allow('', null).optional(),
            then: Joi.string().required(),
        })
        .messages({
            // tslint:disable-next-line: all
            'any.required': 'Facility Code is required',
        }),
    facilityName: Joi.string().optional().messages({
        'any.required': 'Facility name is required',
    }),
    facilityType: Joi.string()
        .when('roleForInService', {
            is: GOV_KEY,
            otherwise: Joi.string().allow('', null).optional(),
            then: Joi.string().required(),
        })
        .messages({
            // tslint:disable-next-line: all
            'any.required': 'Facility Type is required',
        }),
    regNurseRegMidwifeNumber: Joi.string().optional().messages({
        'any.required': 'RNRM Number is required',
    }),
    roleForInService: Joi.string().optional().messages({
        'any.required': 'Role for In-Service is required',
    }),

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
    Faculty: 'ANM-Faculty-MP',
    // tslint:disable-next-line: all
    Student: 'ANM-Student-MP',
}

const standardDob = '01/01/1970'
const accessDeniedMessage = 'Access denied! Please contact admin at help.ekshamata@gmail.com for support.'
// tslint:disable-next-line: all
const userSuccessRegistrationMessage = `Registration Successful! Kindly download e-Kshamata app - <a class="blue" target="_blank" href="https://bit.ly/E-kshamataApp">https://bit.ly/E-kshamataApp</a> and login using your given mobile number using OTP.`;
const mongodbConnectionUri = CONSTANTS.MONGODB_URL
logInfo('Mongodb connection URL', mongodbConnectionUri)

const indianCountryCode = '+91'
const msg91Headers = {
    // tslint:disable-next-line: all
    accept: 'application/json',
    authkey: CONSTANTS.MSG_91_AUTH_KEY_SSO,
    'content-type': 'application/json',
}

mpNHMUserCreation.post('/createUser', async (req: Request, res: Response) => {
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
    try {
        const userFormDetails = req.body.value.request.formValues
        const phone = userFormDetails.phone
        logInfo('Request body MP', JSON.stringify(userFormDetails))
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
            // if (isUserExists.userDetails.rootOrgName == 'Department of Medical Education Education and Training') {
            //     userJourneyStatus.userExistingOrganisation = 'Bihar Nursing Registration Council || Health (Bihar) || Private (Bihar)'
            //     await updateUserStatusInDatabase(userFormDetails, userJourneyStatus)
            //     return res.status(200).json({
            //         message: userSuccessRegistrationMessage,
            //         status: 'SUCCESS',
            //     })
            // }
            if (validRootOrgs.includes(isUserExists.userDetails.rootOrgName)) {
                userJourneyStatus.userExistingOrganisation = isUserExists.userDetails.rootOrgName
                const newUserOrg = getDetailsAsPerRole(userFormDetails).orgName
                if (isUserExists.userDetails.rootOrgName !== newUserOrg) {
                    await migrateUserToMp(isUserExists.userDetails, userFormDetails)
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
                const userMigrationStatus = await migrateUserToMp(isUserExists.userDetails, userFormDetails)
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
        // Step 4 Insert User Status in Database
        await updateUserStatusInDatabase(userFormDetails, userJourneyStatus)
        logInfo('User Journey Status', JSON.stringify(userJourneyStatus))
        const isUserJourneySucceess = Object.values(userJourneyStatus).some((status) => status === 'failed')
        if (isUserJourneySucceess) {
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
        logInfo('MP user creation error')
        logInfo('User Journey Status', JSON.stringify(userJourneyStatus))
        logInfo('Error MP', JSON.stringify(error))
        res.status(400).json({
            message: accessDeniedMessage,
            status: 'FAILED',
        })
    }

})
mpNHMUserCreation.post('/otp/sendOtp', async (req, res) => {
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
        return res.status(200).json({
            message: `OTP successfully sent on phone ${phone}`,
            status: 'success',
        })
    } catch (error) {
        logInfo('Error in sending user OTP' + error)
        return res.status(500).send({
            message: `OTP generation fail for phone ${phone}`,
            status: 'failed',
        })
    }
})
mpNHMUserCreation.post('/otp/resendOtp', async (req, res) => {
    const phone = req.body.phone || ''
    try {
        logInfo('Entered into Re-Send OTP for BNRC >>>>>', req.body)
        if (!phone) {
            return res.status(400).json({
                message: 'Mandatory parameters phone missing',
                status: 'error',
            })
        }
        logInfo('SSO Resend OTP through phone', phone)
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
        return res.status(500).send({
            message: `OTP generation fail for phone ${phone}`,
            status: 'failed',
        })
    }
})
mpNHMUserCreation.post('/otp/validateOtp', async (req, res) => {
    const { phone, otp } = req.body
    try {
        logInfo('Entered into validate OTP for BNRC >>>>>', req.body)
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
        return res.status(500).send({
            message: `OTP validation failed for phone ${phone}`,
            status: 'failed',
        })
    }
})
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
        logInfo('Create user MP body', JSON.stringify(userDetails))
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
        const userOrgId = getDetailsAsPerRole(userDetails).orgId
        const userRoleAssignData = {
            request: {
                organisationId: userOrgId,
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
                            postalAddress: `India, Madhya Pradesh, ${user.district}`,
                            regNurseRegMidwifeNumber: 'NA',
                            registrationSource,
                            surname: '',

                        },
                        professionalDetails: [
                            {
                                [ERHMS_CODE_KEY]: '',
                                block: user?.block || '',
                                completePostalAddress: '',
                                designation: 'ANM-Student-MP',
                                doj: '',
                                facilityCode: '',
                                facilityName: '',
                                facilityType: '',
                                facultyType: '',
                                instituteName: '',
                                instituteType: '',
                                name: getDetailsAsPerRole(user).orgName,
                                nameOther: '',
                                orgType: 'Government',
                                profession: 'Nurse',
                                professionOtherSpecify: '',
                                qualification: '',
                                roleForInService: '',
                                serviceType: user?.serviceType || '',
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
                    profileDetails: {
                        preferences: {
                            language: 'hi',
                        },
                        profileReq: {
                            academics: [
                                {
                                    nameOfInstitute: user.instituteName,
                                    nameOfQualification: user.courseSelection,
                                    type: user.instituteType,
                                    yearOfPassing: '',
                                },
                            ],
                            id: userId,
                            personalDetails: {
                                dob: user?.dob,
                                email: user.email,
                                firstname: user.firstName,
                                gender: '',
                                knownLanguages: [],
                                mobile: JSON.stringify(user.phone),
                                postalAddress: `India, Madhya Pradesh, ${user.district}`,
                                regNurseRegMidwifeNumber: user?.regNurseRegMidwifeNumber || 'NA',
                                registrationSource,
                                surname: user.lastName || user.firstName,
                            },
                            professionalDetails: [
                                {
                                    [ERHMS_CODE_KEY]: user?.hrmsId || '',
                                    block: user?.block || '',
                                    completePostalAddress: '',
                                    designation: 'ANM-Student-MP',
                                    doj: '',
                                    facilityCode: user?.facilityCode || '',
                                    facilityName: user?.facilityName || '',
                                    facilityType: user?.facilityType || '',
                                    facultyType: '',
                                    instituteName: user?.instituteName || '',
                                    instituteType: user?.instituteType || '',
                                    name: getDetailsAsPerRole(user).orgName,
                                    nameOther: '',
                                    orgType: 'Government',
                                    profession: 'Student',
                                    professionOtherSpecify: '',
                                    qualification: user?.courseSelection,
                                    roleForInService: user?.roleForInService || '',
                                    serviceType: user?.serviceType || '',
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
                                dob: user?.dob,
                                email: user.email,
                                firstname: user.firstName,
                                gender: '',
                                knownLanguages: [],
                                mobile: JSON.stringify(user.phone),
                                postalAddress: `India, Madhya Pradesh, ${user.district}`,
                                regNurseRegMidwifeNumber: user?.regNurseRegMidwifeNumber || 'NA',
                                registrationSource,
                                surname: user.lastName || user.firstName,

                            },
                            professionalDetails: [
                                {
                                    [ERHMS_CODE_KEY]: user?.hrmsId || '',
                                    block: user?.block || '',
                                    completePostalAddress: '',
                                    designation: 'ANM-Faculty-MP',
                                    doj: '',
                                    facilityCode: user?.facilityCode || '',
                                    facilityName: user?.facilityName || '',
                                    facilityType: user?.facilityType || '',
                                    facultyType: user?.facultyType,
                                    instituteName: user?.instituteName || '',
                                    instituteType: user?.instituteType || '',
                                    name: getDetailsAsPerRole(user).orgName,
                                    nameOther: '',
                                    orgType: 'Government',
                                    profession: 'Faculty',
                                    professionOtherSpecify: '',
                                    qualification: user.courseSelection,
                                    roleForInService: user?.roleForInService || '',
                                    serviceType: user?.serviceType || '',
                                },

                            ],
                            userId: `${userId}`,
                        },
                    },
                    userId: `${userId}`,
                },
            }
        }
        if (user.role == 'ANM-MP' || user.role == 'CHO-MP') {
            userProfileUpdateData = {
                request: {
                    profileDetails: {
                        preferences: {
                            language: 'hi',
                        },
                        profileReq: {
                            academics: [
                                {
                                    nameOfInstitute: user.instituteName,
                                    nameOfQualification: user.courseSelection,
                                    type: user.instituteType,
                                    yearOfPassing: '',
                                },
                            ],
                            id: userId,
                            personalDetails: {
                                dob: user?.dob,
                                email: user.email,
                                firstname: user.firstName,
                                gender: '',
                                knownLanguages: [],
                                mobile: JSON.stringify(user.phone),
                                postalAddress: `India, Madhya Pradesh, ${user.district}`,
                                regNurseRegMidwifeNumber: user?.regNurseRegMidwifeNumber || 'NA',
                                registrationSource,
                                surname: user.lastName || user.firstName,
                            },
                            professionalDetails: [
                                {
                                    [ERHMS_CODE_KEY]: user?.hrmsId || '',
                                    block: user?.block || '',
                                    completePostalAddress: '',
                                    designation: getDetailsAsPerRole(user).designation,
                                    doj: '',
                                    facilityCode: user?.facilityCode || '',
                                    facilityName: user?.facilityName || '',
                                    facilityType: user?.facilityType || '',
                                    facultyType: user?.facultyType || '',
                                    instituteName: '',
                                    instituteType: '',
                                    name: getDetailsAsPerRole(user).orgName,
                                    nameOther: '',
                                    orgType: 'Government',
                                    profession: getDetailsAsPerRole(user).designation,
                                    professionOtherSpecify: '',
                                    qualification: '',
                                    roleForInService: user?.roleForInService || '',
                                    serviceType: user?.serviceType || '',
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
        [ERHMS_CODE_KEY]: userDetails.hrmsId || '',
        block: userDetails?.block || '',
        courseSelection: userDetails.courseSelection || '',
        createdOn: new Date(),
        designation: getDetailsAsPerRole(userDetails).designation || '',
        district: userDetails.district || '',
        dob: userDetails?.dob
            ? types.LocalDate.fromString(dayjs(userDetails.dob).format('YYYY-MM-DD'))
            : null,
        email: userDetails.email || '',
        facilityCode: userDetails?.facilityCode || '',
        facilityName: userDetails?.facilityName || '',
        facilityType: userDetails.facilityType || '',
        facultyType: userDetails.facultyType || '',
        firstName: userDetails.firstName || '',
        instituteName: userDetails.instituteName || '',
        instituteType: userDetails.instituteType || '',
        lastName: userDetails.lastName || '',
        organisationId: getDetailsAsPerRole(userDetails).orgId,
        organisationName: getDetailsAsPerRole(userDetails).orgName,
        phone: String(userDetails.phone || ''),
        regNurseRegMidwifeNumber: userDetails?.regNurseRegMidwifeNumber || 'NA',
        registrationSource: 'Self Registration',
        role: userDetails.role || '',
        roleForInService: userDetails?.roleForInService || '',
        serviceType: userDetails?.serviceType || '',
        ...userJourneyStatus,
    }
    logError('User detailed structure for cassandra', JSON.stringify(userDetailedStructure))
    const query = `
        INSERT INTO sunbird.mp_registration_data (
            unique_id, course_selection, create_account, created_on, designation, district, dob, email, facility_name, facility_code, facility_type,
            faculty_type, first_name, erhms_code, institute_name, institute_type, is_user_migrated, last_name,
            organisation_id, organisation_name, phone, regNurseRegMidwifeNumber, role, roleForInService, service_type, block, profile_update, registration_source,
            registration_success_message, role_assign,
            user_already_exists, user_existing_organisation, validation_status,
            validation_status_failed_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `

    const params = [
        types.Uuid.fromString(uuidv4()),

        String(userDetailedStructure.courseSelection || ''),   // course_selection
        String(userDetailedStructure.createAccount || ''),     // create_account
        userDetailedStructure.createdOn,                       // created_on
        String(userDetailedStructure.designation || ''),       // designation
        String(userDetailedStructure.district || ''),          // district
        String(userDetailedStructure.dob || ''),               // dob
        String(userDetailedStructure.email || ''),             // email
        String(userDetailedStructure.facilityName || ''),      // facility_name
        String(userDetailedStructure.facilityCode || ''),      // facility_code
        String(userDetailedStructure.facilityType || ''),      // facility_type
        String(userDetailedStructure.facultyType || ''),       // faculty_type
        String(userDetailedStructure.firstName || ''),         // first_name
        String(userDetailedStructure[ERHMS_CODE_KEY] || ''),     // ERHMS-code
        String(userDetailedStructure.instituteName || ''),     // institute_name
        String(userDetailedStructure.instituteType || ''),     // institute_type
        Boolean(userDetailedStructure.isUserMigrated || false), // migrate_user
        String(userDetailedStructure.lastName || ''),          // last_name
        userDetailedStructure.organisationId,
        userDetailedStructure.organisationName,

        String(userDetailedStructure.phone || ''),             // phone
        String(userDetailedStructure.regNurseRegMidwifeNumber || ''), // regNurseRegMidwifeNumber
        String(userDetailedStructure.role || ''),              // role
        String(userDetailedStructure.roleForInService || ''),  // roleForInService
        String(userDetailedStructure.serviceType || ''),       // serviceType
        String(userDetailedStructure.block || ''),             // block
        String(userDetailedStructure.profileUpdate || ''),     // profile_update
        String(userDetailedStructure.registrationSource || ''), // registration_source
        String(userDetailedStructure.registrationSuccessMessage || ''), // registration_success_message
        String(userDetailedStructure.roleAssign || ''),        // role_assign
        Boolean(userDetailedStructure.userAlreadyExists || false), // user_already_exists
        String(userDetailedStructure.userExistingOrganisation || ''), // user_existing_organisation
        String(userDetailedStructure.validationStatus || ''),  // validation_status
        String(userDetailedStructure.validationStatusFailedReason || ''), // validation_status_failed_reason
    ]

    try {
        await client.execute(query, params, { prepare: true })
        return true
    } catch (error) {
        logError('Cassandra insert error', JSON.stringify(error))
        return false
    }
}

const migrateUserToMp = async (userDetails, userFormDetails) => {
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
        userProfileDetails.profileReq.personalDetails.postalAddress = `India, , ${userFormDetails.district}`
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
        logError('Error while migrating user to MP org', JSON.stringify(error))
        return false
    }
}
