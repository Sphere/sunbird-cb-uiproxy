import { Router } from 'express'
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
 * Auto-detects HTTP/HTTPS based on target URL.
 */
const uploadProxy = createProxyServer({
  changeOrigin: true,
  ignorePath: false,
  secure: true, // Allow self-signed certificates if needed
})

uploadProxy.on('error', (err, _req, _res) => {
  const errorMessage = err instanceof Error ? err.message : String(err)
  logError('[UPLOAD PROXY ERROR]', errorMessage)
})

// /**
//  * Backup validation: Ensures multipart/form-data uploads bypass body parsing.
//  * Works in conjunction with server.ts skipBodyParser middleware (line 205).
//  * Prevents double-parsing of stream data.
//  */
// // tslint:disable-next-line: no-any
// uploadProxy.on('proxyReq', (_proxyReq: any, req: any) => {
//   const contentType = req.headers[CONTENT_TYPE_KEY] || ''
//   if (contentType.startsWith('multipart/form-data')) {
//     return // Stream passes through unmodified to backend
//   }
// })

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

/**
 * Extracts and builds proxy headers with authentication and content info.
 * Consolidates header preparation logic used across proxy functions.
 */
function buildProxyHeaders(
  userToken?: string,
  userId?: string,
  contentType?: string,
  contentLength?: string
): { [key: string]: string } {
  const headers: { [key: string]: string } = {}

  if (userToken) {
    headers[AUTH_TOKEN_KEY] = userToken
  }
  if (userId) {
    headers[AUTH_USER_ID_KEY] = userId
  }
  if (CONSTANTS?.SB_API_KEY) {
    headers.Authorization = CONSTANTS.SB_API_KEY
  }
  if (contentType) {
    headers['Content-Type'] = contentType
  }
  if (contentLength) {
    headers[CONTENT_LENGTH_KEY] = contentLength
  }

  return headers
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
 * Proxy handler for large file uploads to entity service via Kong Gateway.
 * Streams files without parsing - safe for multi-GB uploads.
 *
 * @description Routes file uploads through Kong API Gateway to FRAC ETL service.
 * Flow: Client → /proxies/v8/entity/v1/upload → Kong → FRAC /v1/entity/upload
 * Note: Body parsing is disabled for this route (see server.ts middleware).
 *
 * @param {Router} route - Express router instance
 * @param {string} targetUrl - Kong API base URL (e.g., https://aastrika-stage.tarento.com/api)
 * @param {number} [timeout=500000] - Upload timeout in milliseconds (default: 8.3 min)
 * @returns {Router} Configured router with upload streaming proxy
 *
 * @example
 * proxyCreatorEtlFracUpload(express.Router(), 'https://kong.example.com/api', 600000)
 */
export function proxyCreatorEtlFracUpload(
  route: Router,
  targetUrl: string,
  timeout = 500000
): Router {
  // tslint:disable-next-line: no-any
  route.all('/*', (req: any, res: any) => {
    // Extract authentication headers
    const xUserId = extractUserIdFromRequest(req)
    const xAuthToken = extractUserToken(req)
    const contentType = req.headers[CONTENT_TYPE_KEY]
    const contentLength = req.headers[CONTENT_LENGTH_KEY_LOWER]

    // Build Kong URL: KONG_API_BASE + /entity/v1/upload
    // Kong URI: /entity/v1/upload → FRAC ETL: /v1/entity/upload
    const path = req.originalUrl.replace('/proxies/v8', '')
    const targetEndpoint = targetUrl + path

    logInfo(`Entity upload: ${path} → ${targetEndpoint}`)

    // Stream upload to Kong without parsing (preserves multipart data)
    // tslint:disable-next-line: no-any
    uploadProxy.web(req, res, {
      changeOrigin: true,
      headers: buildProxyHeaders(xAuthToken, xUserId, contentType, contentLength),
      ignorePath: true,
      target: targetEndpoint,
      timeout,
    })
  })

  return route
}

/**
 * Proxy handler for entity API operations via Kong Gateway.
 * Supports: search, create, update, mapping, hierarchy.
 *
 * @description Routes entity CRUD operations through Kong for centralized auth and rate limiting.
 * Flow: Client → /proxies/v8/entity/v1/{operation} → Kong → FRAC /v1/entity/{operation}
 * Auto-adds authentication headers: x-authenticated-user-token, x-authenticated-userid.
 *
 * @param {Router} route - Express router instance
 * @param {string} targetUrl - Kong API base URL (e.g., https://aastrika-stage.tarento.com/api)
 * @returns {Router} Configured router with entity API proxy
 *
 * @example
 * proxyCreatorEtlFrac(express.Router(), 'https://kong.example.com/api')
 */
export function proxyCreatorEtlFrac(
  route: Router,
  targetUrl: string
): Router {
  // tslint:disable-next-line: no-any
  route.all('/*', (req: any, res: any) => {
    // Extract request path and authentication
    const userId = extractUserIdFromRequest(req)
    const userToken = extractUserToken(req)

    // Build Kong URL: KONG_API_BASE + /entity/v1/{operation}
    // Kong URI: /entity/v1/search → FRAC ETL: /v1/entity/search
    const path = removePrefix(`${PROXY_SLUG}`, req.originalUrl)
    const targetEndpoint = targetUrl + path

    logInfo(`Entity API: ${path} → Kong`)

    // Forward request to Kong with authentication headers
    proxy.web(req, res, {
      changeOrigin: true,
      headers: buildProxyHeaders(userToken, userId),
      ignorePath: true,
      target: targetEndpoint,
    })

    // Log successful responses for debugging
    // tslint:disable-next-line: no-any
    const originalSend = res.send
    // tslint:disable-next-line: no-any
    res.send = function(data: string | Buffer) {
      if (res.statusCode < 400) {
        logInfo(`Entity API response: ${path} [${res.statusCode}]`)
      }
      return originalSend.call(this, data)
    }

    // Log errors for troubleshooting
    res.on('error', (err: Error) => {
      logError(`Entity API error: ${path} - ${err?.message || 'Unknown'}`)
    })
  })

  return route
}
