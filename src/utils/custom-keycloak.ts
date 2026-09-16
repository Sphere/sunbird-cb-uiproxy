import * as express from 'express'
import expressSession from 'express-session'
import keycloakConnect from 'keycloak-connect'
import { getKeycloakConfig } from '../configs/keycloak.config'
import { CONSTANTS } from './env'
import { logError, logInfo } from './logger'
import { PERMISSION_HELPER } from './permissionHelper'
const async = require('async')

const composable = require('composable-middleware')

export class CustomKeycloak {
  private multiTenantKeycloak = new Map<string, keycloakConnect>()

  constructor(sessionConfig: expressSession.SessionOptions) {
    if (CONSTANTS.MULTI_TENANT_KEYCLOAK) {
      CONSTANTS.MULTI_TENANT_KEYCLOAK.split(';').forEach((v: string) => {
        const domainUrlMap = v.split(',')
        this.multiTenantKeycloak.set(
          domainUrlMap[0],
          this.generateKeyCloak(sessionConfig, domainUrlMap[1])
        )
      })
    }
    this.multiTenantKeycloak.set('common', this.generateKeyCloak(sessionConfig))
  }

  middleware = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const keycloak = this.getKeyCloakObject(req)
    const middleware = composable(
      keycloak.middleware({
        admin: '/callback',
        logout: '/reset',
      })
    )
    middleware(req, res, next)
  };

  getKeyCloakObject(req: express.Request): keycloakConnect {
    const rootOrg =
      (req.headers ? req.header('rootOrg') : '') ||
      (req.cookies ? req.cookies.rootorg : '')
    let domain = ''
    if (rootOrg) {
      this.multiTenantKeycloak.forEach((_value, key) => {
        if (key.toLowerCase().includes(rootOrg.toLowerCase())) {
          domain = key
        }
      })
    }
    /* tslint:disable-next-line */
    return (this.multiTenantKeycloak.get(req.hostname) ||
      this.multiTenantKeycloak.get(domain) ||
      this.multiTenantKeycloak.get('common')) as keycloakConnect
  }

  // tslint:disable-next-line: no-any
  authenticated = (request: any) => {
    try {
      const userId = request.kauth.grant.access_token.content.sub.split(':')
      request.session.userId = userId[userId.length - 1]
      logInfo('Custom keycloak userId : ', userId)
    } catch (err) {
      logError(
        'userId conversation error' +
          request.kauth.grant.access_token.content.sub
      )
    }
    const postLoginRequest = []
    // tslint:disable-next-line: no-any
    postLoginRequest.push((callback: any) => {
      // console.log('in pus')
      PERMISSION_HELPER.getCurrentUserRoles(request, callback)
    })

    // tslint:disable-next-line: no-any
    async.series(postLoginRequest, (err: any) => {
      if (err) {
        logError('error loggin in user')
      } else {
        logInfo(`${process.pid}: User authenticated`)
      }
    })
  };

  // tslint:disable-next-line: no-any
  deauthenticated = (request: any) => {
    // console.log('De')
    delete request.session.userRoles
    delete request.session.userId
    logInfo(`${process.pid}: User Deauthenticated`)
  }
// tslint:disable-next-line: no-any
  protect = (req: any, res: express.Response, next: express.NextFunction) => {
    const keycloak = this.getKeyCloakObject(req)
    // tslint:disable-next-line: no-console
    if (req.session.grant) {
      logInfo('Entered into if statement to set kauth grant ')
      req.kauth.grant = req.session.grant
    }

    keycloak.protect()(req, res, next)
  };

  private generateKeyCloak(
    sessionConfig: expressSession.SessionOptions,
    realm?: string
  ): keycloakConnect {
    const keycloak = new keycloakConnect(
      { store: sessionConfig.store },
      getKeycloakConfig(realm)
    )
    keycloak.authenticated = this.authenticated
    keycloak.deauthenticated = this.deauthenticated
    return keycloak
  }
}
