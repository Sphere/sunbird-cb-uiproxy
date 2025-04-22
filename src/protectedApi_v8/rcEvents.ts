import archiver from 'archiver'
import AWS from 'aws-sdk'
import axios from 'axios'
import cassandra from 'cassandra-driver'
import { Router } from 'express'
import uuid from 'uuid'
import { encryptData } from '../utils/emailHashPasswordGenerator'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'

const s3 = new AWS.S3({
    accessKeyId: CONSTANTS.RC_S3_ACCESS_KEY_ID,
    region: 'ap-south-1',
    secretAccessKey: CONSTANTS.RC_S3_SECRET_ACCESS_KEY,
})

const RC_S3_BUCKET_NAME = CONSTANTS.RC_S3_BUCKET_NAME
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
            return res.status(404).json({ error: 'Event not found' })
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
            return res.status(404).json({ error: 'Event not found' })
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
        const eventDetails = await getEventDetails(eventId)
        const eventData = eventDetails[0]
        // Check if users array is valid
        if (!Array.isArray(users) || users.length === 0) {
            return res.status(400).json({ error: 'Please provide a list of users to link to the event' })
        }
        for (const user of users) {
            const { firstName, lastName, phone, place } = user
            const linkId = uuid.v4()
            const userId = await getUserId(phone, user)
            let queryParamsLink
            if (userId) {
                queryParamsLink = [
                    linkId,
                    userId,
                    eventData.eventid,
                    firstName,
                    lastName,
                    eventData.eventplace || place,
                    'inProgress',
                    new Date(),
                    new Date(),
                ]
            } else {
                queryParamsLink = [
                    linkId,
                    '',
                    eventData.eventid,
                    firstName,
                    lastName,
                    eventData.eventplace || place,
                    'failed',
                    new Date(),
                    new Date(),
                ]

            }
            await insertUserEventLink(queryParamsLink)
        }
        res.status(200).json({ message: `Users successfully linked to event ${eventData.eventId}` })
    } catch (err) {
        logInfo(JSON.stringify(err))
        res.status(500).json({ error: 'Error linking users to event' })
    }
})

// tslint:disable-next-line: no-any
async function getUserId(phone: string, user: any): Promise<string> {
    const isUserExists = await checkIfuserExists(phone)

    if (isUserExists.status && isUserExists.userId) {
        return isUserExists.userId
    }
    const createUserResponse = await createUserIfNotExists(user)
    return createUserResponse.status && createUserResponse.userId ? createUserResponse.userId : ''
}
// tslint:disable-next-line: no-any
async function insertUserEventLink(queryParamsLink: any) {
    // tslint:disable-next-line: max-line-length
    const queryLink = 'INSERT INTO sunbird.rc_events_users (linkid, userid, eventid, firstname, lastname, place, certificateGenerationStatus, createdat, updatedat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    await client.execute(queryLink, queryParamsLink, { prepare: true })
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
            "inProgress",
            new Date(),
            eventId,
        ]
        await updateEventStatus(eventStatusUpdate)
        res.status(200).json({ message: 'Certificate generation started', eventId });
        const promises = users.map(async (user) => {
            const { userid } = user;
            if (!userid || user.certificateGenerationStatus === 'failed') {
                return { success: false };
            }
            try {
                const certificateGenerationStatus = await generateCertificateFromRcMapper(user, eventDetails, userid, templateId);
                const status = certificateGenerationStatus ? 'success' : 'failed';
                const queryParams = [
                    status,
                    new Date(),
                    templateId,
                    userid,
                    eventId,
                    user.linkid,
                ];
                await updateCertificateStatus(queryParams);
                return { success: certificateGenerationStatus };
            } catch (err) {
                logInfo(`Error generating certificate for userId ${userid}: ${JSON.stringify(err)}`);
                return { success: false };
            }
        });

        const results = await Promise.allSettled(promises);
        let successCount = 0;
        let failedCount = 0;
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value?.success) {
                successCount++;
            } else {
                failedCount++;
            }
        });
        const finalStatus = failedCount > 0 ? 'partial_failed' : 'completed';
        await updateEventStatus([finalStatus, new Date(), eventId]);
        logInfo(`Certificate generation job ${eventId} finished: ${successCount} success, ${failedCount} failed`);
    } catch (error) {
        logInfo(JSON.stringify(error))
        res.status(500).json({ error: 'Error generating certificates' })
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
        const eventData = eventDataFromCassandra[0]
        const userCertificateGenerateResponse = await axios({

            data: {
                certificateName: eventData.eventname,
                eventId: eventData.eventid,
                rcCertificateGenerationBody: {
                    date: new Date(eventData.eventdate).toLocaleDateString('en-IN').replace(/\//g, '-'),
                    name: `${user.firstname} ${user.lastname || ''}`,
                    place: eventData.eventplace,
                    'workshop-name': eventData.eventname,
                },
                templateId,
                userId,
                userName: `${user.firstname} ${user.lastname || ''}`,

            },
            headers: {
                authorization: CONSTANTS.SB_API_KEY,
            },
            method: 'POST',
            url: `${CONSTANTS.RC_MAPPER_HOST}/v1/certificate/generateUserCertificatesFromRc`,

        })
        if (userCertificateGenerateResponse.data.certificateUrl) {
            return true
        }
        return false
    } catch (error) {
        logInfo(JSON.stringify(error))
        return false
    }
}
const checkIfuserExists = async (phone: string) => {
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

        if (userSearch.data.result.response.count > 0) {
            return { status: true, userId: userSearch.data.result.response.content[0].id }
        }
        return { status: false, userId: '' }

    } catch (error) {
        return { status: false, userId: '' }
    }
}
// tslint:disable-next-line: no-any
const createUserIfNotExists = async (userData: any) => {
    try {
        const userCreationData = {
            request: {
                firstName: userData.firstName,
                lastName: userData.lastName || `${userData.firstName}`,
                password: encryptData(userData.phone),
                phone: JSON.stringify(userData.phone),
            },
        }
        const userCreationResponse = await axios({
            data: userCreationData,
            headers: {
                authorization: CONSTANTS.SB_API_KEY,
            },
            method: 'POST',
            url: `https://sphere.aastrika.org/api/user/v3/create`,
        })
        const userId = userCreationResponse.data.result.userId
        const userRoleAssignData = {
            request: {
                organisationId: '0132317968766894088',
                roles: ['PUBLIC'],
                userId: `${userId}`,
            },
        }
        await axios({
            data: userRoleAssignData,
            headers: {
                authorization: CONSTANTS.SB_API_KEY,
            },
            method: 'POST',
            url: `https://sphere.aastrika.org/api/user/private/v1/assign/role`,
        })
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

        await axios({
            data: userProfileUPdateData,
            headers: {
                authorization: CONSTANTS.SB_API_KEY,
            },
            method: 'PATCH',
            url: `https://sphere.aastrika.org/api/user/private/v1/update`,
        })
        return {
            status: true,
            userId,
        }
    } catch (error) {
        return {
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
