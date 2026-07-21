import axios from 'axios'
import { Router } from 'express'

import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractAuthorizationFromRequest, extractUserId, extractUserToken } from '../utils/requestExtract'
import { API_END_POINTS } from './apiConstants'

const workallocationV1Path = 'v1/workallocation'
const workallocationV2Path = 'v2/workallocation'

export const workAllocationApi = Router()

const failedToProcess = 'Failed to process the request. '
const userIdFailedMessage = 'NO_USER_ID'
const workAllocationIdFailedMessage = 'NO_WORK_ALLOCATION_ID'
const workOrderIdFailedMessage = 'NO_WORKORDER_ID'

workAllocationApi.post('/add', async (req, res) => {
    try {
        const userId = extractUserId(req)
        if (!userId) {
            res.status(400).send(userIdFailedMessage)
            return
        }
        const response = await axios.post(
            API_END_POINTS.workallocationAddAllocation(workallocationV1Path),
            req.body,
            {
                ...axiosRequestConfig,
                headers: {
                    Authorization: extractAuthorizationFromRequest(req),
                    userId,
                },
            }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(Error + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: ERROR.GENERAL_ERR_MSG,
            }
        )
    }
})

workAllocationApi.post('/update', async (req, res) => {
    try {
        const userId = extractUserId(req)
        if (!userId) {
            res.status(400).send(userIdFailedMessage)
            return
        }
        const response = await axios.post(
            API_END_POINTS.workallocationUpdateAllocation,
            req.body,
            {
                ...axiosRequestConfig,
                headers: {
                    Authorization: extractAuthorizationFromRequest(req),
                    userId,
                },
            }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(failedToProcess + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: ERROR.GENERAL_ERR_MSG,
            }
        )
    }
})

workAllocationApi.post('/userSearch', async (req, res) => {
    try {
        const response = await axios.post(
            API_END_POINTS.workallocationGetUsers,
            req.body,
            {
                ...axiosRequestConfig,
                headers: {
                },
            }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(failedToProcess + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: ERROR.GENERAL_ERR_MSG,
            }
        )
    }
})

workAllocationApi.get('/user/autocomplete/:searchTerm', async (req, res) => {
    try {
        const searchTerm = req.params.searchTerm
        const response = await axios.get(API_END_POINTS.workallocationUserAutoComplete(searchTerm), {
            ...axiosRequestConfig,
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                // tslint:disable-next-line: no-duplicate-string
                'x-authenticated-user-token': extractUserToken(req),
            },
        })
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(failedToProcess + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: ERROR.GENERAL_ERR_MSG,
            }
        )
    }
})

// ------------------ Work allocation v2 API'S ----------------------

workAllocationApi.post('/v2/add', async (req, res) => {
    try {
        const userId = extractUserId(req)
        if (!userId) {
            res.status(400).send(userIdFailedMessage)
            return
        }
        const response = await axios.post(
            API_END_POINTS.workallocationAddAllocation(workallocationV2Path),
            req.body,
            {
                ...axiosRequestConfig,
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    userId,
                    // tslint:disable-next-line: no-duplicate-string
                    'x-authenticated-user-token': extractUserToken(req),

                },
            }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(Error + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: ERROR.GENERAL_ERR_MSG,
            }
        )
    }
})

workAllocationApi.post('/v2/update', async (req, res) => {
    try {
        const userId = extractUserId(req)
        if (!userId) {
            res.status(400).send(userIdFailedMessage)
            return
        }
        const response = await axios.post(
            API_END_POINTS.workallocationUpdateWorkAllocation(workallocationV2Path),
            req.body,
            {
                ...axiosRequestConfig,
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    userId,
                    // tslint:disable-next-line: no-duplicate-string
                    'x-authenticated-user-token': extractUserToken(req),
                },
            }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(Error + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: ERROR.GENERAL_ERR_MSG,
            }
        )
    }
})
workAllocationApi.post('/add/workorder', async (req, res) => {
    try {
        const userId = extractUserId(req)
        if (!userId) {
            res.status(400).send(userIdFailedMessage)
            return
        }
        const response = await axios.post(
            API_END_POINTS.workallocationAddWorkOrder(workallocationV2Path),
            req.body,
            {
                ...axiosRequestConfig,
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    userId,
                    // tslint:disable-next-line: no-duplicate-string
                    'x-authenticated-user-token': extractUserToken(req),
                },
            }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(Error + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: ERROR.GENERAL_ERR_MSG,
            }
        )
    }
})
workAllocationApi.post('/update/workorder', async (req, res) => {
    try {
        const userId = extractUserId(req)
        if (!userId) {
            res.status(400).send(userIdFailedMessage)
            return
        }
        const response = await axios.post(
            API_END_POINTS.workallocationUpdateWorkOrder(workallocationV2Path),
            req.body,
            {
                ...axiosRequestConfig,
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    userId,
                    // tslint:disable-next-line: no-duplicate-string
                    'x-authenticated-user-token': extractUserToken(req),
                },
            }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(Error + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: ERROR.GENERAL_ERR_MSG,
            }
        )
    }
})

workAllocationApi.post('/getWorkOrders', async (req, res) => {
    try {
        const response = await axios.post(
            API_END_POINTS.workallocationGetWorkOrders(workallocationV2Path),
            req.body,
            {
                ...axiosRequestConfig,
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    // tslint:disable-next-line: no-duplicate-string
                    'x-authenticated-user-token': extractUserToken(req),
                },
            }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(Error + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: ERROR.GENERAL_ERR_MSG,
            }
        )
    }
})

workAllocationApi.get('/getWorkOrderById/:workOrderId', async (req, res) => {
    try {
        const workOrderId = req.params.workOrderId
        if (!workOrderId) {
            res.status(400).send(workOrderIdFailedMessage)
            return
        }
        const response = await axios.get(
            API_END_POINTS.workallocationGetWorkOrderById(workallocationV2Path, workOrderId),
            {
                ...axiosRequestConfig,
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    // tslint:disable-next-line: no-duplicate-string
                    'x-authenticated-user-token': extractUserToken(req),
                },
            }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(Error + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: ERROR.GENERAL_ERR_MSG,
            }
        )
    }
})

workAllocationApi.get('/getWorkAllocationById/:workAllocationId', async (req, res) => {
    try {
        const workAllocationId = req.params.workAllocationId
        if (!workAllocationId) {
            res.status(400).send(workAllocationIdFailedMessage)
            return
        }
        const response = await axios.get(
            API_END_POINTS.workallocationGetWorkAllocationById(workallocationV2Path, workAllocationId),
            {
                ...axiosRequestConfig,
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    // tslint:disable-next-line: no-duplicate-string
                    'x-authenticated-user-token': extractUserToken(req),
                },
            }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(Error + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: ERROR.GENERAL_ERR_MSG,
            }
        )
    }
})

workAllocationApi.post('/copy/workOrder', async (req, res) => {
    try {
        const userId = extractUserId(req)
        if (!userId) {
            res.status(400).send(userIdFailedMessage)
            return
        }
        const response = await axios.post(
            API_END_POINTS.workallocationCopyWorkOrder(workallocationV2Path),
            req.body,
            {
                ...axiosRequestConfig,
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    userId,
                    // tslint:disable-next-line: no-duplicate-string
                    'x-authenticated-user-token': extractUserToken(req),
                },
            }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(Error + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: ERROR.GENERAL_ERR_MSG,
            }
        )
    }
})

workAllocationApi.get('/getUserBasicInfo/:userId', async (req, res) => {
    try {
        const userId = req.params.userId
        if (!userId) {
            res.status(400).send(userIdFailedMessage)
            return
        }
        const response = await axios.get(
            API_END_POINTS.workallocationGetUserBasicDetails(userId),
            {
                ...axiosRequestConfig,
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    // tslint:disable-next-line: no-duplicate-string
                    'x-authenticated-user-token': extractUserToken(req),
                },
            }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(Error + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: ERROR.GENERAL_ERR_MSG,
            }
        )
    }
})

workAllocationApi.get('/getWOPdf/:workOrderId', async (req, res) => {
    try {
        const workOrderId = req.params.workOrderId
        if (!workOrderId) {
            res.status(400).send(workOrderIdFailedMessage)
            return
        }
        const response = await axios.get(
            API_END_POINTS.workallocationGetPdf(workOrderId),
            {
                ...axiosRequestConfig,
                headers: {
                    Accept: 'application/pdf',
                    Authorization: CONSTANTS.SB_API_KEY,
                    // tslint:disable-next-line: no-duplicate-string
                    'x-authenticated-user-token': extractUserToken(req),

                },
                responseType: 'arraybuffer',

            }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        logError(Error + err)
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: ERROR.GENERAL_ERR_MSG,
            }
        )
    }
})
