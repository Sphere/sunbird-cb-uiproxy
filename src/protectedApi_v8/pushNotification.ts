import axios from 'axios'
import { Router } from 'express'

import { axiosRequestConfig } from '../configs/request.config'
import { sendTopicNotification } from '../publicApi_v8/firebase-manager'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'
import { extractUserIdFromRequest, extractUserToken } from '../utils/requestExtract'

const API_END_POINTS = {
    sendByToken: `${CONSTANTS.KONG_API_BASE}/user/push-notification/send-by-token`,
}

export const pushNotificationApi = Router()
const unknownError = 'Failed due to unknown reason'

// Sends a push notification to the given users' registered devices via the push-notification service.
// Expected body: { request: { title, body, userIds, data? } }
pushNotificationApi.post('/send-by-token', async (req, res) => {
    await forwardToPushService(API_END_POINTS.sendByToken, req, res)
})

// Sends a push notification to every device subscribed to the topic using uiproxy's Firebase app.
// Expected body: { topic, title, body, data?, imageUrl? }
pushNotificationApi.post('/send-by-topic', async (req, res) => {
    try {
        const { topic, title, body, data, imageUrl } = req.body || {}
        if (!topic) {
            res.status(400).send({ error: 'Topic is required', success: false })
            return
        }
        const messageId = await sendTopicNotification({ topic, title, body, data, imageUrl })
        res.send({ messageId, success: true, topic })
    } catch (err) {
        logError('Failed to send topic notification. ' + err)
        res.status(500).send({
            details: err instanceof Error ? err.message : unknownError,
            error: 'Failed to send topic notification',
            success: false,
        })
    }
})

// tslint:disable-next-line: no-any
async function forwardToPushService(url: string, req: any, res: any) {
    try {
        const response = await axios.post(
            url,
            req.body,
            {
                ...axiosRequestConfig,
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    // tslint:disable-next-line: all
                    'x-authenticated-user-token': extractUserToken(req),
                    // tslint:disable-next-line: all
                    'x-authenticated-userid': extractUserIdFromRequest(req),
                },
            }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        logError('Failed to send push notification. ' + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
}
