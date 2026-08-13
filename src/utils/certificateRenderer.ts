import axios from 'axios'
import { Response } from 'express'
import _ from 'lodash'
import nodeHtmlToImage from 'node-html-to-image'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from './env'
import { logInfo } from './logger'

// sonar-cleanup: extracted from appCertificateDownload.ts / publicCertifcateFlinkv2.ts,
// whose certificate-fetch+render tail (from the DOWNLOAD_CERTIFICATE axios call
// through the writeHead/end response) was byte-identical (CHANGE 29). Each
// caller keeps its own certificateId/certificateName resolution (query params
// vs a Cassandra lookup) and its own catch-block response shape/message —
// only the shared middle section moved here.

const API_END_POINTS = {
  DOWNLOAD_CERTIFICATE: `${CONSTANTS.HTTPS_HOST}/api/certreg/v2/certs/download/`,
}

function getPosition(stringValue: string, subStringValue: string, index: number) {
  return stringValue.split(subStringValue, index).join(subStringValue).length
}

function extractSvgDimensions(imageData: string) {
  if (!imageData.includes("<svg width='")) {
    return { height: '950', width: '1400' }
  }
  const width = imageData.substring(
    imageData.indexOf("<svg width='") + 12,
    getPosition(imageData, "'", 2)
  )
  const height = imageData.substring(
    imageData.indexOf("height='") + 8,
    getPosition(imageData, "'", 4)
  )
  return { height, width }
}

async function renderCertificateImage(printUri: string) {
  let imageData = printUri
  imageData = decodeURIComponent(imageData)
  imageData = imageData.substring(imageData.indexOf(','))
  const { width, height } = extractSvgDimensions(imageData)

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

  return nodeHtmlToImage({
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
}

/**
 * Fetches the certificate's print URI and streams the rendered PNG back to
 * the caller, matching the shared fetch-render-respond flow of the
 * certificate download routes.
 * @param res the Express response to write the rendered image or error to
 * @param certificateId identifier passed to the DOWNLOAD_CERTIFICATE upstream call
 * @param certificateName filename (without extension) for the Content-Disposition header
 */
export async function fetchAndRenderCertificate(
  res: Response,
  certificateId: string,
  certificateName: string
) {
  const response = await axios({
    ...axiosRequestConfig,
    headers: {
      Authorization: CONSTANTS.SB_API_KEY,
    },
    method: 'GET',
    url: `${API_END_POINTS.DOWNLOAD_CERTIFICATE}${certificateId}`,
  })
  logInfo('Certificate download in progress of certificate ID', certificateId)

  const image = await renderCertificateImage(response.data.result.printUri)

  if (response.data.responseCode === 'OK') {
    logInfo('Certificate printURI received :')
    res.writeHead(200, {
      'Content-Disposition': 'attachment;filename=' + `${certificateName}.png`,
      'Content-Type': 'image/png',
    })
    res.end(image, 'binary')
  } else {
    throw new Error(
      _.get(response.data, 'params.errmsg') || _.get(response.data, 'params.err')
    )
  }
}
