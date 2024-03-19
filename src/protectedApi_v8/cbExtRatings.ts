import axios from 'axios'
import { Router } from 'express'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
const API_END_POINTS = {
    ratingLookUp: `${CONSTANTS.SB_EXT_API_BASE_2}/ratings/v1/ratingLookUp`,
    ratingRead: `${CONSTANTS.SB_EXT_API_BASE_2}/ratings/v2/read`,
    ratingUpsert: `${CONSTANTS.SB_EXT_API_BASE_2}/ratings/v1/upsert`,
    summary: (courseId) =>
        `${CONSTANTS.SB_EXT_API_BASE_2}/ratings/v1/summary/${courseId}/Course`,

}
export const ratingServiceApi = Router()
const headers = {
    'Content-Type': 'application/json',
}

ratingServiceApi.post('/upsert', async (req, res) => {
    try {
        logInfo('Inside ratings upsert API')
        const upsertData = req.body
        const response = await axios({
            data: upsertData,
            headers,
            method: 'post',
            url: API_END_POINTS.ratingUpsert,
        })
        res.status(200).json(response.data)
    } catch (error) {
        logInfo(JSON.stringify(error))
        res.status(400).json({
            message: 'Something went wrong while ratings upsert',
        })

    }
}
)

ratingServiceApi.post('/v2/read', async (req, res) => {
    try {
        logInfo('Inside ratings read API')
        const readRatingsData = req.body
        const response = await axios({
            data: readRatingsData,
            headers,
            method: 'post',
            url: API_END_POINTS.ratingRead,
        })
        res.status(200).json(response.data)
    } catch (error) {
        logInfo(JSON.stringify(error))
        res.status(400).json({
            message: 'Something went wrong while reading ratings',
        })

    }
}
)

ratingServiceApi.post('/ratingLookUp', async (req, res) => {
    try {
        logInfo('Inside ratings lookup API')
        const upsertData = req.body
        const response = await axios({
            data: upsertData,
            headers,
            method: 'post',
            url: API_END_POINTS.ratingLookUp,
        })
        res.status(200).json(response.data)
    } catch (error) {
        logInfo(JSON.stringify(error))
        res.status(400).json({
            message: 'Something went wrong while rating lookup',
        })

    }
}
)
ratingServiceApi.get('/summary', async (req, res) => {
    try {
        logInfo('Inside ratings summary API')
        const courseId = req.query.courseId
        if (!courseId) {
            return res.status(400).json({
                message: 'CourseId cannot be empty',
                status: 'Failed',
            })
        }
        const response = await axios({
            headers,
            method: 'GET',
            url: API_END_POINTS.summary(courseId),
        })
        res.status(200).json(response.data)
    } catch (error) {
        logInfo(JSON.stringify(error))
        res.status(400).json({
            message: 'Something went wrong getting summary results',
        })
    }
}
)
