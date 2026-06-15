import axios from 'axios'
import { Router } from 'express'

import { axiosRequestConfig } from '../configs/request.config'
import { API_END_POINTS } from './apiConstants'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractUserToken } from '../utils/requestExtract'

export const workflowHandlerApi = Router()
const unknownError = 'Failed due to unknown reason'
const failedToProcess = 'Failed to process the request. '

workflowHandlerApi.post('/transition', async (req, res) => {
    try {
        const rootOrgValue = req.headers.rootorg
        const orgValue = req.headers.org
        if (!rootOrgValue || !orgValue) {
            res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
            return
        }
        const response = await axios.post(
            API_END_POINTS.applicationTransition,
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

workflowHandlerApi.post('/applicationsSearch', async (req, res) => {
    try {
        const rootOrgValue = req.headers.rootorg
        const orgValue = req.headers.org
        if (!rootOrgValue || !orgValue) {
            res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
            return
        }
        const response = await axios.post(
            API_END_POINTS.applicationsSearch,
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

workflowHandlerApi.get('/nextActionSearch/:serviceName/:state', async (req, res) => {
    try {
        const serviceName = req.params.serviceName
        const state = req.params.state
        const rootOrgValue = req.headers.rootorg
        const orgValue = req.headers.org
        const response = await axios.get(API_END_POINTS.nextActionSearch(serviceName, state), {
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

workflowHandlerApi.get('/historyByApplicationIdAndWfId/:applicationId/:wfId', async (req, res) => {
    try {
        const wfId = req.params.wfId
        const applicationId = req.params.applicationId
        const rootOrgValue = req.headers.rootorg
        const orgValue = req.headers.org
        const response = await axios.get(API_END_POINTS.historyBasedOnWfId(wfId, applicationId), {
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

workflowHandlerApi.get('/workflowProcess/:wfId', async (req, res) => {
    try {
        const wfId = req.params.wfId
        const rootOrgValue = req.headers.rootorg
        const response = await axios.get(API_END_POINTS.workflowProcess(wfId), {
            ...axiosRequestConfig,
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
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

workflowHandlerApi.get('/historyByApplicationId/:applicationId', async (req, res) => {
    try {
        const applicationId = req.params.applicationId
        const rootOrgValue = req.headers.rootorg
        const orgValue = req.headers.org
        const response = await axios.get(API_END_POINTS.historyBasedOnApplicationId(applicationId), {
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

workflowHandlerApi.post('/updateUserProfileWf', async (req, res) => {
    try {
        const rootOrgValue = req.headers.rootorg
        const orgValue = req.headers.org
        if (!rootOrgValue || !orgValue) {
            res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
            return
        }
        const response = await axios.post(
            API_END_POINTS.workflowUserProfileUpdate,
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

workflowHandlerApi.post('/userWfSearch', async (req, res) => {
    try {
        const rootOrgValue = req.headers.rootorg
        const orgValue = req.headers.org
        const wid = req.headers.wid
        if (!rootOrgValue || !orgValue) {
            res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
            return
        }
        const response = await axios.post(
            API_END_POINTS.userWfSearch,
            req.body,
            {
                ...axiosRequestConfig,
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    org: orgValue,
                    rootOrg: rootOrgValue,
                    wid,
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

workflowHandlerApi.post('/userWFApplicationFieldsSearch', async (req, res) => {
    try {
        const rootOrgValue = req.headers.rootorg
        const orgValue = req.headers.org
        const wid = req.headers.wid
        if (!rootOrgValue || !orgValue) {
            res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
            return
        }
        const response = await axios.post(
            API_END_POINTS.userWfFieldsSearch,
            req.body,
            {
                ...axiosRequestConfig,
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    org: orgValue,
                    rootOrg: rootOrgValue,
                    wid,
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
