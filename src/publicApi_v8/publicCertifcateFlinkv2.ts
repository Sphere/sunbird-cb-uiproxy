import { Router } from 'express'
import { fetchAndRenderCertificate } from '../utils/certificateRenderer'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'
const cassandra = require('cassandra-driver')

const VALIDATION_FAIL =
  'Sorry ! Download cerificate not worked . Please try again in sometime.'
export const publicCertificateFlinkv2 = Router()

// sonar-cleanup: certificate-fetch+render tail moved into
// utils/certificateRenderer.ts, shared with appCertificateDownload.ts (CHANGE 29)
publicCertificateFlinkv2.get('/download', async (req, res) => {
  try {
    const userid = req.query.userid
    const courseid = req.query.courseid
    const secretKey = req.query.secretKey

    if (!(userid || courseid || secretKey)) {
      res.status(400).json({
        msg: 'UserID, courseID or secretKey can not be empty',
        status: 'error',
        status_code: 400,
      })
    }
    const certificateKey = CONSTANTS.CERTIFICATE_DOWNLOAD_KEY
    if (certificateKey !== secretKey) {
      res.status(400).json({
        msg: 'Invalid certificate download key',
        status: 'error',
        status_code: 400,
      })
    }
    const client = new cassandra.Client({
      contactPoints: [CONSTANTS.CASSANDRA_IP],
      keyspace: 'sunbird_courses',
      localDataCenter: 'datacenter1',
    })
    // tslint:disable-next-line: max-line-length
    const query = `SELECT userid, courseid, batchid, issued_certificates FROM sunbird_courses.user_enrolments WHERE userid='${userid}' AND courseid='${courseid}'`
    const certificateData = await client.execute(query)
    if (!certificateData) {
      res.status(400).json({
        msg: 'Certificate ID cannot be fetched',
        status: 'error',
        status_code: 400,
      })
    }
    client.shutdown()
    const certificateId =
      certificateData.rows[0].issued_certificates[0].identifier
    const certificateName = certificateData.rows[0].issued_certificates[0].name
    await fetchAndRenderCertificate(res, certificateId, certificateName)
  } catch (error) {
    logError('Error in validate certificate  >>>>>>' + error)
    res.status(500).send({
      message: VALIDATION_FAIL,
      status: 'failed',
    })
  }
})
