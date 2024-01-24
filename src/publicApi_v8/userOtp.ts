import cassandra from 'cassandra-driver'
import { Router } from 'express'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
const client = new cassandra.Client({
    contactPoints: [CONSTANTS.CASSANDRA_IP],
    keyspace: 'sunbird',
    localDataCenter: 'datacenter1',
})
export const userOtp = Router()
const otpExtractionKey = CONSTANTS.OTP_EXTRACTION_KEY
userOtp.post('/', async (req, res) => {
    try {
        logInfo(JSON.stringify(req.body))
        logInfo("Inside otp route")
        const userDetails = req.body
        const userOtpExtractionKey = req.headers.extractionkey
        if (userOtpExtractionKey != otpExtractionKey) {
            return res.status(400).json({
                message: 'Extraction key missing or invalid',
            })
        }
        const query = `SELECT * FROM sunbird.otp WHERE type='${userDetails.type}' AND key='${userDetails.key}'`
        const otpData = await client.execute(query)
        if (!otpData) {
            res.status(400).json({
                msg: 'OTP cannot be fetched',
                status: 'error',
                status_code: 400,
            })
        }
        res.status(200).json({
            data: otpData.rows,
            message: 'SUCCESS',
        })
    } catch (error) {
        logInfo(JSON.stringify(error))
        res.status(400).json({
            message: 'Something went wrong while fetching OTP',
        })
    }

})
