import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractUserToken } from '../utils/requestExtract'

const API_END_POINTS = {
    calculateScoreEndPoint: `${CONSTANTS.KONG_API_BASE}/scoring/v1/add`,
    createComment: `${CONSTANTS.SCORING_SERVICE_API_BASE}/api/comments/create`,
    fetchScore: `${CONSTANTS.KONG_API_BASE}/scoring/v1/fetch`,
    fetchTemplate: (templateId: string) => `${CONSTANTS.KONG_API_BASE}/scoring/v1/getTemplate/${templateId}`,
    getAllComments: `${CONSTANTS.SCORING_SERVICE_API_BASE}/api/comments/getall`,
    getCommentsByCourse: `${CONSTANTS.SCORING_SERVICE_API_BASE}/api/comments/course`,
    updateComment: `${CONSTANTS.SCORING_SERVICE_API_BASE}/api/comments/update`,
}

export const scoringApi = Router()

const unknownError = 'Failed due to unknown reason'
const failedToProcess = 'Failed to process the request. '

const scoringServiceheaders = {
    Authorization: CONSTANTS.SB_API_KEY,
    'Content-Type': 'application/json',
}
scoringApi.post('/comments/create', async (req, res) => {
    try {
        logInfo('Inside comments creation API')
        const commentsCreateResponse = await axios({
            data: req.body,
            headers: scoringServiceheaders,
            method: 'POST',
            url: API_END_POINTS.createComment,
        })
        res.status(commentsCreateResponse.status).send(commentsCreateResponse.data)
    } catch (err) {
        logError(failedToProcess + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
})
scoringApi.get('/comments/course', async (req, res) => {
    try {
        logInfo('Inside get comments by course')
        const getCommentsByCourseResponse = await axios({
            headers: scoringServiceheaders,
            method: 'GET',
            params: {
                courseId: req.query.courseId,
            },
            url: API_END_POINTS.getCommentsByCourse,
        })
        res.status(getCommentsByCourseResponse.status).send(getCommentsByCourseResponse.data)
    } catch (err) {
        logError(failedToProcess + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
})
scoringApi.put('/comments/update', async (req, res) => {
    try {
        logInfo('Inside update comments by comment ID')
        const updateCommentsResponse = await axios({
            data: req.body,
            headers: scoringServiceheaders,
            method: 'PUT',
            params: {
                commentsId: req.query.commentsId,
            },
            url: API_END_POINTS.updateComment,
        })
        res.status(updateCommentsResponse.status).send(updateCommentsResponse.data)
    } catch (err) {
        logError(failedToProcess + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
})
scoringApi.get('/comments/getAllComments', async (req, res) => {
    try {
        logInfo('Inside get all comments')
        const getAllCommentsResponse = await axios({
            data: req.body,
            headers: scoringServiceheaders,
            method: 'GET',
            params: {
                commentsId: req.query.commentsId,
            },
            url: API_END_POINTS.getAllComments,
        })
        res.status(getAllCommentsResponse.status).send(getAllCommentsResponse.data)
    } catch (err) {
        logError(failedToProcess + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
})
scoringApi.post('/calculate', async (req, res) => {
    try {
        const rootOrgValue = req.headers.rootorg
        const orgValue = req.headers.org
        if (!rootOrgValue || !orgValue) {
            res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
            return
        }
        const response = await axios.post(
            API_END_POINTS.calculateScoreEndPoint,
            req.body,
            {
                ...axiosRequestConfig,
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    org: orgValue,
                    rootOrg: rootOrgValue,
                    // tslint:disable-next-line: all
                    'x-authenticated-user-token': extractUserToken(req),
                },
            }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(failedToProcess + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
})

scoringApi.post('/fetch', async (req, res) => {
    try {
        const rootOrgValue = req.headers.rootorg
        const orgValue = req.headers.org
        if (!rootOrgValue || !orgValue) {
            res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
            return
        }
        const response = await axios.post(
            API_END_POINTS.fetchScore,
            req.body,
            {
                ...axiosRequestConfig,
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    org: orgValue,
                    rootOrg: rootOrgValue,
                    // tslint:disable-next-line: all
                    'x-authenticated-user-token': extractUserToken(req),
                },
            }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(failedToProcess + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
})

scoringApi.get('/getTemplate/:templateId', async (req, res) => {
    try {
        const templateId = req.params.templateId
        const rootOrgValue = req.headers.rootorg
        const orgValue = req.headers.org
        if (!rootOrgValue || !orgValue) {
            res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
            return
        }
        const response = await axios.get(API_END_POINTS.fetchTemplate(templateId), {
            ...axiosRequestConfig,
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                org: orgValue,
                rootOrg: rootOrgValue,
                // tslint:disable-next-line: all
                'x-authenticated-user-token': extractUserToken(req),
            },
        })
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(failedToProcess + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
})
