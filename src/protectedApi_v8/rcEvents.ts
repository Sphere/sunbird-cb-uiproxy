import cassandra from 'cassandra-driver'
import { Router } from 'express'
import uuid from 'uuid'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'

const client = new cassandra.Client({
    contactPoints: [CONSTANTS.CASSANDRA_IP],
    keyspace: 'sunbird_courses',
    localDataCenter: 'datacenter1',
})

export const sunbirdrRcCertificate = Router()
sunbirdrRcCertificate.post('/events', async (req, res) => {
    logInfo('Create event request body', req.body)
      // tslint:disable-next-line: max-line-length
    const { event_name, event_description, event_date, event_location, organizer_name, organizer_contact, event_type, event_status, is_virtual } = req.body

    if (!event_name || !event_description || !event_date || !event_location) {
        return res.status(400).json({ error: 'Missing required fields' })
    }

    const eventId = uuid.v4() // Generate a unique UUID for the event
    const createdAt = new Date()
    const updatedAt = new Date()
  // tslint:disable-next-line: max-line-length
    const query = 'INSERT INTO sunbird.rc_events (event_id, event_name, event_description, event_date, event_location, organizer_name, organizer_contact, event_type, event_status, created_at, updated_at, is_virtual) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      // tslint:disable-next-line: max-line-length
    const params = [eventId, event_name, event_description, event_date, event_location, organizer_name, organizer_contact, event_type, event_status, createdAt, updatedAt, is_virtual]

    try {
        await client.execute(query, params, { prepare: true })
        res.status(201).json({ event_id: eventId })
    } catch (err) {
        logError('Error creating event:', err)
        res.status(500).json({ error: 'Error creating event' })
    }
})

// Get Event by ID API (GET /events/:id)
sunbirdrRcCertificate.get('/events/:id', async (req, res) => {
    const { id } = req.params

    const query = 'SELECT * FROM sunbird.rc_events WHERE event_id = ?'
    try {
        const result = await client.execute(query, [id], { prepare: true })

        if (result.rowLength === 0) {
            return res.status(404).json({ error: 'Event not found' })
        }

        res.json(result.rows[0])
    } catch (err) {
        logError('Error getting event by ID:', err)
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

        res.json(result.rows)
    } catch (err) {
        logError('Error getting all events:', err)
        res.status(500).json({ error: 'Error getting events' })
    }
})
sunbirdrRcCertificate.post('/events/users', async (req, res) => {
    const { eventId, users } = req.body

    if (!Array.isArray(users) || users.length === 0) {
        return res.status(400).json({ error: 'Please provide a list of users to link to the event' })
    }

    const createdAt = new Date()

    try {
        // Prepare queries for each user and execute them
        const queries = []
        users.forEach((user) => {
            const { user_id, user_name, state, city, block, role } = user

            if (!role || !user_id || !user_name || !state || !city || !block) {
                throw new Error('Missing required fields for one or more users')
            }

            const linkId = uuid.v4()  // Generate a unique link_id for each user-event combination

            // Insert the link between user and event
              // tslint:disable-next-line: max-line-length
            const queryLink = 'INSERT INTO sunbird.rc_events_users (link_id, user_id, event_id, user_name, state, city, block, created_at, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
             // tslint:disable-next-line: max-line-length
            const paramsLink = [linkId, user_id, eventId, user_name, state, city, block, createdAt, role]
            queries.push(client.execute(queryLink, paramsLink, { prepare: true }))
        })

        // Execute all queries in parallel
        await Promise.all(queries)

        res.status(200).json({ message: `Users successfully linked to event ${eventId}` })
    } catch (err) {
        logError('Error linking users to event:', err)
        res.status(500).json({ error: 'Error linking users to event' })
    }
})

// Get Users for an Event (GET /events/:eventId/users)
sunbirdrRcCertificate.get('/events/:eventId/users', async (req, res) => {
    const { eventId } = req.params

    const query = 'SELECT * FROM sunbird.rc_events_users WHERE event_id = ? ALLOW FILTERING'
    const params = [eventId]

    try {
        const result = await client.execute(query, params, { prepare: true })
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No users found for this event' })
        }

        res.status(200).json(result.rows)
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
