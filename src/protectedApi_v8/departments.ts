import axios from 'axios'
import { Router } from 'express'

import { axiosRequestConfig } from '../configs/request.config'
import { API_END_POINTS } from './apiConstants'

export const deptApi = Router()
const unknownError = 'Failed due to unknown reason'

deptApi.get('/getAllDept', async (_req, res) => {
    try {
        const response = await axios.get(API_END_POINTS.getAllDepartment, axiosRequestConfig)
        res.status(response.status).send(response.data)
    } catch (err) {
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
})

deptApi.get('/searchDept', async (req, res) => {
    try {
        const friendlyNameValue = req.query.friendlyName
        const response = await axios.get(API_END_POINTS.searchDepartment(friendlyNameValue), axiosRequestConfig)
        res.status(response.status).send(response.data)
    } catch (err) {
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
})
