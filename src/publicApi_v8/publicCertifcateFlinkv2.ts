import { Router } from 'express'
import { resolveAndRenderCertificateFromCassandra } from '../utils/certificateRenderer'
import { logError } from '../utils/logger'

const VALIDATION_FAIL =
  'Sorry ! Download cerificate not worked . Please try again in sometime.'
export const publicCertificateFlinkv2 = Router()

// sonar-cleanup: certificate-fetch+render tail moved into
// utils/certificateRenderer.ts, shared with appCertificateDownload.ts (CHANGE 29).
// The userid/courseid/secretKey-through-Cassandra-lookup middle section is
// also shared, with mobileAppApi.ts's '/ios/certificateDownload' (CHANGE 48).
publicCertificateFlinkv2.get('/download', async (req, res) => {
  try {
    await resolveAndRenderCertificateFromCassandra(req, res)
  } catch (error) {
    logError('Error in validate certificate  >>>>>>' + error)
    res.status(500).send({
      message: VALIDATION_FAIL,
      status: 'failed',
    })
  }
})
