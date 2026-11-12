import axios from 'axios'
import { Router } from 'express'
import { CONSTANTS } from '../utils/env'
import { API_END_POINTS } from './apiConstants'
const accessKey = CONSTANTS.EKSHAMATA_SECURITY_KEY_MASTER
const keyMissingMessage = {
    message: 'Access key invalid or not present',
    status: 'Failed',
}
const serviceHeaders = {
    'Content-Type': 'application/json',
    accesskey: accessKey,
}

export const userReporting = Router()
userReporting.get('/user/top/trendingcourses', async (req, res) => {
    try {
        if (req.headers.accesskey != accessKey) {
            res.status(400).json(keyMissingMessage)
            return
        }
        const response = await axios({
            headers: serviceHeaders,
            method: 'GET',
            url: API_END_POINTS.trendingCourses,
        })
        res.status(response.status).send(response.data)
    } catch (error) {
        res.status(400).json({
            message: 'Something went wrong while fetching trending courses',
            status: 'Failed',
        })
    }
})

userReporting.get('/user/certificate/downloads', async (req, res) => {
    try {
        if (req.headers.accesskey != accessKey) {
            res.status(400).json(keyMissingMessage)
            return
        }
        const response = await axios({
            headers: serviceHeaders,
            method: 'GET',
            url: API_END_POINTS.certificateDownloads,
        })
        res.status(response.status).send(response.data)
    } catch (error) {
        res.status(400).json({
            message: 'Something went wrong while fetching certifcate downloads',
            status: 'Failed',
        })
    }
})
userReporting.get('/user/reg/total_count', async (req, res) => {
    try {
        if (req.headers.accesskey != accessKey) {
            res.status(400).json(keyMissingMessage)
            return
        }
        const response = await axios({
            headers: serviceHeaders,
            method: 'GET',
            url: API_END_POINTS.regTotalCount,
        })
        res.status(response.status).send(response.data)
    } catch (error) {
        res.status(400).json({
            message: 'Something went wrong while fetching registered user total count',
            status: 'Failed',
        })
    }
})
userReporting.get('/user/enroll/user_count', async (req, res) => {
    try {
        if (req.headers.accesskey != accessKey) {
            res.status(400).json(keyMissingMessage)
            return
        }
        const response = await axios({
            headers: serviceHeaders,
            method: 'GET',
            url: API_END_POINTS.enrolledUserCount,
        })
        res.status(response.status).send(response.data)
    } catch (error) {
        res.status(400).json({
            message: 'Something went wrong while fetching enrolled user count',
            status: 'Failed',
        })
    }
})
userReporting.get('/user/course/completed_users', async (req, res) => {
    try {
        if (req.headers.accesskey != accessKey) {
            res.status(400).json(keyMissingMessage)
            return
        }
        const response = await axios({
            headers: serviceHeaders,
            method: 'GET',
            url: API_END_POINTS.courseCompletedUsers,
        })
        res.status(response.status).send(response.data)
    } catch (error) {
        res.status(400).json({
            message: 'Something went wrong while fetching course ompleted users',
            status: 'Failed',
        })
    }
})

userReporting.get('/role/course/recommendation', async (req, res) => {
    try {
        if (req.headers.accesskey != accessKey) {
            res.status(400).json(keyMissingMessage)
            return
        }
        const responseObject = {
            background: req.query.background || '',
            profession: req.query.profession || '',
        }
        if (!req.query.background) {
            delete responseObject.background
        }
        if (!req.query.profession) {
            delete responseObject.profession
        }
        const response = await axios({
            headers: serviceHeaders,
            method: 'GET',
            params: responseObject,
            url: API_END_POINTS.courseRecommendaion,
        })
        res.status(response.status).send(response.data)
    } catch (error) {
        res.status(400).json({
            message: 'Something went wrong in course recommendation service',
            status: 'Failed',
        })
    }
})
