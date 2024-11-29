import { Router } from 'express'
import _ from 'lodash'
import { logInfo } from '../utils/logger'

export const userFeed = Router()
userFeed.get('/getAllUserFeed', async (req, res) => {
    try {
        logInfo('Entered into getAllUserFeed >>>>>', req.query)
        if (!req.query.userId) {
            res.status(400).json({
                message: 'User id can not be empty',
                status: 'FAILED',
            })
        }
        const userFeedData = [{
            action_url: 'https://app.example.com/messages/12345', // URL for the user to take action (e.g., view message)
            created_on: '2024-11-26T14:32:00Z', // Timestamp of when the notification was created
            message: 'John Doe sent you a new message.', // Detailed message content
            metadata: { // Additional metadata to enrich the notification
                related_entity_id: 'message_56789', // Associated entity (e.g., a message, post, comment)
                source: 'system', // Source of the notification (e.g., system, user, admin)
                tags: ['important', 'user_mention'], // Tags for categorization or filtering
                user_mention_id: null, // ID of the user mentioned (if applicable)
            },
            notification_id: '12345', // Unique ID for the notification
            priority: 'high', // Priority of the notification (e.g., low, medium, high)
            read_on: null, // Timestamp of when the notification was read (null if unread)
            status: 'unread', // Current status of the notification (e.g., unread, read, dismissed)
            title: 'You have a new message!', // Short title or summary of the notification
            type: 'new_message', // Type of notification (e.g., new message, mention, like)
            user_id: 'user_6789', // ID of the user receiving the notification
        },
        ]
        res.status(200).json({
            data: userFeedData,
            message: `User feed successfully read for userId ${req.query.userId}`,
            status: 'SUCCESS',
            userId: req.query.userId,
        })
    } catch (error) {
        logInfo('Error in user creation >>>>>>' + error)
        res.status(500).send({
            message: 'Something went wrong while fetching user feed',
            status: 'failed',
        })
    }
})
