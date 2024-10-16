import compression from 'compression'
import connectTimeout from 'connect-timeout'
import cors from 'cors'
import express, { NextFunction } from 'express'
import fileUpload from 'express-fileupload'
import expressSession from 'express-session'
import helmet from 'helmet'
import morgan from 'morgan'
import { authContent } from './authoring/authContent'
import { authIapBackend } from './authoring/authIapBackend'
import { authNotification } from './authoring/authNotification'
import { authSearch } from './authoring/authSearch'
import { authApi } from './authoring/content'
import { getSessionConfig } from './configs/session.config'
import { protectedApiV8 } from './protectedApi_v8/protectedApiV8'
import { proxiesV8 } from './proxies_v8/proxies_v8'
import { publicApiV8 } from './publicApi_v8/publicApiV8'
import { CustomKeycloak } from './utils/custom-keycloak'
import { CONSTANTS } from './utils/env'
import { logInfo, logSuccess } from './utils/logger'
const cookieParser = require('cookie-parser')
const healthcheck = require('express-healthcheck')
import { apiWhiteListLogger, isAllowed } from './utils/apiWhiteList'

function haltOnTimedOut(
  req: Express.Request,
  _: Express.Response,
  next: NextFunction
) {
  if (!req.timedout) {
    next()
  }
}
export class Server {
  // tslint:disable-next-line: no-any
  static app: any
  static bootstrap() {
    const server = new Server()
    server.app.listen(CONSTANTS.PORTAL_PORT, '0.0.0.0', () => {
      logSuccess(`${process.pid} : Server started at ${CONSTANTS.PORTAL_PORT}`)
    })
  }

  protected app = express()
  private keycloak?: CustomKeycloak
  private constructor() {
    if (CONSTANTS.CORS_ENVIRONMENT === 'dev') {
      this.app.use(
        cors({ origin: 'https://local.igot-dev.in:3000', credentials: true })
      )
    } else {
      this.app.use(cors())
    }
    const sessionConfig = getSessionConfig()
    this.app.use(expressSession(sessionConfig))
    this.app.all('*', apiWhiteListLogger())
    if (CONSTANTS.PORTAL_API_WHITELIST_CHECK === 'true') {
      logInfo('Failed ! Entered inside API whitelist check..')
      this.app.all('*', isAllowed())
    }
    this.setCookie()
    this.setKeyCloak(sessionConfig)
    this.authoringProxies()
    this.configureMiddleware()
    this.servePublicApi()
    this.serverProtectedApi()
    this.serverProxies()
    this.authoringApi()
    this.resetCookies()
    this.app.use(haltOnTimedOut)
  }
  private setCookie() {
    this.app.use(cookieParser())
    this.app.use(
      (
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        const rootOrg = req.headers
          ? req.headers.rootOrg || req.headers.rootorg
          : ''
        if (rootOrg && req.hostname.toLowerCase().includes('localhost')) {
          logInfo('Entered into SetCookie 1st part...' + rootOrg)
          res.cookie('rootorg', rootOrg)
        }
        next()
      }
    )
    this.app.use(
      (
        _req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        logInfo('Entered into SetCookie 2nd part...')
        res.header(
          'Cache-Control',
          'private, no-cache, no-store, must-revalidate'
        )
        res.header('Expires', '-1')
        res.header('Pragma', 'no-cache')
        next()
      }
    )
  }

  private configureMiddleware() {
    this.app.use(connectTimeout('240s'))
    this.app.use(compression())
    this.app.use(express.urlencoded({ extended: false, limit: '50mb' }))
    this.app.use(express.json({ limit: '50mb' }))
    this.app.use(fileUpload())
    // this.app.use(cors())
    this.app.use(
      '/healthcheck',
      healthcheck({
        healthy() {
          return { everything: 'is ok' }
        },
      })
    )
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            frameAncestors: [`'self'`],
          },
        },
        dnsPrefetchControl: { allow: true },
        frameguard: { action: 'sameorigin' },
        hidePoweredBy: true,
        ieNoOpen: true,
        noCache: false,
        noSniff: true,
      })
    )
    // TODO: See what needs to be logged
    this.app.use((req, _, next) => {
      logInfo(`Worker ${process.pid} : ${req.url}`)
      next()
    })
    this.app.use(morgan('dev'))
    this.app.use(
      morgan((tokens: morgan.TokenIndexer, req, res) =>
        [
          process.pid,
          tokens.method(req, res),
          tokens.url(req, res),
          tokens.status(req, res),
          tokens.res(req, res, 'content-length'),
          '-',
          tokens['response-time'](req, res),
          'ms',
          `timeout: ${CONSTANTS.TIMEOUT}`,
        ].join(' ')
      )
    )
    this.app.use(haltOnTimedOut)
  }
  // tslint:disable-next-line: no-any
  private setKeyCloak(sessionConfig: any) {
    this.keycloak = new CustomKeycloak(sessionConfig)
    logInfo('Entered into Setkeycloak...')
    this.app.use(this.keycloak.middleware)
  }

  private servePublicApi() {
    this.app.use('/public/v8', publicApiV8)
  }

  private serverProtectedApi() {
    if (this.keycloak) {
      this.app.use('/protected/v8', this.keycloak.protect, protectedApiV8)
    }
  }
  private serverProxies() {
    logInfo('Entered into proxies/v8' + this.keycloak)
    if (this.keycloak) {
      logInfo('Entered into proxies/v8')
      this.app.use('/proxies/v8', this.keycloak.protect, proxiesV8)
    }
  }
  private authoringProxies() {
    if (this.keycloak) {
      this.app.use('/authContent', this.keycloak.protect, authContent)
      this.app.use(
        '/authNotificationApi',
        this.keycloak.protect,
        authNotification
      )
      this.app.use('/authIapApi', this.keycloak.protect, authIapBackend)
    }
  }
  private authoringApi() {
    if (this.keycloak) {
      this.app.use('/authSearchApi', this.keycloak.protect, authSearch)
      this.app.use('/authApi', authApi)
    }
  }
  private resetCookies() {
    this.app.use('/reset', (_req, res) => {
      logInfo('CLEARING RES COOKIES')
      res.clearCookie('connect.sid', { path: '/' })
      const host = _req.get('host')
      let redirectUrl = '/public/logout'
      logInfo('Reset Cookies... received host value ' + host)
      if (host === `${CONSTANTS.HTTPS_HOST}`) {
        redirectUrl = '/public/home'
      }
      res.redirect(redirectUrl)
    })
  }
}
