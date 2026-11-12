import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { logError } from '../utils/logger'
import { ERROR } from '../utils/message'
import { API_END_POINTS } from './apiConstants'

export const workallocationPublic = Router()

workallocationPublic.get('/getWaPdf/:userId/:waId', async (req, res) => {
    try {
        const userId = req.params.userId
        const waId = req.params.waId
        const response = await axios.get(API_END_POINTS.getWAPdf(userId, waId), {
            ...axiosRequestConfig,
            headers: {
            },
        })
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: ERROR.GENERAL_ERR_MSG,
            }
        )
    }
})
