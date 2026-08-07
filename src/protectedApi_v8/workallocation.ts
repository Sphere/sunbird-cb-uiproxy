import axios from 'axios'
import { Response, Router } from 'express'

import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractAuthorizationFromRequest, extractUserId, extractUserToken } from '../utils/requestExtract'

const workallocationV1Path = 'v1/workallocation'
const workallocationV2Path = 'v2/workallocation'
const API_END_POINTS = {
    addAllocationEndPoint: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/add`,
    addWorkOrderEndPoint: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/add/workorder`,
    copyWorkOrderEndPoint: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/copy/workOrder`,
    getPdf: (id: string) => `${CONSTANTS.KONG_API_BASE}/getWOPdf/${id}`,
    getUserBasicDetails: (userId: string) => `${CONSTANTS.KONG_API_BASE}/${workallocationV2Path}/user/basicInfo/${userId}`,
    getUsersEndPoint: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/workallocation/getUsers`,
    getWorkAllocationById: (path: string, id: string) => `${CONSTANTS.KONG_API_BASE}/${path}/getWorkAllocationById/${id}`,
    getWorkOrderById: (path: string, id: string) => `${CONSTANTS.KONG_API_BASE}/${path}/getWorkOrderById/${id}`,
    getWorkOrders: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/getWorkOrders`,
    updateAllocationEndPoint: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/workallocation/update`,
    updateWorkAllocationEndPoint: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/update`,
    updateWorkOrder: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/update/workorder`,
    userAutoCompleteEndPoint: (searchTerm: string) =>
    `${CONSTANTS.KONG_API_BASE}/v1/workallocation/users/autocomplete?searchTerm=${searchTerm}`,
}

export const workAllocationApi = Router()

const failedToProcess = 'Failed to process the request. '
const userIdFailedMessage = 'NO_USER_ID'
const workAllocationIdFailedMessage = 'NO_WORK_ALLOCATION_ID'
const workOrderIdFailedMessage = 'NO_WORKORDER_ID'

/**
 * Sends a 400 with `failMessage` and returns false if `value` is missing;
 * otherwise returns true. Callers should return immediately on false.
 *
 * @param res - the Express response to send the 400 on, if the value is missing
 * @param value - the route param/lookup result being checked
 * @param failMessage - body to send when `value` is missing
 */
function requireParam(res: Response, value: string | undefined, failMessage: string): boolean {
  if (!value) {
    res.status(400).send(failMessage)
    return false
  }
  return true
}

/**
 * Responds with the upstream status code (or 500) and the upstream error
 * body (or a generic error message).
 *
 * `useBuggyLog` preserves a pre-existing bug verbatim: most routes here log
 * `Error + err` (string-coercing the global Error constructor, not the
 * caught error's message) instead of the intended `failedToProcess + err`.
 * Each call site passes whichever form that route already had — not fixed
 * here, since that would be a behavior change beyond deduplication.
 *
 * @param res - the Express response to send the error on
 * @param err - the caught error, expected to optionally carry an axios-style `response`
 * @param useBuggyLog - true for routes whose existing log call was `Error + err`
 */
// tslint:disable-next-line: no-any
function handleWorkAllocationError(res: Response, err: any, useBuggyLog: boolean) {
  // tslint:disable-next-line: no-any
  logError(((useBuggyLog ? Error : failedToProcess) as any) + err)
  res.status((err && err.response && err.response.status) || 500).send(
    (err && err.response && err.response.data) || {
      error: ERROR.GENERAL_ERR_MSG,
    }
  )
}

workAllocationApi.post('/add', async (req, res) => {
    try {
        const userId = extractUserId(req)
        if (!requireParam(res, userId, userIdFailedMessage)) {
            return
        }
        const response = await axios.post(
            API_END_POINTS.addAllocationEndPoint(workallocationV1Path),
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
        handleWorkAllocationError(res, err, true)
    }
})

workAllocationApi.post('/update', async (req, res) => {
    try {
        const userId = extractUserId(req)
        if (!requireParam(res, userId, userIdFailedMessage)) {
            return
        }
        const response = await axios.post(
            API_END_POINTS.updateAllocationEndPoint,
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
        handleWorkAllocationError(res, err, false)
    }
})

workAllocationApi.post('/userSearch', async (req, res) => {
    try {
        const response = await axios.post(
            API_END_POINTS.getUsersEndPoint,
            req.body,
            {
                ...axiosRequestConfig,
                headers: {
                },
            }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        handleWorkAllocationError(res, err, false)
    }
})

workAllocationApi.get('/user/autocomplete/:searchTerm', async (req, res) => {
    try {
        const searchTerm = req.params.searchTerm
        const response = await axios.get(API_END_POINTS.userAutoCompleteEndPoint(searchTerm), {
            ...axiosRequestConfig,
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                // tslint:disable-next-line: no-duplicate-string
                'x-authenticated-user-token': extractUserToken(req),
            },
        })
        res.status(response.status).send(response.data)
    } catch (err) {
        handleWorkAllocationError(res, err, false)
    }
})

// ------------------ Work allocation v2 API'S ----------------------

workAllocationApi.post('/v2/add', async (req, res) => {
    try {
        const userId = extractUserId(req)
        if (!requireParam(res, userId, userIdFailedMessage)) {
            return
        }
        const response = await axios.post(
            API_END_POINTS.addAllocationEndPoint(workallocationV2Path),
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
        handleWorkAllocationError(res, err, true)
    }
})

workAllocationApi.post('/v2/update', async (req, res) => {
    try {
        const userId = extractUserId(req)
        if (!requireParam(res, userId, userIdFailedMessage)) {
            return
        }
        const response = await axios.post(
            API_END_POINTS.updateWorkAllocationEndPoint(workallocationV2Path),
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
        handleWorkAllocationError(res, err, true)
    }
})
workAllocationApi.post('/add/workorder', async (req, res) => {
    try {
        const userId = extractUserId(req)
        if (!requireParam(res, userId, userIdFailedMessage)) {
            return
        }
        const response = await axios.post(
            API_END_POINTS.addWorkOrderEndPoint(workallocationV2Path),
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
        handleWorkAllocationError(res, err, true)
    }
})
workAllocationApi.post('/update/workorder', async (req, res) => {
    try {
        const userId = extractUserId(req)
        if (!requireParam(res, userId, userIdFailedMessage)) {
            return
        }
        const response = await axios.post(
            API_END_POINTS.updateWorkOrder(workallocationV2Path),
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
        handleWorkAllocationError(res, err, true)
    }
})

workAllocationApi.post('/getWorkOrders', async (req, res) => {
    try {
        const response = await axios.post(
            API_END_POINTS.getWorkOrders(workallocationV2Path),
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
        handleWorkAllocationError(res, err, true)
    }
})

workAllocationApi.get('/getWorkOrderById/:workOrderId', async (req, res) => {
    try {
        const workOrderId = req.params.workOrderId
        if (!requireParam(res, workOrderId, workOrderIdFailedMessage)) {
            return
        }
        const response = await axios.get(
            API_END_POINTS.getWorkOrderById(workallocationV2Path, workOrderId),
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
        handleWorkAllocationError(res, err, true)
    }
})

workAllocationApi.get('/getWorkAllocationById/:workAllocationId', async (req, res) => {
    try {
        const workAllocationId = req.params.workAllocationId
        if (!requireParam(res, workAllocationId, workAllocationIdFailedMessage)) {
            return
        }
        const response = await axios.get(
            API_END_POINTS.getWorkAllocationById(workallocationV2Path, workAllocationId),
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
        handleWorkAllocationError(res, err, true)
    }
})

workAllocationApi.post('/copy/workOrder', async (req, res) => {
    try {
        const userId = extractUserId(req)
        if (!requireParam(res, userId, userIdFailedMessage)) {
            return
        }
        const response = await axios.post(
            API_END_POINTS.copyWorkOrderEndPoint(workallocationV2Path),
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
        handleWorkAllocationError(res, err, true)
    }
})

workAllocationApi.get('/getUserBasicInfo/:userId', async (req, res) => {
    try {
        const userId = req.params.userId
        if (!requireParam(res, userId, userIdFailedMessage)) {
            return
        }
        const response = await axios.get(
            API_END_POINTS.getUserBasicDetails(userId),
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
        handleWorkAllocationError(res, err, true)
    }
})

workAllocationApi.get('/getWOPdf/:workOrderId', async (req, res) => {
    try {
        const workOrderId = req.params.workOrderId
        if (!requireParam(res, workOrderId, workOrderIdFailedMessage)) {
            return
        }
        const response = await axios.get(
            API_END_POINTS.getPdf(workOrderId),
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
        handleWorkAllocationError(res, err, true)
    }
})
