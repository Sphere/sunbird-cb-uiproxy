import axios from 'axios'
import { Request, Response, Router } from 'express'
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
const serviceHeaders = {
    'Content-Type': 'application/json',
    accesskey: accessKey,
}

// sonar-cleanup: extracted from 6 identical GET-proxy routes in this file (CHANGE 25) — buildParams kept as a lazy thunk, not a plain value, to preserve the original check-then-build ordering
/**
 * Proxies a GET request to a USER_REPORTING_SERVICE endpoint, gated by the
 * shared accesskey header. Each caller supplies its own upstream URL,
 * failure message, and optional query-params builder, since those are the
 * only pieces that differ between the six report endpoints. The params
 * builder runs only after the accesskey check passes, matching each
 * route's original check-then-build ordering.
 *
 * @param req - the incoming request; checked for a valid accesskey header
 * @param res - the Express response to send the upstream payload (or an error) on
 * @param url - the upstream USER_REPORTING_SERVICE endpoint to call
 * @param errorMessage - the message sent back when the upstream call fails
 * @param buildParams - optional query params to forward to the upstream call
 */
// tslint:disable-next-line: no-any
async function proxyReportingRoute(req: Request, res: Response, url: string, errorMessage: string, buildParams?: () => any) {
    try {
        if (req.headers.accesskey != accessKey) {
            res.status(400).json(keyMissingMessage)
            return
        }
        const response = await axios({
            headers: serviceHeaders,
            method: 'GET',
            params: buildParams ? buildParams() : undefined,
            url,
        })
        res.status(response.status).send(response.data)
    } catch (error) {
        res.status(400).json({
            message: errorMessage,
            status: 'Failed',
        })
    }
}

export const userReporting = Router()
userReporting.get('/user/top/trendingcourses', async (req, res) => {
    await proxyReportingRoute(
        req,
        res,
        API_END_POINTS_REPORTS.trendingCourses,
        'Something went wrong while fetching trending courses'
    )
})

userReporting.get('/user/certificate/downloads', async (req, res) => {
    await proxyReportingRoute(
        req,
        res,
        API_END_POINTS_REPORTS.certificateDownloads,
        'Something went wrong while fetching certifcate downloads'
    )
})
userReporting.get('/user/reg/total_count', async (req, res) => {
    await proxyReportingRoute(
        req,
        res,
        API_END_POINTS_REPORTS.regTotalCount,
        'Something went wrong while fetching registered user total count'
    )
})
userReporting.get('/user/enroll/user_count', async (req, res) => {
    await proxyReportingRoute(
        req,
        res,
        API_END_POINTS_REPORTS.enrolledUserCount,
        'Something went wrong while fetching enrolled user count'
    )
})
userReporting.get('/user/course/completed_users', async (req, res) => {
    await proxyReportingRoute(
        req,
        res,
        API_END_POINTS_REPORTS.courseCompletedUsers,
        'Something went wrong while fetching course ompleted users'
    )
})

userReporting.get('/role/course/recommendation', async (req, res) => {
    await proxyReportingRoute(
        req,
        res,
        API_END_POINTS_REPORTS.courseRecommendaion,
        'Something went wrong in course recommendation service',
        () => {
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
            return responseObject
        }
    )
})
