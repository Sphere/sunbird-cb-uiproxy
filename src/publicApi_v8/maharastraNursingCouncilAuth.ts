/* tslint:disable */
/* tslint:disable:no-console no-any function-length */
import axios from 'axios'
import express, { Response } from 'express'
import jwt from 'jsonwebtoken'
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
    migrateUser: `${CONSTANTS.SB_EXT_API_BASE_2}/user/v1/migrate`,
    assignRole: `${CONSTANTS.HTTPS_HOST}/api/user/private/v1/assign/role`,
    userSearch: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
}

/** Error message shown when the user belongs to an org outside the allowed list. */
const userOtherText = `User already exist on the Sphere platform. Please log in using your email ID. For any queries, please contact: support@aastrika.org`

export const maharastraNursingCouncilAuth = express.Router()

/**
 * Creates a new SPhere user under the Maharashtra Nursing Council channel.
 * Uses email as the primary identifier; falls back to phone if email is absent.
 * After creation, assigns the PUBLIC role and updates the user profile.
 *
 * @param mncUserData - Normalised user data extracted from the MNC JWT payload.
 */
const handleNewUserRegistration = async (mncUserData) => {
    logInfo('[MNC] handleNewUserRegistration: start | email:', mncUserData.email, '| phone:', mncUserData.mobile)
    const randomPassword = generateRandomPassword(8, {
        digits: true,
        lowercase: true,
        symbols: true,
        uppercase: true,
    })
    const trimmedName = mncUserData.name.trim()
    const [firstName, ...rest] = trimmedName.split(' ')
    const lastName = rest.length ? rest.join(' ') : firstName

    logInfo('[MNC] handleNewUserRegistration: creating user | firstName:', firstName, '| lastName:', lastName,
        '| hasPhone:', String(!!mncUserData.mobile), '| hasEmail:', String(!!mncUserData.email))

    const responseCreateUser = await axios({
        ...axiosRequestConfig,
        data: {
            request: {
                channel: 'Maharashtra Nursing Council',
                firstName,
                lastName,
                password: randomPassword,
                ...(mncUserData.mobile
                    ? { phone: mncUserData.mobile, phoneVerified: true }
                    : { email: mncUserData.email }),
                tcStatus: false,
            },
        },
        headers: { Authorization: CONSTANTS.SB_API_KEY },
        method: 'POST',
        url: API_END_POINTS.createUser,
    })
    const newUserId = responseCreateUser.data.result.userId
    logInfo('[MNC] handleNewUserRegistration: user created | userId:', newUserId)

    // Assign PUBLIC role so the user can access the platform
    await assignRoleToUser(newUserId)

    // Populate the extended profile (personal details, academics, professional info)
    await userProfileUpdate(axiosRequestConfig, newUserId, mncUserData)
    logInfo('[MNC] handleNewUserRegistration: done | userId:', newUserId)
}

/**
 * Handles an existing SPhere user logging in via MNC SSO.
 * Migrates the user's org to Maharashtra Nursing Council if they currently
 * belong to `aastrika` or `SPhere Team 1`, then updates their profile.
 *
 * @param existingUser  - Result object from getUserDetails containing `userDetails`.
 * @param mncUserData   - Normalised user data extracted from the MNC JWT payload.
 */
const handleExistingUserMigration = async (existingUser, mncUserData) => {
    const existingUserResult = existingUser.userDetails
    const org = existingUserResult.rootOrgName
    const userId = existingUserResult.userId
    logInfo('[MNC] handleExistingUserMigration: start | userId:', userId, '| org:', org, '| email:', mncUserData.email)

    if (['aastrika', 'SPhere Team 1'].includes(org)) {
        // Move user from their current org to the MNC org
        logInfo('[MNC] handleExistingUserMigration: migrating org to MNC | userId:', userId)
        await migrateUserToMNC(existingUserResult)
        await assignRoleToUser(existingUserResult.id)
        logInfo('[MNC] handleExistingUserMigration: org migration done | userId:', userId)
    } else {
        logInfo('[MNC] handleExistingUserMigration: org migration skipped (already MNC) | userId:', userId)
    }

    // Always sync the latest profile data from MNC
    await userProfileUpdate(axiosRequestConfig, userId, mncUserData, existingUser)
    logInfo('[MNC] handleExistingUserMigration: done | userId:', userId)
}

/**
 * POST /maharastraNursingCouncil/login
 *
 * JWT-based SSO entry point for the Maharashtra Nursing Council portal.
 * The MNC portal signs a short-lived HS256 JWT with a shared secret.
 * This route verifies the token, then creates or migrates the user in
 * SPhere and establishes a Keycloak session.
 *
 * Flow:
 *   1. Verify JWT signature and expiry using MNC_JWT_SECRET.
 *   2. Look up the user by phone first, then email.
 *   3. Fetch full user details using whichever identifier matched.
 *   4. Block login if the user belongs to an unrelated org.
 *   5. Create (new user) or migrate/update (existing user).
 *   6. Generate a Keycloak access token and set the session.
 */
// tslint:disable-next-line: no-any
maharastraNursingCouncilAuth.post('/login', async (req: any, res: Response) => {
    logInfo('[MNC] /login: request received')
    try {
        const { userToken } = req.body
        if (!userToken) {
            logError('[MNC] /login: userToken missing in request body')
            return res.status(400).json({ message: 'userToken is required', status: 'error' })
        }

        const secret = CONSTANTS.MNC_JWT_SECRET
        if (!secret) {
            logError('[MNC] /login: MNC_JWT_SECRET env var is not configured')
            return res.status(500).json({ message: 'Server misconfiguration', status: 'error' })
        }

        // Step 1: Verify and decode the JWT signed by MNC portal.
        // jwt.verify rejects expired tokens automatically via the `exp` claim.
        let jwtPayload: any
        try {
            jwtPayload = jwt.verify(userToken, secret, { algorithms: ['HS256'] })
            logInfo('[MNC] /login: JWT verified successfully')
        } catch (err) {
            logError('[MNC] /login: JWT verification failed |', err.message)
            return res.status(401).json({ message: AUTH_FAIL, status: 'error' })
        }

        const { firstName, lastName, email, phone, rmNumber, designation, uuid } = jwtPayload
        logInfo('[MNC] /login: JWT payload extracted | email:', email,
            '| phone:', phone ? 'present' : 'absent',
            '| rmNumber:', rmNumber || 'absent',
            '| designation:', designation || 'absent',
            '| uuid:', uuid || 'absent')

        if (!email && !phone) {
            logError('[MNC] /login: both email and phone missing in JWT payload')
            return res.status(400).json({ message: 'Email or phone is required in token payload.', status: 'error' })
        }

        // Normalise JWT fields to the internal shape expected by all helpers
        const mncUserData = {
            name: `${firstName || ''} ${lastName || ''}`.trim(),
            email,
            mobile: phone || '',
            rmnumber: rmNumber || '',
            designation: designation || '',
            uuid: uuid || '',
            dob: '',
        }

        // Step 2: Check user existence — phone takes priority over email
        let foundByPhone = false
        let userExists = false

        if (phone) {
            logInfo('[MNC] /login: checking existence by phone')
            const phoneExists = await fetchUserBymobileorEmail(phone, 'phone')
            logInfo('[MNC] /login: phone lookup result:', phoneExists)
            if (phoneExists) {
                foundByPhone = true
                userExists = true
            }
        }

        if (!userExists) {
            logInfo('[MNC] /login: checking existence by email:', email)
            const emailExists = await fetchUserBymobileorEmail(email, 'email')
            logInfo('[MNC] /login: email lookup result:', emailExists)
            if (emailExists) {
                userExists = true
            }
        }

        logInfo('[MNC] /login: user exists:', String(userExists), '| foundByPhone:', String(foundByPhone))

        // Step 3: Fetch full user details using the identifier that matched first
        const existingUserResult = foundByPhone
            ? await getUserDetails(phone, 'phone')
            : await getUserDetails(email)
        logInfo('[MNC] /login: getUserDetails result | message:', existingUserResult.message,
            '| hasUserDetails:', String(!!existingUserResult.userDetails))

        // Step 4: Block login if the user is registered under an unrelated org
        if (existingUserResult.message === 'success' && existingUserResult.userDetails) {
            const org = existingUserResult.userDetails.rootOrgName
            logInfo('[MNC] /login: existing user org:', org)
            if (!['Maharashtra Nursing Council', 'aastrika', 'SPhere Team 1'].includes(org)) {
                logError('[MNC] /login: user belongs to a different org, blocking login | org:', org, '| email:', email)
                return res.status(400).json({ message: userOtherText, status: 'FAILURE' })
            }
        }

        // Step 5: Create new user or migrate/update existing user
        if (!userExists) {
            logInfo('[MNC] /login: new user — proceeding with registration | email:', email)
            await handleNewUserRegistration(mncUserData)
        } else if (existingUserResult.userDetails) {
            logInfo('[MNC] /login: existing user — proceeding with migration/update | email:', email)
            await handleExistingUserMigration(existingUserResult, mncUserData)
        }

        // Step 6: Generate a Keycloak token using the MNC client (password grant)
        // Phone is the primary identifier; email is the fallback
        const keycloakUsername = phone || email
        logInfo('[MNC] /login: generating Keycloak token | username identifier:', phone ? 'phone' : 'email')
        const encodedData = qs.stringify({
            client_id: 'MNC',
            client_secret: CONSTANTS.KEYCLOAK_CLIENT_SECRET_MNC,
            grant_type: 'password',
            scope: 'offline_access',
            username: keycloakUsername,
        })

        const authTokenResponse = await axios({
            ...axiosRequestConfig,
            data: encodedData,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            method: 'POST',
            url: API_END_POINTS.generateToken,
        })

        if (authTokenResponse.data) {
            const accessToken = authTokenResponse.data.access_token
            // tslint:disable-next-line: no-any
            const decodedToken: any = jwt_decode(accessToken)
            // Keycloak encodes userId as the last segment of the `sub` claim (e.g. "f:uuid:userId")
            const decodedTokenArray = decodedToken.sub.split(':')
            const userId = decodedTokenArray[decodedTokenArray.length - 1]
            logInfo('[MNC] /login: Keycloak token generated | userId:', userId)

            req.session.userId = userId
            req.kauth = {
                grant: { access_token: { content: decodedToken, token: accessToken } },
            }
            req.session.grant = {
                access_token: { content: decodedToken, token: accessToken },
            }

            // Load roles into session so downstream middleware can authorise requests
            await getCurrentUserRoles(req, accessToken)
            logInfo('[MNC] /login: session set, user roles loaded | userId:', userId)
        } else {
            logError('[MNC] /login: Keycloak token response empty | email:', email)
            return res.status(302).json({ msg: AUTH_FAIL, status: 'error' })
        }

        logInfo('[MNC] /login: login successful | email:', email)
        res.status(200).json({ message: 'success' })
    } catch (error) {
        logError('[MNC] /login: unhandled error |', error.message)
        res.status(400).json({ msg: AUTH_FAIL, message: 'error' })
    }
})

/**
 * Checks whether a user with the given email or phone already exists in SPhere.
 * Uses the lightweight existence-check endpoint (returns boolean, no full profile).
 *
 * @param searchValue - The email address or phone number to look up.
 * @param searchType  - `'email'` or `'phone'`.
 * @returns `true` if the user exists, `false` / `undefined` otherwise.
 */
const fetchUserBymobileorEmail = async (searchValue: string, searchType: string) => {
    logInfo('[MNC] fetchUserBymobileorEmail: searching by', searchType, '| value:', searchValue)
    try {
        const response = await axios({
            ...axiosRequestConfig,
            headers: { Authorization: CONSTANTS.SB_API_KEY },
            method: 'GET',
            url: searchType === 'email'
                ? API_END_POINTS.fetchUserByEmail + searchValue
                : API_END_POINTS.fetchUserByMobileNo + searchValue,
        })
        if (response.data.responseCode === 'OK') {
            const exists = _.get(response, 'data.result.exists')
            logInfo('[MNC] fetchUserBymobileorEmail: result | exists:', exists)
            return exists
        }
        logInfo('[MNC] fetchUserBymobileorEmail: unexpected responseCode:', response.data.responseCode)
    } catch (err) {
        logError('[MNC] fetchUserBymobileorEmail: failed | searchType:', searchType, '| error:', err.message)
    }
}

/**
 * Updates the extended profile of a SPhere user with the latest data from MNC.
 * Preserves existing academics, professional details, preferences, and postal
 * address when they are already set — only overwrites personal contact fields.
 *
 * @param axiosRequestConfig - Shared axios config (timeout, etc.).
 * @param userId             - SPhere user ID to update.
 * @param mncUserData        - Normalised user data from the MNC JWT payload.
 * @param existingUser       - (Optional) existing user record used to preserve prior profile data.
 */
const userProfileUpdate = async (axiosRequestConfig, userId, mncUserData, existingUser?) => {
    logInfo('[MNC] userProfileUpdate: start | userId:', userId)
    const trimmedName = mncUserData.name.trim()
    const parts = trimmedName.split(' ')
    let firstName: string, lastName: string

    if (parts.length > 1) {
        firstName = parts[0]
        lastName = parts.slice(1).join(' ')
    } else {
        firstName = lastName = trimmedName
    }

    // Read existing nested objects — all are spread first so unknown keys are never dropped
    const existingProfileDetails = _.get(existingUser, 'userDetails.profileDetails') || {}
    const existingProfileReq = existingProfileDetails.profileReq || {}
    const existingPersonalDetails = existingProfileReq.personalDetails || {}

    // Merge personal details: spread existing first, then overlay only MNC-provided fields
    const personalDetails = {
        ...existingPersonalDetails,
        ...(mncUserData.email && { email: mncUserData.email, primaryEmail: mncUserData.email }),
        ...(mncUserData.mobile && { phone: mncUserData.mobile, mobile: mncUserData.mobile }),
        ...(firstName && { firstname: firstName }),
        ...(lastName && { surname: lastName }),
        ...(mncUserData.rmnumber && { regNurseRegMidwifeNumber: mncUserData.rmnumber.toString() }),
        postalAddress: existingPersonalDetails.postalAddress || 'India,Maharastra,Mumbai',
        dob: existingPersonalDetails.dob || mncUserData.dob || '01/01/2000',
    }

    // Merge professional details: spread existing first entry, overlay only MNC-provided fields;
    // all other entries and all other keys in the first entry are preserved untouched
    let professionalDetails: any[]
    if (existingProfileReq.professionalDetails && existingProfileReq.professionalDetails.length > 0) {
        professionalDetails = existingProfileReq.professionalDetails.map((detail: any, index: number) => {
            if (index !== 0) { return detail }
            return {
                ...detail,
                ...(mncUserData.designation && { designation: mncUserData.designation }),
                ...(mncUserData.uuid && { uuid: mncUserData.uuid }),
            }
        })
    } else {
        professionalDetails = [
            {
                profession: 'Healthcare Worker',
                designation: mncUserData.designation || 'ANM',
                orgType: 'Public/Government Sector',
                uuid: mncUserData.uuid || '',
            },
        ]
    }

    try {
        const result = await axios({
            ...axiosRequestConfig,
            data: {
                request: {
                    firstName,
                    lastName,
                    profileDetails: {
                        // Spread entire existing profileDetails so unknown top-level keys are kept
                        ...existingProfileDetails,
                        preferences: existingProfileDetails.preferences || { language: 'en' },
                        profileReq: {
                            // Spread entire existing profileReq so unknown keys are kept
                            ...existingProfileReq,
                            academics: existingProfileReq.academics || [
                                {
                                    nameOfInstitute: '',
                                    nameOfQualification: '',
                                    type: 'GRADUATE',
                                    yearOfPassing: '',
                                },
                            ],
                            id: userId,
                            personalDetails,
                            professionalDetails,
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
        if (result.data.result.response === 'SUCCESS') {
            logInfo('[MNC] userProfileUpdate: success | userId:', userId)
            return result.data
        }
        logError('[MNC] userProfileUpdate: unexpected response | userId:', userId, '| response:', result.data.result.response)
    } catch (error) {
        logError('[MNC] userProfileUpdate: failed | userId:', userId, '| error:', error.message)
    }
}

/**
 * Moves an existing user's organisation to Maharashtra Nursing Council.
 * Uses `forceMigration: true` to override the current org assignment and
 * `softDeleteOldOrg: true` to retain history in the previous org.
 *
 * @param userDetails - The user's SPhere record (must include `userId`).
 * @returns `true` on success, `false` if the API call fails.
 */
const migrateUserToMNC = async (userDetails) => {
    logInfo('[MNC] migrateUserToMNC: start | userId:', userDetails.userId)
    try {
        const migrateUserResponse = await axios({
            data: {
                request: {
                    channel: 'Maharashtra Nursing Council',
                    forceMigration: true,
                    notifyMigration: false,
                    softDeleteOldOrg: true,
                    userId: userDetails.userId,
                },
            },
            headers: {
                'X-Authenticated-User-Token': '',
                authorization: CONSTANTS.SB_API_KEY,
            },
            method: 'PATCH',
            url: API_END_POINTS.migrateUser,
        })
        if (migrateUserResponse.data.result.response == 'success') {
            logInfo('[MNC] migrateUserToMNC: success | userId:', userDetails.userId)
            return true
        }
        logError('[MNC] migrateUserToMNC: unexpected response | userId:', userDetails.userId,
            '| response:', migrateUserResponse.data.result.response)
    } catch (error) {
        logError('[MNC] migrateUserToMNC: failed | userId:', userDetails.userId, '| error:', error.message)
        return false
    }
}

/**
 * Assigns the PUBLIC role to a user within the MNC organisation.
 * Called both on new user creation and after an org migration.
 *
 * @param userId - SPhere user ID to assign the role to.
 */
const assignRoleToUser = async (userId: string) => {
    logInfo('[MNC] assignRoleToUser: start | userId:', userId)
    try {
        const roleAssignResponse = await axios({
            data: {
                request: {
                    organisationId: '014337234065121280397',
                    roles: ['PUBLIC'],
                    userId,
                },
            },
            headers: { authorization: CONSTANTS.SB_API_KEY },
            method: 'POST',
            url: API_END_POINTS.assignRole,
        })
        if (roleAssignResponse.data.result.response == 'SUCCESS') {
            logInfo('[MNC] assignRoleToUser: success | userId:', userId)
            return roleAssignResponse.data
        }
        logError('[MNC] assignRoleToUser: unexpected response | userId:', userId,
            '| response:', roleAssignResponse.data.result.response)
    } catch (error) {
        logError('[MNC] assignRoleToUser: failed | userId:', userId, '| error:', error.message)
        return false
    }
}

/**
 * Fetches the full SPhere user record by email or phone using the user-search API.
 *
 * @param searchValue - The email address or phone number to search for.
 * @param searchType  - `'email'` (default) or `'phone'`.
 * @returns `{ message: 'success', userDetails: <record> }` when found,
 *          `{ message: 'success', userDetails: '' }` when not found,
 *          `{ message: 'failed' }` on error.
 */
const getUserDetails = async (searchValue: string, searchType: 'email' | 'phone' = 'email') => {
    logInfo('[MNC] getUserDetails: searching by', searchType, '| value:', searchValue)
    try {
        const userDetails = await axios({
            data: {
                request: {
                    filters: { [searchType]: searchValue },
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
        const found = userDetails.data.result.response.content.length > 0
        logInfo('[MNC] getUserDetails: result | found:', String(found), '| searchType:', searchType)
        if (found) return { message: 'success', userDetails: userDetails.data.result.response.content[0] }
        return { message: 'success', userDetails: '' }
    } catch (error) {
        logError('[MNC] getUserDetails: failed | searchType:', searchType, '| value:', searchValue, '| error:', error.message)
        return { message: 'failed' }
    }
}
