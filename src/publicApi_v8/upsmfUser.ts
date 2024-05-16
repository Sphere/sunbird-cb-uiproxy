/* eslint-disable */
import axios from 'axios'
import express, { Request, Response } from 'express'
import Joi from 'joi'
import { Collection, Db } from 'mongodb'
import { MongoClient } from 'mongodb'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'
import { logInfo } from '../utils/logger'
export const upsmfUserCreation = express.Router()

interface UserDetails {
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
    phone: number
    privateFacilityType?: string
    publicFacilityType?: string
    // tslint:disable-next-line: all
    roleForInService?: 'Public Health Facility' | 'Private Health Facility'
    // tslint:disable-next-line: all
    role: 'Student' | 'Faculty' | 'In Service',
    serviceType?: string
}

const serviceSchemaJoi = Joi.object({
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
            'any.only': 'Role must be either Student, Faculty',
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

})
const API_END_POINTS = {
    assignRole: `${CONSTANTS.HTTPS_HOST}/api/user/private/v1/assign/role`,
    createUser: `${CONSTANTS.HTTPS_HOST}/api/user/v3/create`,
    migrateUser: `${CONSTANTS.SB_EXT_API_BASE_2}/user/v1/migrate`,
    profileUpdate: `${CONSTANTS.HTTPS_HOST}/api/user/private/v1/update`,
    userSearch: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
}
const registrationSource = 'Self Registration'
const getUserDesignationFromRole = {
    // tslint:disable-next-line: all
    Faculty: 'ANM-Faculty-UP',
    // tslint:disable-next-line: all
    Student: 'ANM-Student-UP',
}

const getDetailsAsPerRole = (userDetails: UserDetails) => {
    let designation: string
    let orgId: string
    let orgName: string

    switch (userDetails.role) {
        case 'Student':
            // tslint:disable-next-line: all
            designation = 'ANM-Student-UP'
            orgId = '0138708679576535041037'
            // tslint:disable-next-line: all
            orgName = 'Department of Medical Education Education and Training'
            break
        case 'Faculty':
            designation = 'ANM-Faculty-UP'
            orgId = '0138708679576535041037'
            orgName = 'Department of Medical Education Education and Training'
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

const standardDob = '01/01/1970'
const upsmfOrgName = 'Department of Medical Education Education and Training'
const accessDeniedMessage = 'Access denied! Please contact admin at help.ekshamata@gmail.com for support.'
// tslint:disable-next-line: all
const userSuccessRegistrationMessage = `Registration Successful! Kindly download e-Kshamata app - <a class="blue" target="_blank" href="https://bit.ly/E-kshamataApp">https://bit.ly/E-kshamataApp</a> and login using your given mobile number using OTP.`;
const mongodbConnectionUri = CONSTANTS.MONGODB_URL
logInfo('Mongodb connection URL', mongodbConnectionUri)
const databaseName = 'bnrc'
const client = new MongoClient(mongodbConnectionUri, { useNewUrlParser: true, useUnifiedTopology: true })
let db: Db | null = null
async function connectToDatabase() {
    try {
        await client.connect()
        db = client.db(databaseName)
        logInfo('Successfully connected to mongodb')
    } catch (error) {
        logError('Error while connecting mongodb', JSON.stringify(error))
    }
}
connectToDatabase()

let userJourneyStatus
upsmfUserCreation.post('/createUser', async (req: Request, res: Response) => {
    try {
        const userFormDetails = req.body.value.request.formValues
        const phone = userFormDetails.phone
        logInfo('Request body UPSMF', JSON.stringify(userFormDetails))
        userJourneyStatus = {
            createAccount: 'failed',
            profileUpdate: 'failed',
            roleAssign: 'failed',
        }
        const preServiceData = userFormDetails
        // tslint:disable-next-line: no-any
        const result: any = serviceSchemaJoi.validate(preServiceData, { abortEarly: false })
        if (result.error) {
            return res.status(400).json({
                message: result.error.message,
                status: 'FAILED',
            })
        }
        const isUserExists = await getUserDetails(phone)
        if (isUserExists.message = 'success' && isUserExists.userDetails) {
            // tslint:disable-next-line: all
            if (isUserExists.userDetails.rootOrgName == 'Department of Medical Education Education and Training') {
                return res.status(200).json({
                    message: userSuccessRegistrationMessage,
                    status: 'SUCCESS',
                })
            } else if (isUserExists.userDetails.rootOrgName == 'aastrika') {
                const userMigrationStatus = await migrateUserToUpsmf(isUserExists.userDetails, userFormDetails)
                const assignRoleResponseForAastrikaOrg = await assignRoleToUser(isUserExists.userDetails.id, userFormDetails)
                if (!userMigrationStatus || !assignRoleResponseForAastrikaOrg) {
                    return res.status(400).json({
                        message: accessDeniedMessage,
                        status: 'FAILED',
                    })
                }
                return res.status(200).json({
                    message: userSuccessRegistrationMessage,
                    status: 'SUCCESS',
                })
            }
            return res.status(400).json({
                message: accessDeniedMessage,
                status: 'FAILED',
            })

        } else if (isUserExists.message == 'failed') {
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
        // Step 5 Insert User Status in Database
        await updateUserStatusInDatabase(userFormDetails)
        logInfo('User Journey Status', userJourneyStatus)
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
        logInfo('UPSMF user creation error')
        logInfo('User Journey Status', JSON.stringify(userJourneyStatus))
        logInfo('Error BNRC', JSON.stringify(error))
        res.status(400).json({
            message: accessDeniedMessage,
            status: 'FAILED',
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
                            postalAddress: `India, Bihar, Patna`,
                            regNurseRegMidwifeNumber: 'NA',
                            registrationSource,
                            surname: '',

                        },
                        professionalDetails: [
                            {
                                bnrcRegistrationNumber: '',
                                completePostalAddress: '',
                                designation: 'ANM-Bihar',
                                doj: '',
                                facilityName: '',
                                facultyType: '',
                                hrmsId: '',
                                instituteName: '',
                                instituteType: '',
                                name: upsmfOrgName,
                                nameOther: '',
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
                                    bnrcRegistrationNumber: user.bnrcRegistrationNumber,
                                    completePostalAddress: '',
                                    designation: 'ANM-Student-Bihar',
                                    doj: '',
                                    facilityName: '',
                                    facultyType: '',
                                    hrmsId: user.hrmsId,
                                    instituteName: user.instituteName,
                                    instituteType: user.instituteType,

                                    name: upsmfOrgName,
                                    nameOther: '',
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
                                    bnrcRegistrationNumber: user.bnrcRegistrationNumber,
                                    completePostalAddress: '',
                                    designation: 'ANM-Faculty-Bihar',
                                    doj: '',
                                    facilityName: '',
                                    facultyType: user.facultyType,
                                    hrmsId: user.hrmsId,
                                    instituteName: user.instituteName,
                                    instituteType: user.instituteType,
                                    name: upsmfOrgName,
                                    nameOther: '',
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
                                    bnrcRegistrationNumber: user.bnrcRegistrationNumber,
                                    completePostalAddress: '',
                                    designation: 'ANM-Bihar',
                                    doj: '',
                                    facilityName: user.facilityName || '',
                                    facultyType: '',
                                    hrmsId: user.hrmsId,
                                    instituteName: '',
                                    instituteType: '',
                                    name: upsmfOrgName,
                                    nameOther: '',
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
const updateUserStatusInDatabase = async (userDetails: UserDetails) => {
    const userDetailedStructure = {
        bnrcRegistrationNumber: userDetails.bnrcRegistrationNumber,
        courseSelection: userDetails.courseSelection,
        createdOn: new Date(),
        district: userDetails.district,
        email: userDetails.email,
        facilityName: userDetails.facilityName,
        facultyType: userDetails.facultyType,
        firstName: userDetails.firstName,
        hrmsId: userDetails.hrmsId,
        instituteName: userDetails.instituteName,
        instituteType: userDetails.instituteType,
        lastName: userDetails.lastName,
        organisationId: getDetailsAsPerRole(userDetails).orgId,
        organisationName: getDetailsAsPerRole(userDetails).orgName,
        phone: userDetails.phone,
        privateFacilityType: userDetails.privateFacilityType,
        publicFacilityType: userDetails.publicFacilityType,
        role: userDetails.role,
        roleForInService: userDetails.roleForInService,
        serviceType: userDetails.serviceType,
    }
    const userFinalStatus = { ...userDetailedStructure, ...userJourneyStatus }
    try {
        const collection: Collection = db.collection('user')
        await collection.insertOne(userFinalStatus)
        return true
    } catch (error) {
        return false
    }
}
const migrateUserToUpsmf = async (userDetails, userFormDetails) => {
    try {
        const migrateUserData = {
            request: {
                channel: upsmfOrgName,
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
        userProfileDetails.profileReq.personalDetails.postalAddress = `India, Uttar Pradesh, ${userFormDetails.district}`
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
