import axios from 'axios'
import { Router } from 'express'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'

const API_END_POINTS = {
    // tslint:disable-next-line: no-any
    getAllMenteeForMentor: `${CONSTANTS.HTTPS_HOST}/api/observationmw/v1/mentor/getAllMenteeForMentor`,
    getObservationForMentee: `${CONSTANTS.HTTPS_HOST}/api/observationmw/v1/mentor/getObservationForMentee`,
    getSurveyDetails: `${CONSTANTS.HTTPS_HOST}/api/observationmw/v1/survey/getSurveyDetails`,

    resendOtp: `${CONSTANTS.HTTPS_HOST}/api/observationmw/v1/otp/retry`,
    sendOtp: `${CONSTANTS.HTTPS_HOST}/api/observationmw/v1/otp/sendOtp`,
    verifyOtp: `${CONSTANTS.HTTPS_HOST}/api/observationmw/v1/otp/verifyOtp`,
    verifySurveyLink: `${CONSTANTS.HTTPS_HOST}/api/observationmw/v1/survey/verifySurveyLink`,
}
const unknownError = 'Failed due to unknown reason'
const authTokenMissingError = 'Auth token missing from request'

export const observationmwApi = Router()
const authenticatedToken = 'x-authenticated-user-token'
observationmwApi.get('/v1/mentor/getAllMenteeForMentor', async (req, res) => {
    try {
        /* tslint:disable-next-line */
        let mentorId = req.query.mentorId
        if (!req.headers[authenticatedToken]) {
            return res.status(401).json({
                message: authTokenMissingError,
            })
        }
        const response = await axios({
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                [authenticatedToken]: req.headers[authenticatedToken],

            },
            method: 'GET',
            params: { mentorId },
            url: API_END_POINTS.getAllMenteeForMentor,
        })
        res.status(200).send(response.data)
    } catch (err) {
        logInfo(JSON.stringify(err))
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
})
observationmwApi.get('/v1/mentor/getObservationForMentee', async (req, res) => {
    try {
        /* tslint:disable-next-line */
        let menteeId = req.query.menteeId

        if (!req.headers[authenticatedToken]) {
            return res.status(401).json({
                message: authTokenMissingError,
            })
        }
        const response = await axios({
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                [authenticatedToken]: req.headers[authenticatedToken],

            },
            method: 'GET',
            params: { menteeId },
            url: API_END_POINTS.getObservationForMentee,
        })
        res.status(200).send(response.data)
    } catch (err) {
        logInfo(JSON.stringify(err))
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
})
observationmwApi.get('/v1/mentee/verification/sendOtp', async (req, res) => {
    try {
        /* tslint:disable-next-line */
        let menteeId = req.query.menteeId
        if (!req.headers[authenticatedToken]) {
            return res.status(401).json({
                message: authTokenMissingError,
            })
        }
        const response = await axios({
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                [authenticatedToken]: req.headers[authenticatedToken],

            },
            method: 'GET',
            params: { menteeId },
            url: API_END_POINTS.sendOtp,
        })
        res.status(200).send(response.data)
    } catch (err) {
        logInfo(JSON.stringify(err))
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
})
observationmwApi.get('/v1/mentee/verification/verifyOtp', async (req, res) => {
    try {
        /* tslint:disable-next-line */
        let { phone, otp } = req.query;
        if (!req.headers[authenticatedToken]) {
            return res.status(401).json({
                message: authTokenMissingError,
            })
        }
        const response = await axios({
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                [authenticatedToken]: req.headers[authenticatedToken],

            },
            method: 'GET',
            params: { phone, otp },
            url: API_END_POINTS.verifyOtp,
        })
        res.status(200).send(response.data)
    } catch (err) {
        logInfo(JSON.stringify(err))
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
})
observationmwApi.get('/v1/mentee/verification/resendOtp', async (req, res) => {
    try {
        /* tslint:disable-next-line */
        let phone = req.query.phone
        if (!req.headers[authenticatedToken]) {
            return res.status(401).json({
                message: authTokenMissingError,
            })
        }
        const response = await axios({
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                [authenticatedToken]: req.headers[authenticatedToken],
            },
            method: 'GET',
            params: { phone },
            url: API_END_POINTS.resendOtp,
        })
        res.status(200).send(response.data)
    } catch (err) {
        logInfo(JSON.stringify(err))
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
})
observationmwApi.post('/v1/survey/verifySurveyLink', async (req, res) => {
    try {
        /* tslint:disable-next-line */
        let surveyLink = req.query.surveyLink
        if (!req.headers[authenticatedToken]) {
            return res.status(401).json({
                message: authTokenMissingError,
            })
        }
        const response = await axios({
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                [authenticatedToken]: req.headers[authenticatedToken],
            },
            method: 'POST',
            params: { surveyLink },
            url: API_END_POINTS.verifySurveyLink,
        })
        res.status(200).send(response.data)
    } catch (err) {
        logInfo(JSON.stringify(err))
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
})
observationmwApi.get('/v1/survey/getSurveyDetails', async (req, res) => {
    try {
        /* tslint:disable-next-line */
        let solutionId = req.query.solutionId
        if (!req.headers[authenticatedToken]) {
            return res.status(401).json({
                message: authTokenMissingError,
            })
        }
        const response = await axios({
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                [authenticatedToken]: req.headers[authenticatedToken],
            },
            method: 'GET',
            params: { solutionId },
            url: API_END_POINTS.getSurveyDetails,
        })
        res.status(200).send(response.data)
    } catch (err) {
        logInfo(JSON.stringify(err))
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: unknownError,
            }
        )
    }
})
