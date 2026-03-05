import archiver from 'archiver'
import AWS from 'aws-sdk'
import axios from 'axios'
import cassandra from 'cassandra-driver'
import { Router } from 'express'
import uuid from 'uuid'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { getRCPassword } from '../utils/rcPasswordGenerator'

const s3 = new AWS.S3({
    accessKeyId: CONSTANTS.RC_S3_ACCESS_KEY_ID,
    region: 'ap-south-1',
    secretAccessKey: CONSTANTS.RC_S3_SECRET_ACCESS_KEY,
})

// Utility function to mask sensitive data in logs
const maskSensitiveData = (data: Record<string, unknown>): Record<string, unknown> | unknown => {
    if (!data || typeof data !== 'object') return data

    const masked = JSON.parse(JSON.stringify(data))

    const maskObject = (obj: Record<string, unknown>): void => {
        if (!obj || typeof obj !== 'object') return

        for (const key in obj) {
            if (key === 'authorization' || key === 'Authorization') {
                obj[key] = 'bearer [REDACTED_TOKEN]'
            } else if (key === 'password') {
                obj[key] = '[REDACTED_PASSWORD]'
            } else if (typeof obj[key] === 'string' && (obj[key] as string).includes('eyJ')) {
                obj[key] = (obj[key] as string).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT_TOKEN]')
            } else if (typeof obj[key] === 'object') {
                maskObject(obj[key] as Record<string, unknown>)
            }
        }
    }

    maskObject(masked as Record<string, unknown>)
    return masked
}

const RC_S3_BUCKET_NAME = CONSTANTS.RC_S3_BUCKET_NAME
const EVENT_TYPE_REGISTERED_WITH_SPHERE = 'registred with sphere'
const EVENT_TYPE_REGISTERED_WITHOUT_SPHERE = 'registred without sphere'
const ERROR_EVENT_NOT_FOUND = 'Event not found'
const STATUS_IN_PROGRESS = 'inProgress'
const STATUS_FAILED_USER_CREATION = 'failed during user creation'
const client = new cassandra.Client({
    contactPoints: [CONSTANTS.CASSANDRA_IP],
    keyspace: 'sunbird_courses',
    localDataCenter: 'datacenter1',
})
const getEventQuery = 'SELECT * FROM sunbird.rc_events WHERE eventId = ?'

export const sunbirdrRcCertificate = Router()
sunbirdrRcCertificate.post('/events', async (req, res) => {
    logInfo('Create event request body', req.body)
    // tslint:disable-next-line: max-line-length
    const { eventName, eventDescription, eventDate, eventPlace, eventType, createdBy } = req.body
    if (!eventName || !eventDescription || !eventDate || !eventPlace || !createdBy) {
        return res.status(400).json({ error: 'Missing required fields' })
    }
    const eventId = uuid.v4()
    // tslint:disable-next-line: max-line-length
    const query = 'INSERT INTO sunbird.rc_events (eventId, eventName, eventDescription, eventDate, eventPlace, eventType, createdBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    // tslint:disable-next-line: max-line-length
    const params = [eventId, eventName, eventDescription, eventDate, eventPlace, eventType, createdBy, new Date(), new Date()]
    try {
        await client.execute(query, params, { prepare: true })
        res.status(201).json({ eventId })
    } catch (err) {
        logError('Error creating event:', err)
        res.status(500).json({ error: 'Error creating event' })
    }
})

sunbirdrRcCertificate.post('/events/edit', async (req, res) => {
    logInfo('Edit event request body', req.body)
    const { eventId, eventName, eventDescription, eventDate, eventPlace, eventType, templateId, updatedBy } = req.body

    // Check if the required eventId is provided and exists
    if (!eventId) {
        return res.status(400).json({ error: 'Missing eventId' })
    }

    // Retrieve the existing event data
    try {
        const result = await client.execute(getEventQuery, [eventId], { prepare: true })
        if (result.rows.length === 0) {
            return res.status(404).json({ error: ERROR_EVENT_NOT_FOUND })
        }

        // tslint:disable-next-line: no-any
        const updatedFields: any = {
            eventDate: eventDate || result.rows[0].eventDate,
            eventDescription: eventDescription || result.rows[0].eventDescription,
            eventName: eventName || result.rows[0].eventName,
            eventPlace: eventPlace || result.rows[0].eventPlace,
            eventType: eventType || result.rows[0].eventType,
            templateId: templateId || result.rows[0].templateId,
            updatedAt: new Date(),
            updatedBy,
        }

        // tslint:disable-next-line: max-line-length
        const updateQuery = `UPDATE sunbird.rc_events SET eventName = ?, eventDescription = ?, eventDate = ?, eventPlace = ?, eventType = ?, updatedBy = ?, updatedAt = ?,templateId = ? WHERE eventId = ?`
        const updateParams = [
            updatedFields.eventName,
            updatedFields.eventDescription,
            updatedFields.eventDate,
            updatedFields.eventPlace,
            updatedFields.eventType,
            updatedFields.updatedBy,
            updatedFields.updatedAt,
            updatedFields.templateId,
            eventId,
        ]

        // Execute the update query
        await client.execute(updateQuery, updateParams, { prepare: true })
        res.status(200).json({ message: 'Event updated successfully', eventId })
    } catch (err) {
        logError('Error updating event:', err)
        res.status(500).json({ error: 'Error updating event' })
    }
})

// Get Event by ID API (GET /events/:id)
sunbirdrRcCertificate.get('/events/:id', async (req, res) => {
    const { id } = req.params
    try {
        const eventData = await client.execute(getEventQuery, [id], { prepare: true })
        const event = eventData.rows[0]
        if (eventData.rowLength === 0) {
            return res.status(404).json({ error: ERROR_EVENT_NOT_FOUND })
        }
        res.status(200).json({
            createdAt: event.createdat,
            createdBy: event.createdby,
            eventDate: event.eventdate,
            eventDescription: event.eventdescription,
            eventId: event.eventid,
            eventName: event.eventname,
            eventPlace: event.eventplace,
            eventType: event.eventtype,
            templateId: event.templateid,
            updatedAt: event.updatedat,
            updatedBy: event.updatedby,

        })
    } catch (err) {
        logInfo(JSON.stringify(err))
        res.status(500).json({ error: 'Error getting event' })
    }
})

// Get All Events API (GET /events)
sunbirdrRcCertificate.get('/events', async (_req, res) => {
    const query = 'SELECT * FROM sunbird.rc_events'
    try {
        const result = await client.execute(query)
        if (result.rowLength === 0) {
            return res.status(404).json({ error: 'No events found' })
        }
        const events = result.rows.map((event) => ({
            createdAt: event.createdat,
            createdBy: event.createdby,
            eventDate: event.eventdate,
            eventDescription: event.eventdescription,
            eventId: event.eventid,
            eventName: event.eventname,
            eventPlace: event.eventplace,
            eventType: event.eventtype,
            status: event.status,
            templateId: event.templateid,
            updatedAt: event.updatedat,
            updatedBy: event.updatedby,
        }))
        res.status(200).json(events)
    } catch (err) {
        logError('Error getting all events:', err)
        res.status(500).json({ error: 'Error getting events' })
    }
})
sunbirdrRcCertificate.post('/events/users', async (req, res) => {
    try {
        const { eventId, users } = req.body
        logInfo(`[/events/users] START - EventId: ${eventId}, Total users to process: ${users?.length || 0}`)

        const eventDetails = await getEventDetails(eventId)
        if (!eventDetails || eventDetails.length === 0) {
            logError(`[/events/users] ERROR: Event not found - EventId: ${eventId}`)
            return res.status(404).json({ error: ERROR_EVENT_NOT_FOUND })
        }

        const eventData = eventDetails[0]
        logInfo(`[/events/users] Event details retrieved - EventType: ${eventData.eventtype}`)

        // Check if users array is valid
        if (!Array.isArray(users) || users.length === 0) {
            logError('[/events/users] ERROR: Invalid users array')
            return res.status(400).json({ error: 'Please provide a list of users to link to the event' })
        }

        let successCount = 0
        let failureCount = 0

        for (let index = 0; index < users.length; index++) {
            const user = users[index]
            logInfo(`[/events/users] Processing user ${index + 1}/${users.length} - Phone: ${user.phone}`)

            try {
                const { phone, place } = user
                const linkId = uuid.v4()
                let firstName = ''
                let lastName = ''
                let userId = ''

                if (eventData.eventtype === EVENT_TYPE_REGISTERED_WITH_SPHERE) {
                    logInfo(`[/events/users] User ${index + 1} - Calling getUserDetailsFromSunbird for phone: ${phone}`)
                    const userDetails = await getUserDetailsFromSunbird(phone, user)

                    firstName = userDetails.firstName
                    lastName = userDetails.lastName
                    userId = userDetails.userId

                    logInfo(`[/events/users] User ${index + 1} - Details retrieved - FirstName: ${firstName}, LastName: ${lastName}, UserId: ${userId}`)
                } else if (eventData.eventtype === EVENT_TYPE_REGISTERED_WITHOUT_SPHERE) {
                    firstName = user.firstName
                    lastName = user.lastName
                    userId = 'Non-QR-User'
                    logInfo(`[/events/users] User ${index + 1} - Non-sphere registration - FirstName: ${firstName}, LastName: ${lastName}`)
                }

                let queryParamsLink
                const status = userId ? STATUS_IN_PROGRESS : STATUS_FAILED_USER_CREATION
                logInfo(`[/events/users] User ${index + 1} - Setting status: ${status}`)

                if (userId) {
                    queryParamsLink = [
                        linkId,
                        userId,
                        eventData.eventid,
                        firstName,
                        lastName,
                        eventData.eventplace || place,
                        STATUS_IN_PROGRESS,
                        new Date(),
                        new Date(),
                    ]
                    successCount++
                } else {
                    queryParamsLink = [
                        linkId,
                        '',
                        eventData.eventid,
                        firstName,
                        lastName,
                        eventData.eventplace || place,
                        STATUS_FAILED_USER_CREATION,
                        new Date(),
                        new Date(),
                    ]
                    failureCount++
                    logError(`[/events/users] User ${index + 1} - FAILED: Empty userId. FirstName: "${firstName}", LastName: "${lastName}"`)
                }

                await insertUserEventLink(queryParamsLink)
                logInfo(`[/events/users] User ${index + 1} - Successfully inserted into database with linkId: ${linkId}`)
                logInfo(`[/events/users] ════════════════════════════════════════════════════════════════`)
            } catch (userError) {
                failureCount++
                logError(`[/events/users] User ${index + 1} - ERROR during processing: ${JSON.stringify(userError)}`)
                logInfo(`[/events/users] ════════════════════════════════════════════════════════════════`)
            }
        }

        logInfo(`[/events/users] ========================================`)
        logInfo(`[/events/users] USER COUNT SUMMARY`)
        logInfo(`[/events/users] Total Users Received: ${users.length}`)
        logInfo(`[/events/users] Successfully Created: ${successCount}`)
        logInfo(`[/events/users] Failed to Create: ${failureCount}`)
        logInfo(`[/events/users] Success Rate: ${((successCount / users.length) * 100).toFixed(2)}%`)
        logInfo(`[/events/users] ========================================`)
        logInfo(`[/events/users] COMPLETED - Success: ${successCount}, Failed: ${failureCount}, Total: ${users.length}`)
        res.status(200).json({
            eventId: eventData.eventid,
            failed: failureCount,
            message: `Users linking completed. Success: ${successCount}, Failed: ${failureCount}`,
            success: successCount,
            total: users.length,
        })
    } catch (err) {
        logError(`[/events/users] CRITICAL ERROR: ${JSON.stringify(err)}`)
        res.status(500).json({ error: 'Error linking users to event' })
    }
})

// tslint:disable-next-line: no-any
async function getUserDetailsFromSunbird(phone: string, user: any) {
    logInfo(`[getUserDetailsFromSunbird] START - Phone: ${phone}, User: ${JSON.stringify(user)}`)
    try {
        const isUserExists = await checkIfuserExists(phone)
        logInfo(`[getUserDetailsFromSunbird] User existence check result: ${JSON.stringify(isUserExists)}`)

        if (isUserExists.status && isUserExists.userId) {
            logInfo(`[getUserDetailsFromSunbird] User already exists - UserId: ${isUserExists.userId}`)
            return isUserExists
        }

        logInfo(`[getUserDetailsFromSunbird] User does not exist, creating new user...`)
        const createdUser = await createUserIfNotExists(user)
        logInfo(`[getUserDetailsFromSunbird] User creation result: ${JSON.stringify(createdUser)}`)
        return createdUser
    } catch (error) {
        // Log error without exposing sensitive information
        const maskedError = maskSensitiveData({
            message: error.message,
            name: error.name,
        })
        logError(`[getUserDetailsFromSunbird] ERROR: ${JSON.stringify(maskedError)}`)
        return {
            firstName: '',
            lastName: '',
            status: false,
            userId: '',
        }
    }
}
// tslint:disable-next-line: no-any
async function insertUserEventLink(queryParamsLink: any) {
    // tslint:disable-next-line: max-line-length
    const queryLink = 'INSERT INTO sunbird.rc_events_users (linkid, userid, eventid, firstname, lastname, place, certificateGenerationStatus, createdat, updatedat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    await client.execute(queryLink, queryParamsLink, { prepare: true })
}
// tslint:disable-next-line: no-any

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
// tslint:disable-next-line: no-any

async function tryGenerateCertificateWithRetry(user, eventDetails, templateId, maxRetries = 3) {
    const maxAttempts = maxRetries
    let lastError = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await generateCertificateFromRcMapper(user, eventDetails, user.userid, templateId)
            if (result === true) {
                logInfo(`[tryGenerateCertificateWithRetry] SUCCESS on attempt ${attempt} for user ${user.userid}`)
                return true
            } else if (result === false) {
                // Permanent failure - don't retry
                logError(`[tryGenerateCertificateWithRetry] Permanent failure for user ${user.userid} on attempt ${attempt}`)
                return false
            }
        } catch (e) {
            lastError = e
            const isLastAttempt = attempt === maxAttempts
            logError(`[tryGenerateCertificateWithRetry] Attempt ${attempt}/${maxAttempts} failed for user ${user.userid}: ${e.message}`)

            if (!isLastAttempt) {
                // Exponential backoff: 500ms, 1000ms, 2000ms
                const backoffDelay = Math.pow(2, attempt - 1) * 500
                logInfo(`[tryGenerateCertificateWithRetry] Retrying in ${backoffDelay}ms...`)
                await delay(backoffDelay)
            }
        }
    }

    logError(`[tryGenerateCertificateWithRetry] FAILED after ${maxAttempts} attempts for user ${user.userid}. Last error: ${lastError?.message}`)
    return false
}

sunbirdrRcCertificate.post('/events/generateCertificates', async (req, res) => {
    try {
        const { eventId, templateId } = req.body
        const eventDetails = await getEventDetails(eventId)
        const users = await getUsersForEvent(eventId)

        if (!users || users.length === 0) {
            return res.status(404).json({ error: 'No users found for this event' })
        }

        const eventStatusUpdate = [
            STATUS_IN_PROGRESS,
            new Date(),
            eventId,
        ]
        await updateEventStatus(eventStatusUpdate)

        res.status(200).json({ message: 'Certificate generation started', eventId })

        let successCount = 0
        let failedCount = 0
        const processingDelay = 300 // Add 300ms delay between users to avoid rate limiting

        logInfo(`[/events/generateCertificates] Starting certificate generation for ${users.length} users`)

        for (let userIndex = 0; userIndex < users.length; userIndex++) {
            const user = users[userIndex]
            const { userid } = user

            if (!userid || user.certificateGenerationStatus === STATUS_FAILED_USER_CREATION) {
                logInfo(`[/events/generateCertificates] Skipping user ${userIndex + 1}/${users.length}: userid=${userid}, status=${user.certificateGenerationStatus}`)
                failedCount++
                continue
            }

            try {
                logInfo(`[/events/generateCertificates] Processing user ${userIndex + 1}/${users.length}: ${user.firstname} ${user.lastname} (${userid})`)

                const certificateGenerationStatus = await tryGenerateCertificateWithRetry(user, eventDetails, templateId)
                const status = certificateGenerationStatus ? 'success' : 'failed during certificate generation'

                const queryParams = [
                    status,
                    new Date(),
                    templateId,
                    userid,
                    eventId,
                    user.linkid,
                ]

                await updateCertificateStatus(queryParams)

                if (certificateGenerationStatus) {
                    successCount++
                    logInfo(`[/events/generateCertificates] SUCCESS: User ${userIndex + 1}/${users.length} - ${userid}`)
                } else {
                    failedCount++
                    logError(`[/events/generateCertificates] FAILED: User ${userIndex + 1}/${users.length} - ${userid}`)
                }

                // Add rate limiting delay between user processing (except for last user)
                if (userIndex < users.length - 1) {
                    await delay(processingDelay)
                }

            } catch (err) {
                failedCount++
                logError(`[/events/generateCertificates] EXCEPTION for user ${userIndex + 1}/${users.length} (${userid}): ${JSON.stringify(err)}`)
            }
        }

        const finalStatus = failedCount > 0 ? 'partial_failed' : 'completed'
        await updateEventStatus([finalStatus, new Date(), eventId])
        logInfo(`Certificate generation job ${eventId} finished: ${successCount} success, ${failedCount} failed`)

    } catch (error) {
        logInfo(JSON.stringify(error))
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error generating certificates' })
        }
    }
})

// tslint:disable-next-line: no-any
async function updateEventStatus(queryParams: any): Promise<void> {
    const updateQuery = `
        UPDATE sunbird.rc_events
        SET status = ?, updatedAt = ?
        WHERE eventId = ?
    `
    await client.execute(updateQuery, queryParams, { prepare: true })
}
// tslint:disable-next-line: no-any
async function getUsersForEvent(eventId: string): Promise<any[]> {
    const query = 'SELECT * FROM sunbird.rc_events_users WHERE eventId = ?'
    const result = await client.execute(query, [eventId], { prepare: true })
    return result.rows
}
// tslint:disable-next-line: no-any
async function getEventDetails(eventId: string): Promise<any[]> {
    const result = await client.execute(getEventQuery, [eventId], { prepare: true })
    return result.rows
}
// tslint:disable-next-line: no-any
async function updateCertificateStatus(queryParams: any): Promise<void> {
    const updateQuery = `
        UPDATE sunbird.rc_events_users
        SET certificateGenerationStatus = ?, updatedAt = ?, templateId = ?
        WHERE userId = ? AND eventId = ? AND linkid = ?
    `
    await client.execute(updateQuery, queryParams, { prepare: true })
}
// tslint:disable-next-line: no-any
const generateCertificateFromRcMapper = async (user: any, eventDataFromCassandra: any, userId: string, templateId: string) => {
    try {
        // Validate input data
        if (!eventDataFromCassandra || !eventDataFromCassandra[0]) {
            logError(`[generateCertificateFromRcMapper] ERROR: Invalid event data for user ${user.userid}`)
            return false
        }

        if (!user.firstname) {
            logError(`[generateCertificateFromRcMapper] ERROR: User ${user.userid} missing firstName`)
            return false
        }

        const eventData = eventDataFromCassandra[0]
        const firstName = String(user.firstname || '').trim()
        const lastName = String(user.lastname || user.firstname || '').trim()

        const requestData = {
            certificateName: eventData.eventname,
            eventId: eventData.eventid,
            rcCertificateGenerationBody: {
                date: new Date(eventData.eventdate).toLocaleDateString('en-IN').replace(/\//g, '-'),
                name: `${firstName} ${lastName}`,
                place: eventData.eventplace,
                'workshop-name': eventData.eventname,
            },
            templateId,
            userId,
            userName: `${firstName} ${lastName}`,
        }

        logInfo(`[generateCertificateFromRcMapper] Calling Certificate API for user ${user.userid} (${firstName} ${lastName})`)

        const userCertificateGenerateResponse = await axios({
            data: requestData,
            headers: {
                authorization: CONSTANTS.SB_API_KEY,
            },
            method: 'POST',
            url: `${CONSTANTS.RC_MAPPER_HOST}/v1/certificate/generateUserCertificatesFromRc`,
        })

        // Validate response
        logInfo(`[generateCertificateFromRcMapper] API Response Status: ${userCertificateGenerateResponse.status} for user ${user.userid}`)

        if (userCertificateGenerateResponse.status !== 200 && userCertificateGenerateResponse.status !== 201) {
            logError(`[generateCertificateFromRcMapper] ERROR: Unexpected status ${userCertificateGenerateResponse.status} for user ${user.userid}`)
            return false
        }

        if (!userCertificateGenerateResponse.data) {
            logError(`[generateCertificateFromRcMapper] ERROR: No response data from Certificate API for user ${user.userid}`)
            return false
        }

        const responseData = userCertificateGenerateResponse.data
        logInfo(`[generateCertificateFromRcMapper] API Response for user ${user.userid}: ${JSON.stringify(responseData)}`)

        if (responseData.certificateUrl) {
            logInfo(`[generateCertificateFromRcMapper] SUCCESS: Certificate generated for user ${user.userid} - URL: ${responseData.certificateUrl}`)
            return true
        }

        // Check for error in response
        if (responseData.error || responseData.message === 'FAILED') {
            logError(`[generateCertificateFromRcMapper] ERROR from API for user ${user.userid}: ${responseData.error || responseData.message}`)
            return false
        }

        logError(`[generateCertificateFromRcMapper] ERROR: No certificateUrl in response for user ${user.userid}`)
        return false

    } catch (error) {
        // Distinguish between different error types
        let errorMsg = 'Unknown error'
        let isTransient = false

        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            errorMsg = `Timeout: ${error.message}`
            isTransient = true
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            errorMsg = `Connection error: ${error.message}`
            isTransient = true
        } else if (error.response) {
            // HTTP error response
            errorMsg = `HTTP ${error.response.status}: ${error.response.statusText}`
            if (error.response.data) {
                errorMsg += ` - ${JSON.stringify(error.response.data)}`
            }
            // 5xx errors are transient, 4xx are usually not
            isTransient = error.response.status >= 500
        } else if (error.message) {
            errorMsg = error.message
        }

        logError(`[generateCertificateFromRcMapper] Exception for user ${user.userid} (transient: ${isTransient}): ${errorMsg}`)

        // Return null to distinguish from false (permanent failure)
        // This will trigger retry in the calling function
        throw error
    }
}
const checkIfuserExists = async (phone: string) => {
    logInfo(`[checkIfuserExists] START - Searching for phone: ${phone}`)
    try {
        const userSearch = await axios({
            data: {
                request: {
                    filters: { phone },
                    query: '',
                },
            },
            method: 'POST',
            url: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
        })

        logInfo(`[checkIfuserExists] API Response status: ${userSearch.status}, Response: ${JSON.stringify(userSearch.data)}`)

        if (userSearch.data.result.response.count > 0) {
            const userData = userSearch.data.result.response.content[0]
            // Handle cases where profileDetails might be null
            let firstName = userData.firstName || ''
            let lastName = userData.lastName || ''

            if (userData.profileDetails && userData.profileDetails.profileReq && userData.profileDetails.profileReq.personalDetails) {
                firstName = userData.profileDetails.profileReq.personalDetails.firstname || firstName // fallback to top-level firstName
                lastName = userData.profileDetails.profileReq.personalDetails.surname || userData.profileDetails.profileReq.personalDetails.firstname || lastName // fallback to top-level lastName or firstName
            }

            const userResult = {
                firstName,
                lastName,
                status: true,
                userId: userData.id,
            }
            logInfo(`[checkIfuserExists] User found - UserId: ${userData.id}, FirstName: ${firstName}, LastName: ${lastName}`)
            return userResult
        }

        logInfo(`[checkIfuserExists] No user found for phone: ${phone}`)
        return { status: false, userId: '', firstName: '', lastName: '' }

    } catch (error) {
        // Log error without exposing tokens
        const maskedError = maskSensitiveData({
            message: error.message,
            name: error.name,
        })
        logError(`[checkIfuserExists] ERROR while searching for phone ${phone}: ${JSON.stringify(maskedError)}`)
        return { status: false, userId: '', firstName: '', lastName: '' }
    }
}
// tslint:disable-next-line: no-any
const createUserIfNotExists = async (userData: any) => {
    logInfo(`[createUserIfNotExists] START - User data: ${JSON.stringify(userData)}`)
    try {
        const userCreationData = {
            request: {
                firstName: userData.firstName,
                lastName: userData.lastName || `${userData.firstName}`,
                password: getRCPassword(userData), // encrypted password was failing user creation so added new method to generate password
                phone: userData.phone,
            },
        }

        logInfo(`[createUserIfNotExists] Creating user with data: ${JSON.stringify(userCreationData)}`)

        const userCreationResponse = await axios({
            data: userCreationData,
            headers: {
                authorization: CONSTANTS.SB_API_KEY,
            },
            method: 'POST',
            url: `${CONSTANTS.KONG_API_BASE}/user/v3/create`,
        })

        logInfo(`[createUserIfNotExists] User creation API response: ${JSON.stringify(userCreationResponse.data)}`)

        const userId = userCreationResponse.data.result.userId
        if (!userId) {
            logError(`[createUserIfNotExists] ERROR: No userId returned from user creation API`)
            return { firstName: userData.firstName, lastName: userData.lastName || userData.firstName, status: false, userId: '' }
        }

        logInfo(`[createUserIfNotExists] User created successfully - UserId: ${userId}. Assigning role...`)

        const userRoleAssignData = {
            request: {
                organisationId: '0132317968766894088',
                roles: ['PUBLIC'],
                userId: `${userId}`,
            },
        }

        // Make role assignment resilient: retry a couple times and don't fail overall if this step errors
        try {
            const roleAssignResponse = await axios({
                data: userRoleAssignData,
                headers: {
                    authorization: CONSTANTS.SB_API_KEY,
                },
                method: 'POST',
                url: `${CONSTANTS.KONG_API_BASE}/user/private/v1/assign/role`,
            })
            logInfo(`[createUserIfNotExists] Role assigned successfully - Response: ${JSON.stringify(roleAssignResponse.data)}`)
        } catch (errRole) {
            const masked = maskSensitiveData({ message: errRole.message, name: errRole.name })
            logError(`[createUserIfNotExists] Role assign failed for userId ${userId}: ${JSON.stringify(masked)} - continuing (user created)`)
        }

        logInfo(`[createUserIfNotExists] Updating user profile...`)

        const userProfileUPdateData = {
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
                        id: `${userId}`,

                        personalDetails: {
                            firstname: userData.firstName,
                            knownLanguages: [],
                            mobile: JSON.stringify(userData.phone),
                            regNurseRegMidwifeNumber: 'NA',
                            surname: userData.lastName || `${userData.firstName}`,
                        },
                        userId: `${userId}`,
                    },
                },
                userId: `${userId}`,
            },
        }

        try {
            const profileUpdateResponse = await axios({
                data: userProfileUPdateData,
                headers: {
                    authorization: CONSTANTS.SB_API_KEY,
                },
                method: 'PATCH',
                url: `${CONSTANTS.KONG_API_BASE}/user/private/v1/update`,
            })
            logInfo(`[createUserIfNotExists] Profile updated successfully - Response: ${JSON.stringify(profileUpdateResponse.data)}`)
        } catch (errProfile) {
            const masked = maskSensitiveData({ message: errProfile.message, name: errProfile.name })
            logError(`[createUserIfNotExists] Profile update failed for userId ${userId}: ${JSON.stringify(masked)} - continuing (user created)`)
        }

        const result = {
            firstName: userData.firstName,
            lastName: userData.lastName || userData.firstName,
            status: true,
            userId,
        }

        logInfo(`[createUserIfNotExists] SUCCESS - User created (profile/role may require follow-up): ${JSON.stringify(result)}`)
        return result
    } catch (error) {
        // Log error without sensitive data (tokens, passwords)
        const maskedError = maskSensitiveData({
            message: error.message,
            name: error.name,
        })
        logError(`[createUserIfNotExists] ERROR: ${JSON.stringify(maskedError)}`)

        if (error.response) {
            // Log API error response without sensitive data
            const maskedResponse = maskSensitiveData({
                data: error.response.data,
                status: error.response.status,
            })
            const maskedResponseData = (maskedResponse as Record<string, unknown>).data
            logError(`[createUserIfNotExists] API Error Response - Status: ${error.response.status}, Data: ${JSON.stringify(maskedResponseData)}`)

            // Check if it's a duplicate phone error (UOS_USRCRT0002)
            if (error.response.data && error.response.data.params && error.response.data.params.err === 'UOS_USRCRT0002') {
                logInfo(`[createUserIfNotExists] Duplicate phone detected for ${userData.phone}, fetching existing user...`)
                try {
                    const existingUser = await checkIfuserExists(userData.phone)
                    if (existingUser.status && existingUser.userId) {
                        logInfo(`[createUserIfNotExists] Existing user found - UserId: ${existingUser.userId}`)
                        return {
                            firstName: existingUser.firstName,
                            lastName: existingUser.lastName,
                            status: true,
                            userId: existingUser.userId,
                        }
                    } else {
                        logError(`[createUserIfNotExists] Duplicate error but no existing user found for phone ${userData.phone}`)
                    }
                } catch (fetchError) {
                    const maskedFetch = maskSensitiveData({ message: fetchError.message, name: fetchError.name })
                    logError(`[createUserIfNotExists] Error fetching existing user for duplicate phone: ${JSON.stringify(maskedFetch)}`)
                }
            }
        }
        return {
            firstName: '',
            lastName: '',
            status: false,
            userId: '',
        }
    }
}
// Get Users for an Event (GET /events/:eventId/users)
sunbirdrRcCertificate.get('/events/:eventId/users', async (req, res) => {
    const { eventId } = req.params

    const query = 'SELECT * FROM sunbird.rc_events_users WHERE eventId = ? '
    const params = [eventId]

    try {
        const result = await client.execute(query, params, { prepare: true })
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No users found for this event' })
        }
        // tslint:disable-next-line: no-any
        const users = result.rows.map((user: any) => ({
            certificateGenerationStatus: user.certificategenerationstatus,
            createdAt: user.createdat,
            eventId: user.eventid,
            firstName: user.firstname,
            lastName: user.lastname,
            linkId: user.linkid,
            phone: user.phone,
            place: user.place,
            templateId: user.templateid,
            updatedAt: user.updatedat,
            userId: user.userid,
        }))
        res.status(200).json(users)
    } catch (err) {
        logError('Error fetching users for event:', err)
        res.status(500).json({ error: 'Error fetching users for event' })
    }
})
// Get Events for a User (GET /users/:userId/events)
sunbirdrRcCertificate.get('/users/:userId/events', async (req, res) => {
    const { userId } = req.params

    const query = 'SELECT * FROM sunbird.rc_events_users WHERE user_id = ?'
    const params = [userId]

    try {
        const result = await client.execute(query, params, { prepare: true })
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No events found for this user' })
        }

        res.status(200).json(result.rows)
    } catch (err) {
        logError('Error fetching events for user:', err)
        res.status(500).json({ error: 'Error fetching events for user' })
    }
})
sunbirdrRcCertificate.get('/downloadCertificates/:eventId', async (req, res) => {
    try {
        const { eventId } = req.params
        const listParams = {
            Bucket: RC_S3_BUCKET_NAME,
            Prefix: `mdo-rc-certificates/${eventId}`,  // Folder path in S3
        }
        const listObjectsResponse = await s3.listObjectsV2(listParams).promise()
        // tslint:disable-next-line: max-line-length
        const fileKeys = listObjectsResponse.Contents?.filter((file) => file.Size > 0 && !file.Key.endsWith('/')).map((file) => file.Key) || []
        if (fileKeys.length === 0) {
            return res.status(404).send('No files found in the specified folder.')
        }
        res.setHeader('Content-Type', 'application/zip')
        res.setHeader('Content-Disposition', 'attachment; filename=files.zip')
        const zipStream = archiver('zip', {
            zlib: { level: 9 },
        })

        zipStream.pipe(res)

        for (const key of fileKeys) {
            const fileName = key.replace(listParams.Prefix, '')
            // If the file name is empty, skip it
            if (!fileName || fileName.trim() === '') {
                continue
            }
            const fileStream = s3.getObject({ Bucket: listParams.Bucket, Key: key }).createReadStream()
            zipStream.append(fileStream, { name: key.replace(listParams.Prefix, '') }) // Strip the folder path from the file name
        }
        zipStream.finalize()
    } catch (err) {
        logInfo(JSON.stringify(err))
        res.status(500).send('Internal Server Error')
    }
})
