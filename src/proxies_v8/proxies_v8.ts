import axios from 'axios'
import express from 'express'
import { UploadedFile } from 'express-fileupload'
import FormData from 'form-data'
import request from 'request'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
import {
  getContentProxyCreatorRoute,
  // proxyCreatorDiscussion,
  ilpProxyCreatorRoute,
  proxyContent,
  proxyContentLearnerVM,
  proxyCreatorDownloadCertificate,
  proxyCreatorKnowledge,
  proxyCreatorLearner,
  proxyCreatorQML,
  proxyCreatorRoute,
  proxyCreatorSunbird,
  proxyCreatorSunbirdSearch,
  proxyCreatorToAppentUserId,
  proxyHierarchyKnowledge,
  scormProxyCreatorRoute,
} from '../utils/proxyCreator'
import {
  extractUserIdFromRequest,
  extractUserToken,
} from '../utils/requestExtract'
declare module 'axios' {
  export interface AxiosRequestConfig {
    maxBodyLength?: number
  }
}
const API_END_POINTS = {
  contentNotificationEmail: `${CONSTANTS.NOTIFICATION_SERVIC_API_BASE}/v1/notification/send/sync`,
  logoutKeycloak: `${CONSTANTS.HTTPS_HOST}/auth/realms/sunbird/protocol/openid-connect/logout`,
}

export const proxiesV8 = express.Router()

proxiesV8.get('/', (_req, res) => {
  res.json({
    type: 'PROXIES Route',
  })
})

proxiesV8.get('/getContent', getContentProxyCreatorRoute(express.Router()))

// tslint:disable-next-line: no-any
proxiesV8.get('/getContents/*', (req, res) => {
  const path = removePrefix('/proxies/v8/getContents/', req.originalUrl)
  const sunbirdUrl = CONSTANTS.S3_BUCKET_URL + path
  logInfo('New getcontents sunbird URL >>>>>>>>>>> ', sunbirdUrl)
  return request(sunbirdUrl).pipe(res)
})
// tslint:disable-next-line: no-any
proxiesV8.get('/getContentsv2/*', (req, res) => {
  const path = removePrefix('/proxies/v8/getContentsv2/', req.originalUrl)
  logInfo('New getcontents v2 sunbird URL >>>>>>>>>>> ', path)
  const sunbirdUrl = 'https://dfi54poqd0g4h.cloudfront.net/' + path
  logInfo('New getcontents sunbird URL >>>>>>>>>>> ', sunbirdUrl)
  return request(sunbirdUrl).pipe(res)
})

proxiesV8.get('/logout/user', (req, res, next) => {
  const keycloakUrl = API_END_POINTS.logoutKeycloak
  const redirectUrl = `${CONSTANTS.HTTPS_HOST}` + '/public/home'
  res.clearCookie('connect.sid')
  axios({
    ...axiosRequestConfig,
    headers: {
      // tslint:disable-next-line:max-line-length
      Authorization: 'bearer ' + extractUserToken(req),
      org: 'aastar',
      rootorg: 'aastar',
    },
    method: 'get',
    url: keycloakUrl,
  })
    .then((response) => {
      logInfo('Success IN LOGOUT USER >>>>>>>>>>>' + response)
      res.clearCookie('connect.sid')
      if (req.session) {
        // clear the user from the session object and save.
        // this will ensure that re-using the old session id
        // does not have a logged in user
        req.session.user = null
        req.session.save((err) => {
          if (err) next(err)
        })

        // regenerate the session, which is good practice to help
        // guard against forms of session fixation
        req.session.regenerate((err) => {
          if (err) next(err)
          res.redirect(redirectUrl)
        })
      }
    })
    .catch((error) => {
      logInfo('Error IN LOGOUT USER : >>>>>>>>>>>>>>>>>>>>>.', error)
      return res.send('Attention ! Error in logging out user..' + error)
    })
})

proxiesV8.post('/upload/action/*', (req, res) => {
  if (req.files && req.files.data) {
    const url = removePrefix(
      '/proxies/v8/upload/action/upload/content/v3/',
      req.originalUrl
    )
    const file: UploadedFile = req.files.data as UploadedFile
    const formData = new FormData()
    formData.append('file', Buffer.from(file.data), {
      contentType: file.mimetype,
      filename: file.name,
    })
    const targetUrl = '/api/private/content/v3/upload/' + url
    logInfo('URL >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' + targetUrl)

    axios({
      ...axiosRequestConfig,
      data: formData,
      headers: {
        // tslint:disable-next-line:max-line-length
        Authorization: CONSTANTS.SB_API_KEY,
        accessToken: extractUserToken(req),
        org: 'aastar',
        rootorg: 'aastar',
        ...formData.getHeaders(),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      method: 'post',
      url: `${CONSTANTS.HTTPS_HOST}` + targetUrl,
    })
      .then((response) => {
        const output = {
          artifactUrl: response.data.result.artifactUrl,
          content_url: response.data.result.content_url,
          identifier: response.data.result.identifier,
          status: response.data.params.status,
        }
        return res.send(output)
      })
      .catch((error) => {
        logInfo('Error on Upload :' + error)
        return res.send('Error while uploading ..')
      })
  } else {
    res.send('File not found')
  }
})

proxiesV8.post('/private/upload/*', (_req, _res) => {
  if (_req.files && _req.files.data) {
    const _url = removePrefix('/proxies/v8/private/upload', _req.originalUrl)
    const _file: UploadedFile = _req.files.data as UploadedFile
    const _formData = new FormData()
    _formData.append('file', Buffer.from(_file.data), {
      contentType: _file.mimetype,
      filename: _file.name,
    })
    _formData.submit(
      {
        headers: {
          // tslint:disable-next-line:max-line-length
          Authorization: CONSTANTS.SB_API_KEY,
          accessToken: extractUserToken(_req),
          authenticatedUserId: extractUserIdFromRequest(_req),
          org: 'dopt',
          rootorg: 'igot',
        },
        host: 'content-service',
        path: _url,
        port: 9000,
      },
      (_err, _response) => {
        _response.on('data', (_data) => {
          if (
            !_err &&
            (_response.statusCode === 200 || _response.statusCode === 201)
          ) {
            _res.send(JSON.parse(_data.toString('utf8')))
          } else {
            _res.send(_data.toString('utf8'))
          }
        })
        if (_err) {
          _res.send(_err)
        }
      }
    )
  } else {
    _res.send('File not found')
  }
})

proxiesV8.use(
  '/content',
  proxyCreatorRoute(express.Router(), CONSTANTS.CONTENT_API_BASE + '/content')
)
proxiesV8.use(
  '/contentv3',
  proxyCreatorRoute(express.Router(), CONSTANTS.CONTENT_API_BASE + '/contentv3')
)
proxiesV8.use(
  '/fastrack',
  proxyCreatorRoute(express.Router(), CONSTANTS.ILP_FP_PROXY + '/fastrack')
)
proxiesV8.use(
  '/hosted',
  proxyCreatorRoute(express.Router(), CONSTANTS.CONTENT_API_BASE + '/hosted')
)
proxiesV8.use(
  '/ilp-api',
  ilpProxyCreatorRoute(express.Router(), CONSTANTS.ILP_FP_PROXY)
)
proxiesV8.use(
  '/scorm-player',
  scormProxyCreatorRoute(express.Router(), CONSTANTS.SCORM_PLAYER_BASE)
)
proxiesV8.use(
  '/LA',
  proxyCreatorRoute(
    express.Router(),
    CONSTANTS.APP_ANALYTICS,
    Number(CONSTANTS.ANALYTICS_TIMEOUT)
  )
)
proxiesV8.use(
  '/FordGamification',
  proxyCreatorRoute(
    express.Router(),
    CONSTANTS.GAMIFICATION_API_BASE + '/FordGamification'
  )
)
proxiesV8.use(
  '/static-ilp',
  proxyCreatorRoute(
    express.Router(),
    CONSTANTS.STATIC_ILP_PROXY + '/static-ilp'
  )
)
proxiesV8.use(
  '/web-hosted',
  proxyCreatorRoute(express.Router(), CONSTANTS.WEB_HOST_PROXY + '/web-hosted')
)

proxiesV8.use(
  '/sunbirdigot/*',
  // tslint:disable-next-line: max-line-length
  proxyCreatorSunbirdSearch(
    express.Router(),
    `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/composite/v1/search`
  )
)

proxiesV8.use(
  '/v1/content/retire',
  proxyCreatorKnowledge(express.Router(), `${CONSTANTS.KNOWLEDGE_MW_API_BASE}`)
)

proxiesV8.use(
  '/private/content/*',
  proxyContent(express.Router(), `${CONSTANTS.CONTENT_SERVICE_API_BASE}`)
)

proxiesV8.use(
  '/learnervm/private/content/*',
  proxyContentLearnerVM(
    express.Router(),
    `${CONSTANTS.VM_LEARNING_SERVICE_URL}`
  )
)

proxiesV8.use(
  '/content-progres/*',
  // tslint:disable-next-line: max-line-length
  proxyCreatorSunbirdSearch(
    express.Router(),
    `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/course/v1/content/state/update`
  )
)
proxiesV8.use(
  '/read/content-progres/*',
  // tslint:disable-next-line: max-line-length
  proxyCreatorSunbirdSearch(
    express.Router(),
    `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/course/v1/content/state/read`
  )
)
proxiesV8.use(
  '/api/user/v2/read',
  proxyCreatorToAppentUserId(
    express.Router(),
    `${CONSTANTS.KONG_API_BASE}/user/v2/read/`
  )
)

proxiesV8.use(
  [
    '/action/questionset/v1/*',
    '/action/question/v1/*',
    '/action/object/category/definition/v1/*',
  ],
  proxyCreatorQML(express.Router(), `${CONSTANTS.KONG_API_BASE}`, '/action/')
)
proxiesV8.use(
  '/action/content/v3/updateReviewStatus',
  proxyCreatorKnowledge(express.Router(), `${CONSTANTS.KONG_API_BASE}`)
)
proxiesV8.use(
  '/action/content/v3/hierarchy/add',
  proxyCreatorKnowledge(express.Router(), `${CONSTANTS.SUNBIRD_PROXY_API_BASE}`)
)
proxiesV8.use(
  '/action/content/v3/hierarchy/*',
  proxyHierarchyKnowledge(
    express.Router(),
    `${CONSTANTS.KNOWLEDGE_MW_API_BASE}`
  )
)
proxiesV8.use(
  '/action/content/v3/hierarchyUpdate',
  proxyCreatorKnowledge(express.Router(), `${CONSTANTS.KONG_API_BASE}`)
)
proxiesV8.use(
  '/action/*',
  proxyCreatorKnowledge(express.Router(), `${CONSTANTS.KNOWLEDGE_MW_API_BASE}`)
)

proxiesV8.use(
  '/learner/*',
  // tslint:disable-next-line: max-line-length
  proxyCreatorLearner(express.Router(), `${CONSTANTS.KONG_API_BASE}`)
)

proxiesV8.use(
  '/notification/*',
  // tslint:disable-next-line: max-line-length
  proxyCreatorSunbird(express.Router(), `${CONSTANTS.KONG_API_BASE}`)
)

proxiesV8.use(
  '/org/*',
  proxyCreatorSunbird(express.Router(), `${CONSTANTS.KONG_API_BASE}`)
)

proxiesV8.use(
  '/user/*',
  proxyCreatorSunbird(express.Router(), `${CONSTANTS.KONG_API_BASE}`)
)

proxiesV8.use(
  '/certreg/v2/certs/download/*',
  // tslint:disable-next-line: max-line-length
  proxyCreatorDownloadCertificate(
    express.Router(),
    `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/certreg/v2/certs/download/`
  )
)

proxiesV8.use(
  '/course/batch/cert/v1/issue',
  // tslint:disable-next-line: max-line-length
  proxyCreatorSunbirdSearch(
    express.Router(),
    `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/course/batch/cert/v1/issue`
  )
)

// proxiesV8.use('/api/framework/*',
//   // tslint:disable-next-line: max-line-length
//   proxyCreatorQML(express.Router(), `${CONSTANTS.KONG_API_BASE}`, '/api/')
// )

proxiesV8.use(
  '/api/*',
  // tslint:disable-next-line: max-line-length
  proxyCreatorSunbird(express.Router(), `${CONSTANTS.KONG_API_BASE}`)
)

proxiesV8.use(
  '/data/*',
  proxyCreatorSunbird(express.Router(), `${CONSTANTS.KONG_API_BASE}`)
)

proxiesV8.use(
  '/assets/*',
  // tslint:disable-next-line: max-line-length
  proxyCreatorSunbird(express.Router(), `${CONSTANTS.KONG_API_BASE}`)
)

// proxiesV8.use('/discussion/user/v1/create',
//   // tslint:disable-next-line: max-line-length
//   proxyCreatorDiscussion(express.Router(), `${CONSTANTS.DISCUSSION_HUB_MIDDLEWARE}`)
// )

proxiesV8.use(
  '/discussion/*',
  // tslint:disable-next-line: max-line-length
  proxyCreatorSunbird(express.Router(), `${CONSTANTS.KONG_API_BASE}`)
)

function removePrefix(prefix: string, s: string) {
  return s.substr(prefix.length)
}

proxiesV8.post('/notifyContentState', async (req, res) => {
  const contentStateError =
    'It should be one of [sendForReview, reviewCompleted, reviewFailed,' +
    ' sendForPublish, publishCompleted, publishFailed]'
  if (!req.body || !req.body.contentState) {
    res
      .status(400)
      .send('ContentState is missing in request body. ' + contentStateError)
  }
  logInfo(
    'Received req url is -> ' +
      req.protocol +
      '://' +
      req.get('host') +
      req.originalUrl
  )
  let contentBody = ''
  let emailSubject = ''
  switch (req.body.contentState) {
    case 'sendForReview':
      contentBody = `${CONSTANTS.NOTIFY_SEND_FOR_REVIEW_BODY}`
      emailSubject = 'Request to Review Content'
      break
    case 'reviewCompleted':
      contentBody = `${CONSTANTS.NOTIFY_REVIEW_COMPLETED_BODY}`
      emailSubject = 'Content Review Completed'
      break
    case 'reviewFailed':
      contentBody = `${CONSTANTS.NOTIFY_REVIEW_FAILED}`
      emailSubject = 'Content Review Failed'
      break
    case 'sendForPublish':
      contentBody = `${CONSTANTS.NOTIFY_SEND_FOR_PUBLISH_BODY}`
      emailSubject = 'Request to Publish Content'
      break
    case 'publishCompleted':
      contentBody = `${CONSTANTS.NOTIFY_PUBLISH_COMPLETED_BODY}`
      emailSubject = 'Content Publish Completed'
      break
    case 'publishFailed':
      contentBody = `${CONSTANTS.NOTIFY_PUBLIST_FAILED}`
      emailSubject = 'Content Publish Failed'
      break
    default:
      res.status(400).send('Invalid ContentState. ' + contentStateError)
      break
  }

  if (
    contentBody.includes('#contentLink') &&
    req.body.contentLink &&
    req.body.contentName
  ) {
    contentBody = contentBody.replace('#contentLink', req.body.contentLink)
  }
  logInfo('Composed contentBody -> ' + contentBody)
  const notifyMailRequest = {
    config: {
      sender: req.body.sender,
      subject: emailSubject,
    },
    deliveryType: 'message',
    ids: req.body.recipientEmails,
    mode: 'email',
    template: {
      id: `${CONSTANTS.NOTIFY_EMAIL_TEMPLATE_ID}`,
      params: {
        body: contentBody,
      },
    },
  }

  const stateEmailResponse = await axios({
    ...axiosRequestConfig,
    data: {
      request: {
        notifications: [notifyMailRequest],
      },
    },
    method: 'POST',
    url: API_END_POINTS.contentNotificationEmail,
  })
  logInfo('Response -> ' + JSON.stringify(stateEmailResponse.data))
  if (!stateEmailResponse.data.result.response) {
    res.status(400).send('Failed to send content state notification...')
  } else {
    res.status(200).send('Email sent successfully.')
  }
})
