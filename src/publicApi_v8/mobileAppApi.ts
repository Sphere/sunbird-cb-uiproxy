import axios from 'axios'
import fs from 'fs'
import jwt from 'jsonwebtoken'

import { Router } from 'express'
import express from 'express'
import { createProxyServer } from 'http-proxy'
import Joi from 'joi'
import jwt_decode from 'jwt-decode'
import _ from 'lodash'
import nodeHtmlToImage from 'node-html-to-image'
import request from 'request'
import { axiosRequestConfig } from '../configs/request.config'
import { assessmentCreator } from '../utils/assessmentSubmitHelper'
import { CONSTANTS } from '../utils/env'
import { jumbler } from '../utils/jumbler'
import { logError, logInfo } from '../utils/logger'
import { requestValidator } from '../utils/requestValidator'
import { fetchnodebbUserDetails } from './nodebbUser'
import { getCurrentUserRoles } from './rolePermission'
const cassandra = require('cassandra-driver')

const VALIDATION_FAIL =
  'Sorry ! Download cerificate not worked . Please try again in sometime.'
export const publicCertificateFlinkv2 = Router()

const API_END_POINTS = {

  CERTIFICATE_DOWNLOAD: `${CONSTANTS.HTTPS_HOST}/api/certreg/v2/certs/download`,
  DOWNLOAD_CERTIFICATE: `${CONSTANTS.HTTPS_HOST}/api/certreg/v2/certs/download/`,
  GET_ALL_ENTITY: `${CONSTANTS.ENTITY_API_BASE}/getAllEntity`,
  GET_ENTITY_BY_ID: `${CONSTANTS.ENTITY_API_BASE}/getEntityById/`,
  READ_PROGRESS: `${CONSTANTS.HTTPS_HOST}/api/course/v1/content/state/read`,
  RECOMMENDATION_API: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/course/recommendation`,
  SEARCH_COURSE_SB: `${CONSTANTS.KONG_API_BASE}/content/v1/search`,
  UPDATE_PROGRESS: `${CONSTANTS.HTTPS_HOST}/api/course/v1/content/state/update`,
  cbpCourseRecommendation: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/publicSearch/CoursesRecomendationCBP`,
  kongUpdateUser: `${CONSTANTS.KONG_API_BASE}/user/v1/update`,
  profileUpdate: `${CONSTANTS.HTTPS_HOST}/api/user/private/v1/update`,
  ratingLookUp: `${CONSTANTS.SB_EXT_API_BASE_2}/ratings/v1/ratingLookUp`,
  ratingRead: `${CONSTANTS.SB_EXT_API_BASE_2}/ratings/v2/read`,
  ratingUpsert: `${CONSTANTS.SB_EXT_API_BASE_2}/ratings/v1/upsert`,
  rcMapperHost: `${CONSTANTS.RC_MAPPER_HOST}/v1/certificate/getUserCertificateDetails`,
  summary: (courseId) =>
    `${CONSTANTS.SB_EXT_API_BASE_2}/ratings/v1/summary/${courseId}/Course`,
  userEnrollmentList: `${CONSTANTS.KONG_API_BASE}/course/v1/user/enrollment/list`,
  userSearch: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
}

const GET_ENTITY_BY_ID_FAIL =
  "Sorry ! couldn't get entity for the respective ID."
const GET_ALL_ENTITY_FAIL = "Sorry ! couldn't get all the entity"

const authenticatedToken = 'x-authenticated-user-token'
// tslint:disable-next-line: no-any
const contentTypeHeader = { 'Content-Type': 'application/json' }
const proxy = createProxyServer({})
// tslint:disable-next-line: no-any
const getHeaders = (req: any) => {
  return {
    Authorization: CONSTANTS.SB_API_KEY,
    contentTypeHeader,
    'x-authenticated-user-token': req.headers[authenticatedToken],
  }
}
const publicKeyPath = '/keys/access_key'
const publicKeyValue = fs.readFileSync(publicKeyPath, 'utf8')
const beginKey = '-----BEGIN PUBLIC KEY-----\n'
const endKey = '\n-----END PUBLIC KEY-----'
const publicKey = beginKey + publicKeyValue + endKey
export const mobileAppApi = Router()

// tslint:disable-next-line: no-any
const verifyToken = (req: any, res: any) => {
  try {
    logInfo('Inside verify token function')
    const accessToken = req.headers[authenticatedToken]
    // tslint:disable-next-line: no-any
    try {
      const authenticatedTokenResult = jwt.verify(accessToken, publicKey, {
        algorithms: ['RS256'],
      })
      logInfo('Token verified')
      logInfo('Access token result', JSON.stringify(authenticatedTokenResult))
    } catch (error) {
      return res.status(404).json({
        message: 'User token missing or invalid',
        redirectUrl: 'https://sphere.aastrika.org/public/home',
      })
    }
    // tslint:disable-next-line: no-any
    const decodedToken: any = jwt_decode(accessToken.toString())
    const decodedTokenArray = decodedToken.sub.split(':')
    const userId = decodedTokenArray[decodedTokenArray.length - 1]
    return {
      accessToken,
      decodedToken,
      status: 200,
      userId,
    }
  } catch (error) {
    return res.status(404).json({
      message: 'User token missing or invalid',
      redirectUrl: 'https://sphere.aastrika.org/public/home',
    })
  }
}
mobileAppApi.get('/getContents/*', (req, res) => {
  try {
    const path = removePrefix(
      '/public/v8/mobileApp/getContents/',
      req.originalUrl
    )
    const sunbirdUrl = CONSTANTS.S3_BUCKET_URL + path
    logInfo(
      'New getcontents sunbird URL for Mobile APP >>>>>>>>>>> ',
      sunbirdUrl
    )
    return request(sunbirdUrl).pipe(res)
  } catch (err) {
    res.status(404).json({
      message: 'Content not found',
    })
  }
})

mobileAppApi.use(
  '/discussion/*',
  mobileProxyCreatorSunbird(express.Router(), `${CONSTANTS.KONG_API_BASE}`)
)

mobileAppApi.post('/submitAssessment', async (req, res) => {
  try {
    const accesTokenResult = verifyToken(req, res)
    if (accesTokenResult.status == 200) {
      const accessToken = accesTokenResult.accessToken
      const userId = accesTokenResult.userId
      const assessmentSubmitStatus = await assessmentCreator(
        req.body,
        accessToken,
        userId
      )
      res
        .status(assessmentSubmitStatus.status)
        .json(assessmentSubmitStatus.data)
    }
  } catch (err) {
    res.status(404).json({
      message: 'Error occured while submit',
    })
  }
})
mobileAppApi.get('/v1/assessment/*', async (req, res) => {
  try {
    const path = removePrefix(
      '/public/v8/mobileApp/v1/assessment/',
      req.originalUrl
    )
    jumbler(path).then((response) => {
      return res.send(response)
    })
    logInfo('New getAssessments competency mobile APP >>>>>>>>>>> ', path)
  } catch (err) {
    res.status(404).json({
      message: 'Error occured while get assessment',
    })
  }
})
mobileAppApi.post('/v1/competencyAssessment/submit', async (req, res) => {
  try {
    const accesTokenResult = verifyToken(req, res)
    const accessToken = accesTokenResult.accessToken
    const userId = accesTokenResult.userId
    const assessmentData = req.body
    const assessmentSubmitStatus = await assessmentCreator(
      assessmentData,
      accessToken,
      userId
    )
    res.status(assessmentSubmitStatus.status).json(assessmentSubmitStatus.data)
  } catch (err) {
    res.status(404).json({
      message: 'Error occured while submit assessment',
    })
  }
})
// tslint:disable-next-line: no-any
mobileAppApi.get('/webviewLogin', async (req: any, res) => {
  const accesTokenResult = verifyToken(req, res)
  const accessToken = accesTokenResult.accessToken
  const decodedToken = accesTokenResult.decodedToken
  const userId = accesTokenResult.userId
  if (accesTokenResult.status == 200) {
    req.session.userId = userId
    logInfo(userId, 'userid......................')
    req.kauth = {
      grant: {
        access_token: { content: decodedToken, token: accessToken },
      },
    }
    req.session.grant = {
      access_token: { content: decodedToken, token: accessToken },
    }
    logInfo('Success ! Entered into usertokenResponse..')
    await getCurrentUserRoles(req, accessToken)
    res.status(200).json({
      message: 'success',
      redirectUrl: 'https://sphere.aastrika.org/app/profile-view',
    })
  }
})
mobileAppApi.post('/getEntityById/:id', async (req, res) => {
  try {
    const accesTokenResult = verifyToken(req, res)
    if (accesTokenResult.status == 200) {
      const response = await axios({
        data: req.body,
        headers: {
          authenticatedToken: req.headers[authenticatedToken],
          contentTypeHeader,
        },
        method: 'POST',
        url: `${API_END_POINTS.GET_ENTITY_BY_ID}+${req.params.id}`,
      })
      logInfo('Check req body of getEntityByID >> ' + req.body)
      res.status(response.data.responseCode).send(response.data)
    }
  } catch (error) {
    logError('Error in getEntityById  >>>>>>' + error)
    res.status(500).send({
      message: GET_ENTITY_BY_ID_FAIL,
      status: 'failed',
    })
  }
})
mobileAppApi.post('/getAllEntity', async (req, res) => {
  try {
    const accesTokenResult = verifyToken(req, res)
    if (accesTokenResult.status == 200) {
      const response = await axios({
        data: req.body,
        headers: {
          authenticatedToken: req.headers[authenticatedToken],
          contentTypeHeader,
        },
        method: 'POST',
        url: API_END_POINTS.GET_ALL_ENTITY,
      })
      logInfo('Check req body of getAllEntity >> ' + req.body)
      res.status(response.data.responseCode).send(response.data)
    }
  } catch (error) {
    logError('Error in GET_ALL_ENTITY  >>>>>>' + error)
    res.status(500).send({
      message: GET_ALL_ENTITY_FAIL,
      status: 'failed',
    })
  }
})
function removePrefix(prefix: string, s: string) {
  return s.substr(prefix.length)
}
mobileAppApi.post('/cmi5/getAuthorization', async (req, res) => {
  logInfo('Check req body of cmi5 authorization>> ' + req.body)
  try {
    const accesTokenResult = verifyToken(req, res)
    res.status(200).json(accesTokenResult)

  } catch (error) {
    res.status(500).send({
      message: 'Something went wrong',
      status: 'failed',
    })

  }

})
mobileAppApi.post('/cmi5/updateProgress', async (req, res) => {
  try {

    const accesTokenResult = verifyToken(req, res)
    const userId = accesTokenResult.userId
    req.body.request.userId = userId
    if (requestValidator(['userId', 'contents'], req.body.request, res)) return
    if (accesTokenResult.status == 200) {
      await axios({
        data: req.body,
        headers: getHeaders(req),
        method: 'PATCH',
        url: API_END_POINTS.UPDATE_PROGRESS,
      })
      const stateReadBody = {
        request: {
          batchId: req.body.request.contents[0].batchId,
          contentIds: [],
          courseId: req.body.request.contents[0].courseId,
          fields: ['progressdetails'],
          userId: req.body.request.userId,
        },
      }
      const responseProgressRead = await axios({
        data: stateReadBody,
        headers: getHeaders(req),
        method: 'POST',
        url: API_END_POINTS.READ_PROGRESS,
      })
      res.status(200).json(responseProgressRead.data)
    }
  } catch (error) {
    logError('Error in update cmi5 progress  >>>>>>' + error)
    res.status(500).send({
      message: 'Something went wrong during cmi5 progress update',
      status: 'failed',
    })
  }
})
mobileAppApi.post('/cmi5/readProgress', async (req, res) => {
  try {
    const stateReadBody = {
      request: {
        batchId: req.body.request.contents[0].batchId,
        contentIds: [],
        courseId: req.body.request.contents[0].courseId,
        fields: ['progressdetails'],
        userId: req.body.request.userId,
      },
    }
    const responseProgressRead = await axios({
      data: stateReadBody,
      headers: getHeaders(req),
      method: 'POST',
      url: API_END_POINTS.READ_PROGRESS,
    })
    res.status(200).json(responseProgressRead.data)

  } catch (error) {
    logError('Error in reading cmi5  >>>>>>' + error)
    res.status(500).send({
      message: 'Something went wrong during cmi5 progress read',
      status: 'failed',
    })
  }

})
mobileAppApi.post('/v2/updateProgress', async (req, res) => {
  try {
    logInfo('Check req body of update progress v2 for mobile >> ' + req.body)
    logInfo('Check req body of update progress v2 for mobile before fix >> ' + JSON.stringify(req.body))
    const accesTokenResult = verifyToken(req, res)
    const userId = accesTokenResult.userId
    req.body.request.userId = userId
    logInfo('Check req body of update progress v2 for mobile after fix >> ' + req.body)
    if (requestValidator(['userId', 'contents'], req.body.request, res)) return
    if (accesTokenResult.status == 200) {
      await axios({
        data: req.body,
        headers: getHeaders(req),
        method: 'PATCH',
        url: API_END_POINTS.UPDATE_PROGRESS,
      })
      const stateReadBody = {
        request: {
          batchId: req.body.request.contents[0].batchId,
          contentIds: [],
          courseId: req.body.request.contents[0].courseId,
          fields: ['progressdetails'],
          userId: req.body.request.userId,
        },
      }
      const responseProgressRead = await axios({
        data: stateReadBody,
        headers: getHeaders(req),
        method: 'POST',
        url: API_END_POINTS.READ_PROGRESS,
      })
      logInfo('Check req body of update progress v2 >> ' + req.body)
      res.status(200).json(responseProgressRead.data)
    }
  } catch (error) {
    logError('Error in update progress v2  >>>>>>' + error)
    res.status(500).send({
      message: 'Something went wrong during progress update',
      status: 'failed',
    })
  }
})
mobileAppApi.get('/version', async (_req, res) => {
  try {
    const filePath = CONSTANTS.APP_VERSION_PATH
    const response = await axios({
      headers: {},
      method: 'GET',
      url: filePath,
    })
    const filteredData = response.data
    res.status(200).json({
      message: 'success',
      response: filteredData,
      status: 200,
    })
  } catch (err) {
    res.status(404).json({
      message: 'Content not found',
    })
  }
})
mobileAppApi.patch('/updateUserProfile', async (req, res) => {
  try {
    logInfo('Check req body of mobile app profile update API', JSON.stringify(req.body))
    const accesTokenResult = verifyToken(req, res)
    if (accesTokenResult.status == 200) {
      try {
        const schema = Joi.object({
          request: Joi.object({
            profileDetails: Joi.object().required().keys({
              profileReq: Joi.object().required().unknown(true),
            }).unknown(true),
            userId: Joi.string().required(),
          }).required(),
        }).unknown(true)
        const { error } = schema.validate(req.body)
        if (error) {
          return res.status(400).json({
            result: {
              errorSource: 'JOI',
              errors: error.details.map((value) => value.message),
              response: 'FAILED',
            },
          })
        }
      } catch (err) {
        logError('Something went wrong while updating user' + err)
        return res.status((err && err.response && err.response.status) || 500).send(
          (err && err.response && err.response.data) || {
            error: 'Something went wrong during profile update',
          }
        )
      }

      // tslint:disable-next-line: max-line-length
      if (req.body.request.profileDetails.personalDetails) {
        delete req.body.request.profileDetails.personalDetails
      }
      if (
        req.body.request.profileDetails.profileReq.personalDetails &&
        !req.body.request.profileDetails.profileReq.personalDetails
          .regNurseRegMidwifeNumber
      ) {
        req.body.request.profileDetails.profileReq.personalDetails.regNurseRegMidwifeNumber =
          '[NA]'
      }
      // tslint:disable-next-line: max-line-length
      req.body.request.profileDetails.profileReq.personalDetails = _.omitBy(
        req.body.request.profileDetails.profileReq.personalDetails,
        (v) => _.isUndefined(v) || _.isNull(v) || _.isEmpty(v)
      )
      logInfo(JSON.stringify(req.body))
      const response = await axios.patch(
        API_END_POINTS.kongUpdateUser,
        req.body,
        {
          ...axiosRequestConfig,
          headers: getHeaders(req),
        }
      )
      res.status(response.status).send(response.data)
    }
  } catch (err) {
    logError('Something went wrong while updating user' + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Something went wrong',
      }
    )
  }

})

mobileAppApi.get('/courseRemommendationv2', async (req, res) => {
  try {
    /* tslint:disable-next-line */
    let appId = req.query.appId || ""
    if (appId == 'app.aastrika.ekhamata') {
      const filteredCourses = await getCoursesForIhat()
      return res.status(200).send(filteredCourses)
    }
    logInfo('Appid', appId)
    const responseObject = {
      background: req.query.background || '',
      profession: req.query.profession || '',
    }
    if (!req.query.background) {
      delete responseObject.background
    }
    if (!req.query.profession) {
      delete responseObject.profession
    }
    const response = await axios({
      method: 'GET',
      params: responseObject,
      url: API_END_POINTS.RECOMMENDATION_API,
    })

    res.status(response.status).send(response.data)
  } catch (err) {
    logInfo(JSON.stringify(err))
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Exception occured in recommendation service',
      }
    )
  }
})
mobileAppApi.get('/ios/certificateDownload', async (req, res) => {
  try {
    const accesTokenResult = verifyToken(req, res)
    if (accesTokenResult.status == 200) {
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
    }
  } catch (error) {
    logError('Error in downloading certificate  >>>>>>' + error)
    res.status(500).send({
      message: VALIDATION_FAIL,
      status: 'failed',
    })
  }
})
mobileAppApi.get('/certificateDownload', async (req, res) => {
  try {
    const { userId, certificateId } = req.query
    const accesTokenResult = verifyToken(req, res)
    if (!userId || !certificateId || accesTokenResult.userId != userId) {
      return res.status(400).json({
        message: 'Token, Userid or Certificate missing or invalid',
        status: 'FAILED',
      })
    }
    const certificateDownloadResponse = await axios({
      headers: { Authorization: CONSTANTS.SB_API_KEY },
      method: 'GET',
      params: userId,
      url: `${API_END_POINTS.CERTIFICATE_DOWNLOAD}/${certificateId}`,
    })
    res.status(200).json({
      data: certificateDownloadResponse.data.result,
      status: 'SUCCESS',
    })
  } catch (error) {
    res.status(400).json({
      message: 'Error occurred while certificate download',
      status: 'FAILED',
    })
  }
})
mobileAppApi.post('/ratings/upsert', async (req, res) => {
  try {
    logInfo('Inside ratings upsert API')
    const upsertData = req.body
    const response = await axios({
      data: upsertData,
      headers: contentTypeHeader,
      method: 'post',
      url: API_END_POINTS.ratingUpsert,
    })
    res.status(200).json(response.data)
  } catch (error) {
    logInfo(JSON.stringify(error))
    res.status(400).json({
      message: 'Something went wrong while ratings upsert',
    })

  }
}
)
mobileAppApi.post('/ratings/v2/read', async (req, res) => {
  try {
    logInfo('Inside ratings read API')
    const readRatingsData = req.body
    const response = await axios({
      data: readRatingsData,
      headers: contentTypeHeader,
      method: 'post',
      url: API_END_POINTS.ratingRead,
    })
    res.status(200).json(response.data)
  } catch (error) {
    logInfo(JSON.stringify(error))
    res.status(400).json({
      message: 'Something went wrong while reading ratings',
    })

  }
}
)
mobileAppApi.post('/ratings/ratingLookUp', async (req, res) => {
  try {
    logInfo('Inside ratings lookup API')
    const upsertData = req.body
    const response = await axios({
      data: upsertData,
      headers: contentTypeHeader,
      method: 'post',
      url: API_END_POINTS.ratingLookUp,
    })
    res.status(200).json(response.data)
  } catch (error) {
    logInfo(JSON.stringify(error))
    res.status(400).json({
      message: 'Something went wrong while rating lookup',
    })

  }
}
)
mobileAppApi.get('/ratings/summary', async (req, res) => {
  try {
    logInfo('Inside ratings summary API')
    const courseId = req.query.courseId
    if (!courseId) {
      return res.status(400).json({
        message: 'CourseId cannot be empty',
        status: 'Failed',
      })
    }
    const response = await axios({
      headers: contentTypeHeader,
      method: 'GET',
      url: API_END_POINTS.summary(courseId),
    })
    res.status(200).json(response.data)
  } catch (error) {
    logInfo(JSON.stringify(error))
    res.status(400).json({
      message: 'Something went wrong getting summary results',
    })
  }
}
)
const getUserDetails = async (userId: string) => {
  try {
    const userDetails = await axios({
      data: {
        request: {
          filters: {
            id: userId,
          },
        },
      },
      headers: {
        authorization: CONSTANTS.SB_API_KEY,
        contentTypeHeader,
      },
      method: 'POST',
      url: API_END_POINTS.userSearch,
    })
    return userDetails.data.result.response.content[0].profileDetails
  } catch (error) {
    logError('Error while user search', JSON.stringify(error))
    return ''
  }

}
mobileAppApi.post('/acceptTnc', async (req, res) => {
  try {
    const tncRequestBody = req.body
    logInfo('tncRequestBody for tnc update', tncRequestBody)
    const userProfileDetails = await getUserDetails(tncRequestBody.userId)
    logInfo('userProfileDetails for tnc update', JSON.stringify(userProfileDetails))
    if (!userProfileDetails) {
      return res.status(400).json({
        message: 'User not found',
        status: 'failed',
      })
    }
    userProfileDetails.profileReq.personalDetails.tncAccepted = 'true'
    const userProfileUpdateBody = {
      request: {
        profileDetails: userProfileDetails,
        tcStatus: 'true',
        tncAcceptedOn: new Date().getTime(),
        tncAcceptedVersion: tncRequestBody.tncVersion,
        userId: tncRequestBody.userId,
      },
    }
    await axios({
      data: userProfileUpdateBody,
      headers: {
        authorization: CONSTANTS.SB_API_KEY,
        contentTypeHeader,
      },
      method: 'PATCH',
      url: API_END_POINTS.profileUpdate,
    })
    res.status(200).json({
      message: 'TNC Accepted Successfully',
      status: 'success',
    })
  } catch (error) {
    logInfo(JSON.stringify(error))
    res.status(400).json({
      message: 'Something went wrong while accepting TNC',
      status: 'failed',
    })
  }
})

mobileAppApi.post('/publicSearch/courseRecommendationCbp', async (req, res) => {
  try {
    /* tslint:disable-next-line */
    logInfo("Inside CBP course recommendation route")
    logInfo('Request body', JSON.stringify(req.body))
    const searchRequestBody = req.body
    const response = await axios({
      data: searchRequestBody,
      headers: contentTypeHeader,
      method: 'POST',
      url: API_END_POINTS.cbpCourseRecommendation,
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    logInfo(JSON.stringify(err))
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Something went wrong fetching results',
      }
    )
  }
})
mobileAppApi.get('/user/enrollment/list/adhocCertificates', async (req, res) => {
  try {
    /* tslint:disable-next-line */
    logInfo("Inside user enrollment list for Adhoc certificates")
    logInfo('Request params', JSON.stringify(req.query))
    const enrollmentParams = req.query
    const accesTokenResult = verifyToken(req, res)
    if (accesTokenResult.status != 200) {
      return res.status(400).json({
        message: 'Token missing or invalid',
        status: 'FAILED',
      })
    }
    const sunbirdEnrollmentApiResponse = await axios({
      headers: getHeaders(req),
      method: 'GET',
      params: enrollmentParams,
      url: `${API_END_POINTS.userEnrollmentList}/${accesTokenResult.userId}`,
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
        headers: getHeaders(req),
        method: 'GET',
        params: { userId: accesTokenResult.userId },
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
function mobileProxyCreatorSunbird(
  route: Router,
  targetUrl: string,
  _timeout = 10000
): Router {
  route.all('/*', async (req, res) => {
    try {
      const accessToken = req.headers[authenticatedToken]
      if (!accessToken) {
        throw new Error('Access token not found')
      }
      // tslint:disable-next-line: no-any
      const decodedToken: any = jwt_decode(accessToken.toString())
      const decodedTokenArray = decodedToken.sub.split(':')
      const userId = decodedTokenArray[decodedTokenArray.length - 1]

      const nodebbUserId = await fetchnodebbUserDetails(userId, decodedToken.preferred_username, decodedToken.name, decodedToken)
      // tslint:disable-next-line: no-console
      console.log('discussion response---', nodebbUserId)
      let url
      // tslint:disable-next-line: no-console
      console.log('REQ_URL_ORIGINAL proxyCreatorSunbird', req.originalUrl)

      if (req.originalUrl.includes('/uid')) {
        req.originalUrl = req.originalUrl.replace(/\/uid/g, '')
      }
      if (req.originalUrl.includes('discussion/topic')) {
        const topic = req.originalUrl.toString().split('/')
        if (topic[6] === topic[7]) {

          req.originalUrl =
            topic[0] +
            '/' +
            topic[1] +
            '/' +
            topic[2] +
            '/' +
            topic[3] +
            '/' +
            topic[4] +
            '/' +
            topic[5] +
            '/' +
            topic[7]
        }
        logInfo('Updated req.originalUrl >>> ' + req.originalUrl)
      }
      if (req.originalUrl.includes('?')) {
        url =
          removePrefix('/public/v8/mobileApp', req.originalUrl) +
          '&_uid=' +
          nodebbUserId
      } else {
        url =
          removePrefix('/public/v8/mobileApp', req.originalUrl) +
          '?_uid=' +
          nodebbUserId
      }

      logInfo('Final Url for target >>>>>>>>>', targetUrl + url)
      // tslint:disable-next-line: no-any
      const headers: any = {
        Authorization: CONSTANTS.SB_API_KEY,
        'X-Channel-Id': '0132317968766894088',

        'X-Authenticated-User-Token': req.headers[authenticatedToken],

      }
      // tslint:disable-next-line: no-any
      const method = req.method as any

      const response = await axios({
        data: req.body,
        headers,
        method,
        params: req.query,
        timeout: _timeout,
        url: targetUrl + url,
      })

      res.status(response.status).send(response.data)
      proxy.web(req, res, {
        changeOrigin: true,
        headers,
        ignorePath: true,
        target: targetUrl + url,

      })
    } catch (error) {
      // tslint:disable-next-line: no-console
      console.log(JSON.stringify(error))
      res.status(401).send('Unauthorized')
    }
  })
  return route
}
const getCoursesForIhat = async () => {
  const requestFilterForIhat = {
    request: {
      filters: {
        contentType: [
          'Course',
        ],
        primaryCategory: [
          'Course',
        ],
        sourceName: 'IHAT',
        status: [
          'Live',
        ],

      },
      limit: 15,

      sort_by: {
        lastUpdatedOn: 'desc',
      },
    },
    sort: [
      {
        lastUpdatedOn: 'desc',
      },
    ],
  }
  const ihatCoursesList = await axios({
    data: requestFilterForIhat,
    headers: { Authorization: CONSTANTS.SB_API_KEY },
    method: 'POST',
    url: `${API_END_POINTS.SEARCH_COURSE_SB}`,
  })
  return ihatCoursesList.data.result.content.map((course) => {
    return {
      background: 'Healthcare Worker',
      course_appIcon: course.appIcon,
      course_creator: course.creator,
      course_id: course.identifier,
      course_issueCertification: course.issueCertification || false,
      course_name: course.name,
      course_sourceName: course.sourceName,
      course_thumbnail: course.thumbnail,
      profession: 'ANM',
      user_count: 3,
    }
  })
}
