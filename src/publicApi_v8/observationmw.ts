import axios from 'axios'
import { Router } from 'express'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'

const API_END_POINTS = {
    // tslint:disable-next-line: no-any
    getAllMenteeForMentor: `${CONSTANTS.HTTPS_HOST}/api/observationmw/v1/mentor/getAllMenteeForMentor`,
    getObservationForMentee: `${CONSTANTS.HTTPS_HOST}/api/observationmw/v1/mentor/getObservationForMentee`,
    resendOtp: `${CONSTANTS.HTTPS_HOST}/api/observationmw/v1/otp/retry`,
    sendOtp: `${CONSTANTS.HTTPS_HOST}/api/observationmw/v1/otp/sendOtp`,
    verifyOtp: `${CONSTANTS.HTTPS_HOST}/api/observationmw/v1/otp/verifyOtp`,
}
const unknownError = 'Failed due to unknown reason'

export const observationmwApi = Router()
const authenticatedToken = 'x-authenticated-user-token'
observationmwApi.get('/v1/mentor/getAllMenteeForMentor', async (req, res) => {
    try {
        /* tslint:disable-next-line */
        let mentorId = req.query.mentorId
        const response = await axios({
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                authenticatedToken: req.headers[authenticatedToken],

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
        const response = await axios({
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                authenticatedToken: req.headers[authenticatedToken],

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
        let phone = req.query.phone
        const response = await axios({
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                authenticatedToken: req.headers[authenticatedToken],

            },
            method: 'GET',
            params: { phone },
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
        const response = await axios({
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                authenticatedToken: req.headers[authenticatedToken],

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
        const response = await axios({
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                authenticatedToken: req.headers[authenticatedToken],

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
