import { Router } from 'express'
import http from 'http'
import { createProxyServer } from 'http-proxy'
import {
  extractUserIdFromRequest,
  extractUserToken,
} from '../utils/requestExtract'
import { returnData } from './dataAlterer'
import { CONSTANTS } from './env'
import { logError, logInfo } from './logger'

const proxyCreator = (timeout = 10000) =>
  createProxyServer({
    timeout,
  })
const proxy = createProxyServer({})
const PROXY_SLUG = '/proxies/v8'
const PROXY_SLUG_FORMS = '/proxies/v8/ext-forms'
const CONTENT_TYPE_KEY = 'content-type'
const CONTENT_LENGTH_KEY_LOWER = 'content-length'
const AUTH_TOKEN_KEY = 'x-authenticated-user-token'
const AUTH_USER_ID_KEY = 'x-authenticated-userid'
const CONTENT_LENGTH_KEY = 'Content-Length'

/**
 * Upload-dedicated proxy — streams multipart data without JSON conversion.
 * Safe for large CSV / binary / form-data uploads.
 */
const uploadProxy = createProxyServer({
  agent: new http.Agent({ keepAlive: true }),
  changeOrigin: true,
  ignorePath: false,
  secure: false,
})

uploadProxy.on('error', (err, _req, _res) => {
  const errorMessage = err instanceof Error ? err.message : String(err)
  logError('[UPLOAD PROXY ERROR]', errorMessage)
})


// tslint:disable-next-line: no-any
proxy.on('proxyReq', (proxyReq: any, req: any, _res: any, _options: any) => {
  proxyReq.setHeader('X-Channel-Id', '0132317968766894088')
  // tslint:disable-next-line: max-line-length
  proxyReq.setHeader('Authorization', CONSTANTS.SB_API_KEY)
  proxyReq.setHeader(AUTH_TOKEN_KEY, extractUserToken(req))
  proxyReq.setHeader(AUTH_USER_ID_KEY, extractUserIdFromRequest(req))

  // condition has been added to set the session in nodebb req header
  // condition don't require for nodebb as of now, we manage authentication through API key and uid will be passed for each req.
  // if (req.originalUrl.includes('/discussion') && !req.originalUrl.includes('/discussion/user/v1/create')) {
  //   proxyReq.setHeader('Authorization', 'Bearer ' + req.session.nodebb_authorization_token)
  // }

  if (req.body) {
    const bodyData = JSON.stringify(req.body)
    proxyReq.setHeader(CONTENT_LENGTH_KEY, Buffer.byteLength(bodyData))
    proxyReq.write(bodyData)
  }
})

// 🆕 Upload-specific proxy handler — prevents JSON rewrite for form-data uploads
// tslint:disable-next-line: no-any
uploadProxy.on('proxyReq', (_proxyReq: any, req: any) => {
  const contentType = req.headers[CONTENT_TYPE_KEY] || ''
  if (contentType.startsWith('multipart/form-data')) {
    return
  }
})



// tslint:disable-next-line: no-any
proxy.on('proxyRes', (proxyRes: any, req: any, _res: any) => {
  if (req.originalUrl.includes('/discussion/user/v1/create')) {
    const nodebb_auth_token = proxyRes.headers.nodebb_auth_token
    if (req.session) {
      req.session.nodebb_authorization_token = nodebb_auth_token
    }
  }
})

// tslint:disable-next-line: no-any
proxy.on('proxyRes', (proxyRes: any, req: any, _res: any) => {
  // tslint:disable-next-line: no-any
  const tempBody: any = []
  if (
    req.originalUrl.includes('/hierarchy') &&
    req.originalUrl.includes('?mode=edit&src=sunbird')
  ) {
    // tslint:disable-next-line: no-console
    console.log('Enter into the response of hierarchy')
    // tslint:disable-next-line: no-any
    proxyRes.on('data', (chunk: any) => {
      tempBody.push(chunk)
    })
    proxyRes.on('end', () => {
      const tempdata = tempBody.toString()
      const updateRes = returnData(JSON.parse(tempdata), null, 'hierarchy')
      _res.end(JSON.stringify(updateRes))
    })
  } else {
    return _res
  }
})

export function proxyCreatorForms(route: Router, _timeout = 10000): Router {
  route.all('/*', (req, res) => {
    // tslint:disable-next-line: no-console
    console.log('REQ_URL_ORIGINAL proxyCreatorSunbird', req.originalUrl)
    let url = ''
    url = removePrefix(`${PROXY_SLUG_FORMS}`, req.originalUrl)
    proxy.web(req, res, {
      target: 'http://localhost:3003/' + url,
    })
  })
  return route
}
export function proxyCreatorRoute(
  route: Router,
  targetUrl: string,
  timeout = 10000
): Router {
  route.all('/*', (req, res) => {
    const downloadKeyword = '/download/'
    if (req.url.startsWith(downloadKeyword)) {
      req.url =
        downloadKeyword +
        req.url.split(downloadKeyword)[1].replace(/\//g, '%2F')
    }
    // tslint:disable-next-line: no-console
    console.log('REQ_URL_ORIGINAL', req.originalUrl)
    proxyCreator(timeout).web(req, res, {
      target: targetUrl,
    })
  })
  return route
}

export function getContentProxyCreatorRoute(route: Router): Router {
  route.all('/*', (req, res) => {
    const baseUrl = removePrefix('https', req.query.artificatUrl)
    proxyCreator().web(req, res, {
      target: 'http' + baseUrl,
    })
  })
  return route
}

export function ilpProxyCreatorRoute(route: Router, baseUrl: string): Router {
  route.all('/*', (req, res) => {
    proxyCreator().web(req, res, {
      headers: { ...req.headers } as { [s: string]: string },
      target: baseUrl + req.url,
    })
  })
  return route
}

export function scormProxyCreatorRoute(route: Router, baseUrl: string): Router {
  route.all('/*', (req, res) => {
    proxyCreator().web(req, res, {
      target: baseUrl,
    })
  })
  return route
}

export function proxyCreatorLearner(
  route: Router,
  targetUrl: string,
  _timeout = 10000
): Router {
  route.all('/*', (req, res) => {
    const url = removePrefix(`${PROXY_SLUG}/learner`, req.originalUrl)
    if (url.includes('/batch/create')) {
      res.status(200).json({
        responseCode: 'OK',
        result: {
          batchId: '',
          response: 'SUCCESS',
        },
      })
      return
    }
    logInfo('Final URL: ', targetUrl + url)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + url,
    })
  })
  return route
}

export function proxyCreatorSunbird(
  route: Router,
  targetUrl: string,
  _timeout = 10000
): Router {
  // tslint:disable-next-line: no-any
  route.all('/*', (req: any, res) => {
    let url
    // tslint:disable-next-line: no-console
    console.log('REQ_URL_ORIGINAL proxyCreatorSunbird', req.originalUrl)

    if (req.originalUrl.includes('discussion/topic')) {
      const topic = req.originalUrl.toString().split('/')
      if (topic[5] === topic[6]) {
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
        removePrefix(`${PROXY_SLUG}`, req.originalUrl) +
        '&_uid=' +
        req.session.nodebbUid
    } else {
      url =
        removePrefix(`${PROXY_SLUG}`, req.originalUrl) +
        '?_uid=' +
        req.session.nodebbUid
    }
    logInfo('Final Url for target >>>>>>>>>', targetUrl + url)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + url,
    })
  })
  return route
}

export function proxyCreatorKnowledge(
  route: Router,
  targetUrl: string,
  _timeout = 10000
): Router {
  route.all('/*', async (req, res) => {
    const url = removePrefix(`${PROXY_SLUG}`, req.originalUrl)
    // Code for checklist threshold checks for preventing publish
    // if (url.includes('content/v3/publish')) {
    //   try {
    //     const scoringThreshold = 75
    //     const newUrlArray = url.split('/')
    //     const courseId = newUrlArray[newUrlArray.length - 1]
    //     const courseHierarchyData = await axios({
    //       headers: {
    //         Authorization: CONSTANTS.SB_API_KEY,
    //       },
    //       method: 'GET',
    //       url: `${CONSTANTS.HTTPS_HOST}/api/private/content/v3/hierarchy/${courseId}?mode=edit`,
    //     })
    //     const resourceMimetype =
    //       courseHierarchyData.data.result.content.mimeType
    //     if (resourceMimetype == 'application/vnd.ekstep.content-collection') {
    //       const courseScore = await axios({
    //         data: {
    //           getLatestRecordEnabled: true,
    //           resourceId: courseId,
    //           resourceType: 'content',
    //         },
    //         headers: {
    //           Authorization: CONSTANTS.SB_API_KEY,
    //           org: 'aastar',
    //           rootOrg: 'aastar',
    //         },
    //         method: 'POST',
    //         url: `${CONSTANTS.HTTPS_HOST}/api/scoring/v1/fetch`,
    //       })
    //       const scoreObtained =
    //         courseScore.data.result.resources[0].finalWeightedScore
    //       if (scoreObtained < scoringThreshold) {
    //         res.status(200).json({
    //           message: 'Publish operation aborted',
    //           status: 'Aborted',
    //         })
    //         return
    //       }
    //     }
    //   } catch (error) {
    //     res.status(400).json({
    //       message: 'Publish operation failed',
    //       status: 'Failed',
    //     })
    //   }
    // }
    if (url.includes('hierarchy/add')) {
      const updateSlug = '/private/content/v3/hierarchy/add'
      logInfo('Targeturl value >>>>>>>>> ' + targetUrl + updateSlug)
      proxy.web(req, res, {
        changeOrigin: true,
        ignorePath: true,
        target: targetUrl + updateSlug,
      })
    } else {
      // tslint:disable-next-line: no-console
      console.log('REQ_URL_ORIGINAL proxyCreatorKnowledge', targetUrl + url)
      proxy.web(req, res, {
        changeOrigin: true,
        ignorePath: true,
        target: targetUrl + url,
      })
    }
  })
  return route
}

export function proxyHierarchyKnowledge(
  route: Router,
  targetUrl: string,
  _timeout = 10000
): Router {
  route.all('/*', (req, res) => {
    const url = removePrefix(`${PROXY_SLUG}`, req.originalUrl)
    if (url.includes('hierarchy/update')) {
      const data = returnData(req.body, null, 'hierarchy')
      req.body = data
    }
    // tslint:disable-next-line: no-console
    console.log('REQ_URL_ORIGINAL proxyCreatorKnowledge', targetUrl + url)
    if (
      req.originalUrl.includes('/hierarchy') &&
      req.originalUrl.includes('?mode=edit')
    ) {
      proxy.web(req, res, {
        changeOrigin: true,
        ignorePath: true,
        target: targetUrl + url,
      })
    }
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + url,
    })
  })
  return route
}

export function proxyCreatorUpload(
  route: Router,
  targetUrl: string,
  _timeout = 10000000
): Router {
  route.all('/*', (req, res) => {
    const url = removePrefix(`${PROXY_SLUG}/action`, req.originalUrl)
    // tslint:disable-next-line: no-console
    console.log('REQ_URL_ORIGINAL proxyCreatorUpload', targetUrl)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + url,
    })
  })
  return route
}

function removePrefix(prefix: string, s: string) {
  return s.substr(prefix.length)
}

export function proxyCreatorSunbirdSearch(
  route: Router,
  targetUrl: string,
  _timeout = 10000
): Router {
  route.all('/*', (req, res) => {
    // tslint:disable-next-line: no-console
    console.log('REQ_URL_ORIGINAL proxyCreatorSunbirdSearch', req.originalUrl)
    // tslint:disable-next-line: no-console
    console.log('TARGET_URL proxyCreatorSunbirdSearch', targetUrl)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl,
    })
  })
  return route
}

export function proxyCreatorToAppentUserId(
  route: Router,
  targetUrl: string,
  _timeout = 10000
): Router {
  route.all('/*', (req, res) => {
    const userId = extractUserIdFromRequest(req).split(':')
    const userIdFromUrl = req.originalUrl.split('/').pop()

    if (userIdFromUrl === 'read') {
      logInfo('Read api without userId value >>>>>>>>>>', userIdFromUrl)
      proxy.web(req, res, {
        changeOrigin: true,
        ignorePath: true,
        target: targetUrl + userId[userId.length - 1],
      })
    } else {
      logInfo('userId received in Read api  >>>>>>>>>' + userId)
      logInfo('REQ_URL_ORIGINAL proxyCreatorToAppentUserId', req.originalUrl)
      logInfo('userId Length value >>>>>>>>>>>>>>' + userId[userId.length - 1])

      proxy.web(req, res, {
        changeOrigin: true,
        ignorePath: true,
        // target: targetUrl + userId[userId.length - 1],
        target: targetUrl + userIdFromUrl,
      })
    }
  })
  return route
}

export function proxyCreatorQML(
  route: Router,
  targetUrl: string,
  urlType: string,
  _timeout = 10000
): Router {
  route.all('/*', (req, res) => {
    const originalUrl = req.originalUrl.replace(urlType, '/')
    const url = removePrefix(`${PROXY_SLUG}`, originalUrl)
    // tslint:disable-next-line: no-console
    console.log('REQ_URL_ORIGINAL proxyCreatorQML', targetUrl + url)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + url,
    })
  })
  return route
}

export function proxyContent(
  route: Router,
  targetUrl: string,
  _timeout = 10000
): Router {
  route.all('/*', (req, res) => {
    const url = removePrefix(`${PROXY_SLUG}/private`, req.originalUrl)
    // tslint:disable-next-line: no-console
    console.log('REQ_URL_ORIGINAL proxyCreatorUpload >>>>', targetUrl)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + url,
    })
  })
  return route
}

export function proxyContentLearnerVM(
  route: Router,
  targetUrl: string,
  _timeout = 10000
): Router {
  route.all('/*', (req, res) => {
    const url = removePrefix(
      `${PROXY_SLUG}/learnervm/private`,
      req.originalUrl
    )
    // tslint:disable-next-line: no-console
    console.log('REQ_URL_ORIGINAL proxyContentLearnerVM', targetUrl)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + url,
    })
  })
  return route
}

export function proxyCreatorDownloadCertificate(
  route: Router,
  targetUrl: string,
  _timeout = 10000
): Router {
  route.all('/*', (req, res) => {
    const originalUrl = req.originalUrl
    const lastIndex = originalUrl.lastIndexOf('/')
    const subStr = originalUrl.substr(lastIndex).substr(1)
    // tslint:disable-next-line: no-console
    console.log('REQ_URL_ORIGINAL proxyCreatorSunbirdSearch', req.originalUrl)
    // tslint:disable-next-line: no-console
    console.log('TARGET_URL proxyCreatorSunbirdSearch', targetUrl)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + subStr,
    })
  })
  return route
}

/**
 * Proxies requests from the frontend to the etl-frac service.
 * @param route The express router to which the proxy routes should be added.
 * @param targetUrl The URL of the etl-frac service.
 * @param timeout The maximum time in milliseconds that the proxy should wait for a response from the etl-frac service.
 * @returns The express router with the proxy routes added.
 */
export function proxyCreatorEtlFrac(
  route: Router,
  targetUrl: string,
  timeout = 10000
): Router {
  route.all('/*', (req, res) => {
    // tslint:disable-next-line: no-console
    console.log('REQ_URL_ORIGINAL_FRAC', req.originalUrl)
    proxyCreator(timeout).web(req, res, {
      target: targetUrl,
    })
  })
  return route
}

/**
 *  Direct raw-stream upload proxy (does NOT parse body)
 */

export function proxyCreatorEtlFracUpload(
  route: Router,
  targetUrl: string,
  timeout = 500000
): Router {
  // tslint:disable-next-line: no-any
  route.all('/*', (req: any, res: any) => {
    logInfo('\n==================== ⛳ UPLOAD DEBUG START ====================')

    logInfo('🟢 Incoming UI Request')
    logInfo('Content-Length :', req.headers[CONTENT_LENGTH_KEY_LOWER])
    logInfo('Content-Type   :', req.headers[CONTENT_TYPE_KEY])
    logInfo('HostHeader     :', req.headers.host)
    logInfo('Method         :', req.method)
    logInfo('URL            :', req.originalUrl)
    logInfo('User-Agent     :', req.headers['user-agent'])

    // Extract user details
    const xUserId = extractUserIdFromRequest(req)
    const xAuthToken = extractUserToken(req)
    logInfo('🔑 x-authenticated-userid   :', xUserId)
    logInfo(
      '🔑 x-authenticated-user-token :',
      xAuthToken ? xAuthToken.substring(0, 30) + '...' : undefined
    )

    // Path rewrite
    let rewrittenPath = req.originalUrl.replace('/proxies/v8', '')
    logInfo('🔄 Step1 rewrittenPath:', rewrittenPath)

    // Fix for Kong rule
    if (rewrittenPath === '/api/entity/v1/upload') {
      logInfo(
        '⚠️ Correcting path for Kong routing (/api/entity/v1/upload ➜ /v1/entity/upload)'
      )
      rewrittenPath = '/v1/entity/upload'
    }

    const finalTarget = targetUrl + rewrittenPath
    logInfo('Rewritten path   :', rewrittenPath)
    logInfo('Target host      :', targetUrl)
    logInfo('🎯 FINAL TARGET URL:', finalTarget)

    // Count streamed bytes
    let bytesReceived = 0
    req.on('data', (chunk: Buffer) => {
      bytesReceived += chunk.length
      logInfo(
        `📡 Incoming stream chunk: ${chunk.length} bytes (total so far: ${bytesReceived})`
      )
    })

    req.on('end', () => {
      logInfo('📥 UI upload stream fully received.')
    })

    // tslint:disable-next-line: no-any
    req.on('error', (err: any) => {
      logInfo('❌ ERROR while reading from UI:', err)
    })

    // tslint:disable-next-line: no-any
    uploadProxy.on('proxyReq', () => {
      logInfo('\n🚚 Streaming to Backend now...')
      logInfo(
        '📤 Backend Request Headers: ' +
        JSON.stringify({
          Authorization: CONSTANTS.SB_API_KEY.substring(0, 30) + '...',
          'Content-Length': req.headers[CONTENT_LENGTH_KEY_LOWER],
          'Content-Type': req.headers[CONTENT_TYPE_KEY],
          'x-authenticated-userid': xUserId,
          'x-authenticated-user-token': xAuthToken?.substring(0, 30) + '...',
        })
      )
    })

    // tslint:disable-next-line: no-any
    uploadProxy.on('proxyRes', (proxyRes: any) => {
      logInfo('🟢 Backend Response Received')
      logInfo('Status Code:', proxyRes.statusCode)
      logInfo('Response Headers:', proxyRes.headers)

      const backendErr = proxyRes.headers.error || proxyRes.headers['x-error']
      if (backendErr) logInfo('⚠ Backend returned error INFO:', backendErr)

      logInfo('==================== 🏁 UPLOAD DEBUG END ====================\n')
    })

    // tslint:disable-next-line: no-any
    uploadProxy.on('error', (err: any) => {
      logInfo('\n❌ PROXY STREAM ERROR')
      logInfo('Message:', err?.message)
      logInfo('Stack  :', err?.stack)
      logInfo('==================== 🏁 UPLOAD DEBUG END ====================\n')
    })

    // 🔥 Fire backend stream (no body parsing)
    // tslint:disable-next-line: no-any
    uploadProxy.web(req, res, {
      changeOrigin: true,
      headers: {
        [AUTH_TOKEN_KEY]: xAuthToken,
        [AUTH_USER_ID_KEY]: xUserId,
        Authorization: CONSTANTS.SB_API_KEY,
        [CONTENT_LENGTH_KEY]: req.headers[CONTENT_LENGTH_KEY_LOWER],
        "Content-Type": req.headers[CONTENT_TYPE_KEY],
      },
      ignorePath: true,
      secure: false,
      target: finalTarget,
      timeout,
    })
  })

  return route
}
