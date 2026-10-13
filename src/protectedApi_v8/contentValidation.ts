import axios from 'axios'
import { Router } from 'express'

import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractUserToken } from '../utils/requestExtract'
import { API_END_POINTS } from './apiConstants'

export const contentValidationApi = Router()
const unknownError = 'Failed due to unknown reason'
const failedToProcess = 'Failed to process the request. '

contentValidationApi.get('/checkProfanity/:contentId/:userId', async (req, res) => {
    try {
        const rootOrgValue = req.headers.rootorg
        const orgValue = req.headers.org
        const widValue = req.headers.wid
        const userId = req.params.userId
        const contentId = req.params.contentId
        if (!rootOrgValue || !orgValue || !widValue || !contentId || !userId) {
            res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
            return
        }

        const response = await axios.get(API_END_POINTS.checkProfanity(contentId, userId), {
            ...axiosRequestConfig,
            headers: {
                org: orgValue,
                rootOrg: rootOrgValue,
                wid: widValue,
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

contentValidationApi.post('/checkTextProfanity', async (req, res) => {
    try {
        const response = await axios.post(API_END_POINTS.checkTextProfanity, req.body, axiosRequestConfig)
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

contentValidationApi.post('/validatePdfContent', async (req, res) => {
    try {
        const response = await axios.post(API_END_POINTS.checkPdfProfanity, req.body, axiosRequestConfig)
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

contentValidationApi.post('/startPdfProfanity', async (req, res) => {
    try {
        const response = await axios.post(API_END_POINTS.startPdfProfanity, req.body,  {
            ...axiosRequestConfig,
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
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

contentValidationApi.post('/getPdfProfanity', async (req, res) => {
    try {
        const response = await axios.post(API_END_POINTS.getPdfProfanity, req.body,  {
            ...axiosRequestConfig,
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
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

contentValidationApi.get('/getPdfProfanityForContent/:contentId', async (req, res) => {
    try {
        const contentId = req.params.contentId
        const rootOrgValue = req.headers.rootorg
        const wid = req.headers.wid
        const response = await axios.get(API_END_POINTS.getPdfProfanityForContent(contentId), {
            ...axiosRequestConfig,
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                'Content-Type': 'application/json',
                rootOrg: rootOrgValue,
                wid,
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
