import { Router } from 'express'
import { fetchAndRenderCertificate } from '../utils/certificateRenderer'
import { logError } from '../utils/logger'

const VALIDATION_FAIL =
  'Sorry ! Download cerificate not worked . Please try again in sometime.'
export const appCertificateDownload = Router()

// sonar-cleanup: certificate-fetch+render tail moved into
// utils/certificateRenderer.ts, shared with publicCertifcateFlinkv2.ts (CHANGE 29)
appCertificateDownload.get('/download', async (req, res) => {
  try {
    const certificateId = req.query.certificateId
    const certificateName = req.query.certificateName || 'certificate'
    if (!certificateId) {
      res.status(400).json({
        msg: 'Certificate ID can not be empty',
        status: 'error',
        status_code: 400,
      })
    }
    await fetchAndRenderCertificate(res, certificateId as string, certificateName as string)
  } catch (error) {
    logError('Error in validate certificate  >>>>>>' + error)

    res.status(500).send({
      message: VALIDATION_FAIL,
      status: 'failed',
    })
  }
})
