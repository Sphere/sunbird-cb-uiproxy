import { Router } from 'express'
import { createProxyServer } from 'http-proxy'
import { extractUserIdFromRequest, extractUserToken } from '../utils/requestExtract'
import {returnData } from './dataAlterer'
import { CONSTANTS } from './env'
import { logInfo } from './logger'

const proxyCreator = (timeout = 10000) => createProxyServer({
  timeout,
})
const proxy = createProxyServer({})
const PROXY_SLUG = '/proxies/v8'

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
proxy.on('proxyRes', (proxyRes: any, req: any, _res: any, ) => {
  if (req.originalUrl.includes('/discussion/user/v1/create')) {
    const nodebb_auth_token = proxyRes.headers.nodebb_auth_token
    if (req.session) {
      req.session.nodebb_authorization_token = nodebb_auth_token
    }
  }
})

// tslint:disable-next-line: no-any
proxy.on('proxyRes', (proxyRes: any, req: any, _res: any, ) => {
  // tslint:disable-next-line: no-any
  const tempBody: any = []
  if (req.originalUrl.includes('/hierarchy') && req.originalUrl.includes('?mode=edit')) {
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

export function proxyCreatorRoute(route: Router, targetUrl: string, timeout = 10000): Router {
  route.all('/*', (req, res) => {
    const downloadKeyword = '/download/'
    if (req.url.startsWith(downloadKeyword)) {
      req.url = downloadKeyword + req.url.split(downloadKeyword)[1].replace(/\//g, '%2F')
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

export function proxyCreatorLearner(route: Router, targetUrl: string, _timeout = 10000): Router {
  route.all('/*', (req, res) => {

    const url = removePrefix(`${PROXY_SLUG}/learner`, req.originalUrl)
    logInfo('Final URL: ', targetUrl + url)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + url,
    })
  })
  return route
}

export function proxyCreatorSunbird(route: Router, targetUrl: string, _timeout = 10000): Router {
    // tslint:disable-next-line: no-any
  route.all('/*', (req: any, res) => {
    let url
    // tslint:disable-next-line: no-console
    console.log('REQ_URL_ORIGINAL proxyCreatorSunbird', req.originalUrl)

    if (req.originalUrl.includes('discussion/topic')) {
      const topic = req.originalUrl.toString().split('/')
      if (topic[5] === topic[6]) {
        req.originalUrl = topic[0] + '/' + topic[1] + '/' + topic[2] + '/' + topic[3] + '/' + topic[4] + '/' + topic[5] + '/' + topic[7]
      }
      logInfo('Updated req.originalUrl >>> ' + req.originalUrl)

    }
    if (req.originalUrl.includes('?')) {
      url = removePrefix(`${PROXY_SLUG}`, req.originalUrl) + '&_uid=' + req.session.nodebbUid
    } else {
      url = removePrefix(`${PROXY_SLUG}`, req.originalUrl) + '?_uid=' + req.session.nodebbUid
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

export function proxyCreatorKnowledge(route: Router, targetUrl: string, _timeout = 10000): Router {
  route.all('/*', (req, res) => {

    const url = removePrefix(`${PROXY_SLUG}`, req.originalUrl)
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

export function proxyHierarchyKnowledge(route: Router, targetUrl: string, _timeout = 10000): Router {

  route.all('/*', (req, res) => {
    const url = removePrefix(`${PROXY_SLUG}`, req.originalUrl)
    if (url.includes('hierarchy/update')) {
      const data = returnData(req.body, null, 'hierarchy')
      req.body = data
    }
     // tslint:disable-next-line: no-console
    console.log('REQ_URL_ORIGINAL proxyCreatorKnowledge', targetUrl + url)
    if (req.originalUrl.includes('/hierarchy') && req.originalUrl.includes('?mode=edit')) {
      logInfo('Target URL >>>>>>' + (targetUrl + url))
      proxy.web(req, res,  {
        changeOrigin: true,
        ignorePath: true,
        selfHandleResponse : true,
        target: targetUrl + url,
      })
  }
    proxy.web(req, res,  {
        changeOrigin: true,
        ignorePath: true,
        target: targetUrl + url,
      })
})
  return route
}

export function proxyCreatorUpload(route: Router, targetUrl: string, _timeout = 10000000): Router {
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

export function proxyCreatorSunbirdSearch(route: Router, targetUrl: string, _timeout = 10000): Router {
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

export function proxyCreatorToAppentUserId(route: Router, targetUrl: string, _timeout = 10000): Router {
  route.all('/*', (req, res) => {
    const userId = extractUserIdFromRequest(req).split(':')

    // tslint:disable-next-line: no-console
    console.log('REQ_URL_ORIGINAL proxyCreatorToAppentUserId', req.originalUrl)

    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + userId[userId.length - 1],
    })
  })
  return route
}

export function proxyCreatorQML(route: Router, targetUrl: string, urlType: string, _timeout = 10000, ): Router {
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

export function proxyContent(route: Router, targetUrl: string, _timeout = 10000): Router {
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

export function proxyContentLearnerVM(route: Router, targetUrl: string, _timeout = 10000): Router {
  route.all('/*', (req, res) => {
    const url = removePrefix(`${PROXY_SLUG}/learnervm/private`, req.originalUrl)
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

export function proxyCreatorDownloadCertificate(route: Router, targetUrl: string, _timeout = 10000): Router {
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
