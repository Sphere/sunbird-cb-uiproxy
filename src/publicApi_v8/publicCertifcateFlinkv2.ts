import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import nodeHtmlToImage from 'node-html-to-image'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { svgSize, toSvgMarkup } from './adapters/certificateSvg'
import { ENROLMENT_CERTIFICATE_QUERY, pickIssuedCertificate } from './adapters/enrolmentCertificate'
import { API_END_POINTS } from './apiConstants'
const cassandra = require('cassandra-driver')
const VALIDATION_FAIL =
  'Sorry ! Download cerificate not worked . Please try again in sometime.'
export const publicCertificateFlinkv2 = Router()

publicCertificateFlinkv2.get('/download', async (req, res) => {
  try {
    const userid = req.query.userid
    const courseid = req.query.courseid
    const secretKey = req.query.secretKey

    if (!userid || !courseid || !secretKey) {
      return res.status(400).json({
        msg: 'UserID, courseID or secretKey can not be empty',
        status: 'error',
        status_code: 400,
      })
    }
    const certificateKey = CONSTANTS.CERTIFICATE_DOWNLOAD_KEY
    if (certificateKey !== secretKey) {
      return res.status(400).json({
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
    let certificateData
    try {
      certificateData = await client.execute(ENROLMENT_CERTIFICATE_QUERY, [userid, courseid], { prepare: true })
    } finally {
      client.shutdown()
    }
    const issued = pickIssuedCertificate(certificateData && certificateData.rows)
    if (!issued) {
      return res.status(404).json({
        msg: 'No certificate has been issued for this course',
        status: 'error',
        status_code: 404,
      })
    }
    const certificateId = issued.identifier
    const certificateName = issued.name
    const response = await axios({
      ...axiosRequestConfig,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
      },
      method: 'GET',
      url: `${API_END_POINTS.DOWNLOAD_CERTIFICATE}${certificateId}`,
    })
    logInfo(
      'Certificate download in progress of certificate ID',
      certificateId
    )
    // printUri is a data URI for older certificates and raw SVG markup for
    // the ones sunbird-rc renders; toSvgMarkup handles both.
    const imageData = toSvgMarkup(response.data.result.printUri)
    const { width, height } = svgSize(imageData)
    const puppeteer = {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--headless',
        '--no-zygote',
        '--disable-gpu',
      ],
      headless: true,
      ignoreHTTPSErrors: true,
    }

    let image = await nodeHtmlToImage({
      html: `<html>
    <head>
      <style>
        body {
          width:${width}px;
          height: ${height}px;
        }
      </style>
    </head>
    <body>${imageData}</body>
  </html>`,
      puppeteerArgs: puppeteer,
    })
    if (response.data.responseCode === 'OK') {
      logInfo('Certificate printURI received :')
      res.writeHead(200, {
        'Content-Disposition':
          'attachment;filename=' + `${certificateName}.png`,
        'Content-Type': 'image/png',
      })
      res.end(image, 'binary')
      image = ''
    } else {
      throw new Error(
        _.get(response.data, 'params.errmsg') ||
          _.get(response.data, 'params.err')
      )
    }
  } catch (error) {
    logError('Error in validate certificate  >>>>>>' + error)
    res.status(500).send({
      message: VALIDATION_FAIL,
      status: 'failed',
    })
  }
})
