import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
import { logError } from '../utils/logger'
import { extractUserToken } from '../utils/requestExtract'
import { requestValidator } from '../utils/requestValidator'
import { API_END_POINTS } from './apiConstants'

export const updateProgressv3 = Router()

updateProgressv3.patch('/update', async (req, res) => {
    try {
        logInfo('[updateProgressv3] request>> ' + JSON.stringify(req.body))

        if (requestValidator(['userId', 'contents'], req.body.request, res)) return

        const updateResponse = await axios({
            data: req.body,
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                'Content-Type': 'application/json',
                'x-authenticated-user-token': extractUserToken(req),
            },
            method: 'PATCH',
            url: API_END_POINTS.updateProgress,
        })
        logInfo('[updateProgressv3] request>> ' + JSON.stringify(req.body))
        logInfo('[updateProgressv3] response>> ' + JSON.stringify(updateResponse.data))
        res.status(200).json(updateResponse.data)
    } catch (error) {
        logError('Error in update progress v3  >>>>>>' + error)
        res.status(500).send({
            message: 'Something went wrong during progress update',
            status: 'failed',
        })
    }
})
