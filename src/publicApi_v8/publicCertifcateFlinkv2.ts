import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import nodeHtmlToImage from 'node-html-to-image'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
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
    function getPosition(stringValue, subStringValue, index) {
      return stringValue.split(subStringValue, index).join(subStringValue)
        .length
    }
    let imageData = response.data.result.printUri
    imageData = decodeURIComponent(imageData)
    imageData = imageData.substring(imageData.indexOf(','))
    let width = imageData.substring(
      imageData.indexOf("<svg width='") + 12,
      getPosition(imageData, "'", 2)
    )
    let height = imageData.substring(
      imageData.indexOf("height='") + 8,
      getPosition(imageData, "'", 4)
    )
    if (!imageData.includes("<svg width='")) {
      width = '1400'
      height = '950'
    }
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
