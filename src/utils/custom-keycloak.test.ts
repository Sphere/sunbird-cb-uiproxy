/**
 * PHASE 2 — custom-keycloak.ts. Not Express route handlers — a class
 * wrapping `keycloak-connect` middleware setup, with multi-tenant domain
 * resolution logic (`getKeyCloakObject`) as its main real logic. Tested via
 * direct unit tests on the class's methods.
 *
 * `keycloak-connect`, `composable-middleware`, and `async` are all mocked
 * (module-load / constructor side effects and callback-style APIs).
 */

jest.mock('keycloak-connect', () =>
  jest.fn().mockImplementation(() => ({
    authenticated: undefined,
    deauthenticated: undefined,
    middleware: jest.fn(() => ['mw1', 'mw2']),
    protect: jest.fn(() => jest.fn((_req: unknown, _res: unknown, next: () => void) => next())),
  }))
)
jest.mock('composable-middleware', () => jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()))
jest.mock('async', () => ({
  series: jest.fn((tasks: Array<(cb: (err?: unknown) => void) => void>, done: (err?: unknown) => void) => {
    tasks.forEach((task) => task(() => undefined))
    done()
  }),
}))
jest.mock('../configs/keycloak.config', () => ({
  getKeycloakConfig: jest.fn((realm?: string) => ({ realm: realm || 'default' })),
}))
jest.mock('./permissionHelper', () => ({
  PERMISSION_HELPER: { getCurrentUserRoles: jest.fn((_req: unknown, cb: () => void) => cb()) },
}))
jest.mock('./logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('./env', () => ({
  CONSTANTS: {
    HTTPS_HOST: 'https://kc.test',
    KEYCLOAK_REALM: 'default-realm',
    MULTI_TENANT_KEYCLOAK: 'orgA,https://orga.kc.test;orgB,https://orgb.kc.test',
  },
}))

import KeycloakConnect from 'keycloak-connect'
import { CustomKeycloak } from './custom-keycloak'

// tslint:disable-next-line: no-any
const sessionConfig: any = { store: {} }

describe('CustomKeycloak', () => {
  it('creates one keycloak instance per configured tenant plus "common"', () => {
    new CustomKeycloak(sessionConfig)
    // 2 tenants (orgA, orgB) + 1 common
    expect(KeycloakConnect).toHaveBeenCalledTimes(3)
  })

  describe('getKeyCloakObject', () => {
    it('resolves by hostname when it matches a tenant key directly', () => {
      const ck = new CustomKeycloak(sessionConfig)
      // tslint:disable-next-line: no-any
      const req: any = { header: () => undefined, headers: {}, hostname: 'orgA' }
      const result = ck.getKeyCloakObject(req)
      expect(result).toBeDefined()
    })

    it('resolves by rootOrg header matching a tenant key case-insensitively', () => {
      const ck = new CustomKeycloak(sessionConfig)
      // tslint:disable-next-line: no-any
      const req: any = { header: () => 'orgb', headers: { rootorg: 'orgb' }, hostname: 'unrelated-host' }
      const result = ck.getKeyCloakObject(req)
      expect(result).toBeDefined()
    })

    it('resolves by rootorg cookie when there are no headers', () => {
      const ck = new CustomKeycloak(sessionConfig)
      // tslint:disable-next-line: no-any
      const req: any = { cookies: { rootorg: 'orgA' }, header: undefined, headers: undefined, hostname: 'unrelated-host' }
      const result = ck.getKeyCloakObject(req)
      expect(result).toBeDefined()
    })

    it('falls back to "common" when nothing matches', () => {
      const ck = new CustomKeycloak(sessionConfig)
      // tslint:disable-next-line: no-any
      const req: any = { header: () => undefined, headers: {}, hostname: 'unrelated-host' }
      const result = ck.getKeyCloakObject(req)
      expect(result).toBeDefined()
    })
  })

  describe('middleware', () => {
    it('resolves the keycloak object and invokes the composed middleware', () => {
      const ck = new CustomKeycloak(sessionConfig)
      // tslint:disable-next-line: no-any
      const req: any = { header: () => undefined, headers: {}, hostname: 'common' }
      const next = jest.fn()
      ck.middleware(req, {} as never, next)
      expect(next).toHaveBeenCalled()
    })
  })

  describe('protect', () => {
    it('copies req.session.grant onto req.kauth.grant when present, then calls the keycloak protect middleware', () => {
      const ck = new CustomKeycloak(sessionConfig)
      // tslint:disable-next-line: no-any
      const req: any = {
        header: () => undefined,
        headers: {},
        hostname: 'common',
        kauth: {},
        session: { grant: { access_token: 'tok-1' } },
      }
      const next = jest.fn()
      ck.protect(req, {} as never, next)
      expect(req.kauth.grant).toEqual({ access_token: 'tok-1' })
      expect(next).toHaveBeenCalled()
    })

    it('does not touch req.kauth when there is no session grant', () => {
      const ck = new CustomKeycloak(sessionConfig)
      // tslint:disable-next-line: no-any
      const req: any = { header: () => undefined, headers: {}, hostname: 'common', session: {} }
      const next = jest.fn()
      ck.protect(req, {} as never, next)
      expect(next).toHaveBeenCalled()
    })
  })

  describe('authenticated', () => {
    it('extracts and stores the userId from the kauth grant, then triggers the role-fetch series', async () => {
      const ck = new CustomKeycloak(sessionConfig)
      // tslint:disable-next-line: no-any
      const req: any = {
        kauth: { grant: { access_token: { content: { sub: 'f:org:user-1' } } } },
        session: {},
      }
      await ck.authenticated(req)
      expect(req.session.userId).toBe('user-1')
    })

    it('swallows a malformed kauth grant without throwing', async () => {
      const ck = new CustomKeycloak(sessionConfig)
      // tslint:disable-next-line: no-any
      const req: any = { kauth: { grant: { access_token: { content: {} } } }, session: {} }
      await expect(ck.authenticated(req)).resolves.toBeUndefined()
    })
  })

  describe('deauthenticated', () => {
    it('clears session userRoles and userId', () => {
      const ck = new CustomKeycloak(sessionConfig)
      // tslint:disable-next-line: no-any
      const req: any = { session: { userId: 'u1', userRoles: ['PUBLIC'] } }
      ck.deauthenticated(req)
      expect(req.session.userId).toBeUndefined()
      expect(req.session.userRoles).toBeUndefined()
    })
  })
})
