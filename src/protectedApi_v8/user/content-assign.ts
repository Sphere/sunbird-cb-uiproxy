import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { ERROR } from '../../utils/message'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'

export const contentAssignApi = Router()

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

contentAssignApi.post('/searchUsers', async (req, res) => {
    try {
        const rootOrg = req.header('rootOrg')
        if (!rootOrg) {
            res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
            return
        }
        const response = await axios.post(
            API_END_POINTS.searchUsers,
            req.body,
            { ...axiosRequestConfig, headers: { rootOrg } }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        res
            .status((err && err.response && err.response.status) || 500)
            .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
    }
})

contentAssignApi.post('/assignContent', async (req, res) => {
    try {
        const rootOrg = req.header('rootOrg')
        const org = req.header('org')
        if (!rootOrg) {
            res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
            return
        }
        const response = await axios.post(
            API_END_POINTS.assignContent,
            req.body,
            { ...axiosRequestConfig, headers: { org, rootOrg } }
        )
        res.status(response.status).send(response.data)
    } catch (err) {
        res
            .status((err && err.response && err.response.status) || 500)
            .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
    }
})

contentAssignApi.get('/getAdminLevel', async (req, res) => {
    const userId = extractUserIdFromRequest(req)
    try {
        const rootOrg = req.header('rootOrg')
        if (!rootOrg) {
            res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
            return
        }
        const response = await axios.get(
            API_END_POINTS.userAdminLevel(userId),
            { ...axiosRequestConfig, headers: { rootOrg } }
        )

        res.status(response.status).send(response.data)
    } catch (err) {
        res
            .status((err && err.response && err.response.status) || 500)
            .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
    }
})

contentAssignApi.get('/getAssignments', async (req, res) => {
    const userId = extractUserIdFromRequest(req)
    const { assignmentType } = req.query
    try {
        const rootOrg = req.header('rootOrg')
        if (!rootOrg) {
            res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
            return
        }
        const response = await axios.get(
            `${API_END_POINTS.getAssignments(userId)}?assignmentType=${assignmentType}`,
            { ...axiosRequestConfig, headers: { rootOrg } }
        )

        res.status(response.status).send(response.data)
    } catch (err) {
        res
            .status((err && err.response && err.response.status) || 500)
            .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
    }
})
