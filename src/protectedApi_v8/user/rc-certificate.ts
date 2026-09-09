import axios from 'axios'
import { Router } from 'express'
import { CONSTANTS } from '../../utils/env'
import { logInfo } from '../../utils/logger'
import { extractUserIdFromRequest, extractUserToken } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'

export const rcCert = Router()
const contentTypeHeader = { 'Content-Type': 'application/json' }

rcCert.get('/user/enrollment/list/adhocCertificates', async (req, res) => {
    try {
        /* tslint:disable-next-line */
        logInfo("Inside user enrollment list for Adhoc certificates")
        logInfo('Request params', JSON.stringify(req.query))
        const enrollmentParams = req.query
        const userId = extractUserIdFromRequest(req)
        const sunbirdEnrollmentApiResponse = await axios({
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                contentTypeHeader,
                'x-authenticated-user-token': extractUserToken(req),
            },
            method: 'GET',
            params: enrollmentParams,
            url: `${API_END_POINTS.userEnrollmentList}/${userId}`,
        })
        const generalCertificatesFromSunbird = sunbirdEnrollmentApiResponse.data.result.courses.map(((courseData) => {
            if (courseData.issuedCertificates.length > 0) {
                courseData.issuedCertificates[0].certificateType = 'General'
                return courseData
            }
            return courseData
        }))
        let sunbirdRcCertificates
        try {
            const rcMapperApiResponse = await axios({
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    contentTypeHeader,
                    'x-authenticated-user-token': extractUserToken(req),
                },
                method: 'GET',
                params: { userId },
                url: `${API_END_POINTS.rcMapperHost}`,
            })
            sunbirdRcCertificates = rcMapperApiResponse.data.data
        } catch (error) {
            sunbirdRcCertificates = []
            logInfo(JSON.stringify(error))
        }
        const combinedCertificatesData = {
            generalCertificates: generalCertificatesFromSunbird,
            sunbirdRcCertificates,
        }
        res.status(200).send(combinedCertificatesData)
    } catch (err) {
        logInfo(JSON.stringify(err))
        res.status((err && err.response && err.response.status) || 500).send(
            (err && err.response && err.response.data) || {
                error: 'Something went wrong fetching results',
            }
        )
    }
})
