import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import nodeHtmlToImage from 'node-html-to-image'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'

const API_END_POINTS = {
  DOWNLOAD_CERTIFICATE: `${CONSTANTS.HTTPS_HOST}/api/certreg/v2/certs/download/`,
}
const VALIDATION_FAIL =
  'Sorry ! Download cerificate not worked . Please try again in sometime.'
export const appCertificateDownload = Router()

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
