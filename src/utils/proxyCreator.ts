import { Router } from 'express'
import { createProxyServer } from 'http-proxy'
import jwt_decode from 'jwt-decode'
import { fetchnodebbUserDetails } from '../publicApi_v8/nodebbUser'
import {
  extractUserIdFromRequest,
  extractUserToken,
} from '../utils/requestExtract'
import { returnData } from './dataAlterer'
import { CONSTANTS } from './env'
import { logInfo } from './logger'

const proxyCreator = (timeout = 10000) =>
  createProxyServer({
    timeout,
  })
const proxy = createProxyServer({})
const PROXY_SLUG = '/proxies/v8'
const PROXY_SLUG_FORMS = '/proxies/v8/ext-forms'

// tslint:disable-next-line: no-any
proxy.on('proxyReq', (proxyReq: any, req: any, _res: any, _options: any) => {
  proxyReq.setHeader('X-Channel-Id', '0132317968766894088')
  // tslint:disable-next-line: max-line-length
  proxyReq.setHeader('Authorization', CONSTANTS.SB_API_KEY)
  proxyReq.setHeader('x-authenticated-user-token', extractUserToken(req))
  proxyReq.setHeader('x-authenticated-userid', extractUserIdFromRequest(req))

  // condition has been added to set the session in nodebb req header
  // condition don't require for nodebb as of now, we manage authentication through API key and uid will be passed for each req.
  // if (req.originalUrl.includes('/discussion') && !req.originalUrl.includes('/discussion/user/v1/create')) {
  //   proxyReq.setHeader('Authorization', 'Bearer ' + req.session.nodebb_authorization_token)
  // }

  if (req.body) {
    const bodyData = JSON.stringify(req.body)
    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData))
    proxyReq.write(bodyData)
  }
})

// tslint:disable-next-line: no-any
proxy.on('proxyRes', (proxyRes: any, req: any, res: any) => {
  // Handle nodebb auth token
  if (req.originalUrl.includes('/discussion/user/v1/create')) {
    const nodebb_auth_token = proxyRes.headers.nodebb_auth_token
    if (req.session) {
      req.session.nodebb_authorization_token = nodebb_auth_token
    }
  }

  // Handle hierarchy response transformation
  if (
    req.originalUrl.includes('/hierarchy') &&
    req.originalUrl.includes('?mode=edit&src=sunbird')
  ) {
    // tslint:disable-next-line: no-console
    console.log('Enter into the response of hierarchy')
    // tslint:disable-next-line: no-any
    const tempBody: any = []
    // tslint:disable-next-line: no-any
    proxyRes.on('data', (chunk: any) => {
      tempBody.push(chunk)
    })
    proxyRes.on('end', () => {
      const tempdata = tempBody.toString()
      const updateRes = returnData(JSON.parse(tempdata), null, 'hierarchy')
      res.end(JSON.stringify(updateRes))
    })
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

// tslint:disable-next-line: cyclomatic-complexity
export function proxyCreatorDiscussionSunbird(
  route: Router,
  targetUrl: string,
  _timeout = 10000
): Router {
  // tslint:disable-next-line: no-any
  route.all('/*', async (req: any, res) => {
    try {
      logInfo('[proxyCreatorDiscussionSunbird] ===== START - Discussion API Request =====')
      logInfo('[proxyCreatorDiscussionSunbird] Original URL: ' + req.originalUrl)
      logInfo('[proxyCreatorDiscussionSunbird] Request method: ' + req.method)
      logInfo('[proxyCreatorDiscussionSunbird] Target URL: ' + targetUrl)

      const accessToken = extractUserToken(req)
      logInfo('[proxyCreatorDiscussionSunbird] Access token extracted: ' + (!!accessToken))

      if (!accessToken) {
        logInfo('[proxyCreatorDiscussionSunbird] ERROR: Access token not found')
        throw new Error('Access token not found')
      }

      // Decode token to get user details
      logInfo('[proxyCreatorDiscussionSunbird] Attempting to decode JWT token...')
      // tslint:disable-next-line: no-any
      const decodedToken: any = jwt_decode(accessToken.toString())
      logInfo('[proxyCreatorDiscussionSunbird] Token decoded successfully')
      logInfo('[proxyCreatorDiscussionSunbird] Token subject (sub): ' + decodedToken.sub)

      const decodedTokenArray = decodedToken.sub.split(':')
      const userId = decodedTokenArray[decodedTokenArray.length - 1]
      logInfo('[proxyCreatorDiscussionSunbird] Extracted userId: ' + userId)

      // Fetch NodeBB user details
      logInfo('[proxyCreatorDiscussionSunbird] Calling fetchnodebbUserDetails...')
      const nodebbUserId = await fetchnodebbUserDetails(
        userId,
        decodedToken.preferred_username,
        decodedToken.name,
        decodedToken,
        req.session
      )

      logInfo('[proxyCreatorDiscussionSunbird] NodeBB UID: ' + nodebbUserId)

      // Clean and normalize URL
      const normalizedUrl = cleanDiscussionUrl(req.originalUrl)
      logInfo('[proxyCreatorDiscussionSunbird] Normalized URL: ' + normalizedUrl)

      // Add NodeBB UID as query parameter
      const finalUrl = appendNodebbUid(normalizedUrl, nodebbUserId)
      logInfo('[proxyCreatorDiscussionSunbird] Final target URL: ' + (targetUrl + finalUrl))
      logInfo('[proxyCreatorDiscussionSunbird] Initiating proxy request...')

      proxy.web(req, res, {
        changeOrigin: true,
        ignorePath: true,
        target: targetUrl + finalUrl,
      })

      logInfo('[proxyCreatorDiscussionSunbird] ===== SUCCESS - Proxy request initiated =====')
    } catch (error) {
      logInfo('[proxyCreatorDiscussionSunbird] ===== ERROR OCCURRED =====')
      if (error instanceof Error) {
        logInfo('[proxyCreatorDiscussionSunbird] Error type: ' + error.name)
        logInfo('[proxyCreatorDiscussionSunbird] Error message: ' + error.message)
        logInfo('[proxyCreatorDiscussionSunbird] Stack trace: ' + error.stack)
      } else {
        logInfo('[proxyCreatorDiscussionSunbird] Full error: ' + JSON.stringify(error))
      }
      res.status(401).send('Unauthorized')
    }
  })
  return route
}

// Helper function to clean discussion URLs
function cleanDiscussionUrl(originalUrl: string): string {
  let url = originalUrl

  // Clean up /uid if present
  if (url.includes('/uid')) {
    url = url.replace(/\/uid/g, '')
  }

  // Handle discussion topic duplicate path issue
  if (url.includes('discussion/topic')) {
    const topic = url.toString().split('/')
    if (topic[5] === topic[6]) {
      url =
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
  }

  return url
}

// Helper function to append NodeBB UID to URL
function appendNodebbUid(url: string, nodebbUserId: string | boolean): string {
  const prefix = removePrefix(`${PROXY_SLUG}`, url)
  if (url.includes('?')) {
    return prefix + '&_uid=' + nodebbUserId
  }
  return prefix + '?_uid=' + nodebbUserId
}

// tslint:disable-next-line: cyclomatic-complexity
export function proxyCreatorKnowledge(
  route: Router,
  targetUrl: string,
  _timeout = 10000
): Router {
  route.all('/*', async (req, res) => {
    const url = removePrefix(`${PROXY_SLUG}`, req.originalUrl)
    logInfo(`[proxyCreatorKnowledge] URL: ${url}`)

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
