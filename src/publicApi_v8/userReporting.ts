import axios from 'axios'
import { Router } from 'express'
import { logInfo } from 'src/utils/logger'
import { CONSTANTS } from '../utils/env'

const API_END_POINTS_REPORTS = {
    certificateDownloads: `${CONSTANTS.USER_REPORTING_SERVICE}/user/certificate/downloads`,
    courseCompletedUsers: `${CONSTANTS.USER_REPORTING_SERVICE}/user/course/completed_users`,
    courseRecommendaion: `${CONSTANTS.USER_REPORTING_SERVICE}/role/course/recommendation`,
    enrolledUserCount: `${CONSTANTS.USER_REPORTING_SERVICE}/user/enroll/user_count`,
    regTotalCount: `${CONSTANTS.USER_REPORTING_SERVICE}/user/reg/total_count`,
    trendingCourses: `${CONSTANTS.USER_REPORTING_SERVICE}/user/top/trendingcourses`,
}
const accessKey = CONSTANTS.EKSHAMATA_SECURITY_KEY_MASTER
const keyMissingMessage = {
    message: 'Access key invalid or not present',
    status: 'Failed',
}

export const userReporting = Router()
userReporting.get('/user/top/trendingcourses', async (req, res) => {
    try {
        if (req.headers.accesskey != accessKey) {
            res.status(400).json(keyMissingMessage)
            return
        }
        const response = await axios({
            method: 'GET',
            url: API_END_POINTS_REPORTS.trendingCourses,
        })
        res.status(response.status).send(response.data)
    } catch (error) {
        logInfo(error)
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
            method: 'GET',
            url: API_END_POINTS_REPORTS.certificateDownloads,
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
            method: 'GET',
            url: API_END_POINTS_REPORTS.regTotalCount,
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
            method: 'GET',
            url: API_END_POINTS_REPORTS.enrolledUserCount,
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
            method: 'GET',
            url: API_END_POINTS_REPORTS.courseCompletedUsers,
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
            method: 'GET',
            params: responseObject,
            url: API_END_POINTS_REPORTS.courseRecommendaion,
        })
        res.status(response.status).send(response.data)
    } catch (error) {
        res.status(400).json({
            message: 'Something went wrong in course recommendation service',
            status: 'Failed',
        })
    }
})
