/**
 * publicApiV8.ts is a pure aggregator: it imports 36 sub-router modules
 * (one of them, emailOrMobileLogin, is mounted twice, at two different
 * paths) plus one ad-hoc proxy router built inline via proxyCreatorRoute,
 * and mounts each of them at a fixed path with
 * `publicApiV8.use(mountPath, subRouter)`. It also has a single real route
 * of its own: `GET /` returns a static status payload. There is no other
 * conditional logic, no axios call, and no validation branch of its own —
 * every line executes unconditionally at module-load time. So the thing
 * worth testing here is the WIRING: does each mount path actually dispatch
 * to the sub-router the source says it should, given the mount order (a
 * later `publicApiV8.use()` registration must not be shadowed by an
 * earlier, more general one — e.g. '/competency' vs '/competencyAssets',
 * '/signup' vs '/signupWithAutoLogin').
 *
 * Every sub-router is replaced with a tiny stub (registered via
 * `jest.doMock` in a loop, then `publicApiV8.ts` is `require()`'d
 * afterwards so the stubs are in place before it runs its imports) that
 * echoes back which module it is and the sub-path it received. That keeps
 * this file scoped to publicApiV8.ts's own logic — none of the real
 * sub-modules' axios calls, env lookups or validation code runs here, only
 * their route mount points.
 *
 * `../utils/proxyCreator` is also mocked: the real `proxyCreatorRoute`
 * hands the request to `http-proxy`'s `.web()`, which would attempt a real
 * network call (and hang/error in a test environment) rather than
 * responding synchronously.
 */

import { Router } from 'express'
import { mountRouter } from '../test-support/mountRouter'

function makeStub(name: string): Router {
  const r = Router()
  r.all(/.*/, (req, res) => {
    res.status(200).json({ mounted: name, subPath: req.path })
  })
  return r
}

// modulePath (relative to this file / to publicApiV8.ts — both live in this
// same directory, so the relative specifiers resolve to the same module and
// jest's mock intercepts it) -> the named export publicApiV8.ts imports
// from it, and every mount path it is registered at (in source order).
const subRouters: Array<{ modulePath: string; exportName: string; mountPaths: string[] }> = [
  { modulePath: './appCertificateDownload', exportName: 'appCertificateDownload', mountPaths: ['/appCertificateDownload/'] },
  { modulePath: './appSignUpWithAutoLogin', exportName: 'appSignUpWithAutoLogin', mountPaths: ['/appSignUpWithAutoLogin'] },
  { modulePath: './bnrcUser', exportName: 'bnrcUserCreation', mountPaths: ['/bnrcUserCreation'] },
  { modulePath: './certificateValidate', exportName: 'validateCertificate', mountPaths: ['/certificate/'] },
  { modulePath: './competencyAssets', exportName: 'competencyAssets', mountPaths: ['/competencyAssets/'] },
  { modulePath: './competencyReporting', exportName: 'competencyReporting', mountPaths: ['/competencyReporting/'] },
  { modulePath: './competencyUser', exportName: 'publicCompetencyUser', mountPaths: ['/competency'] },
  { modulePath: './courseRecommendation', exportName: 'courseRecommendation', mountPaths: ['/courseRecommendation'] },
  { modulePath: './customSignup', exportName: 'customSignUp', mountPaths: ['/register/'] },
  { modulePath: './emailOrMobileLoginSignIn', exportName: 'emailOrMobileLogin', mountPaths: ['/emailMobile/', '/login/'] },
  { modulePath: './forgotPassword', exportName: 'forgotPassword', mountPaths: ['/forgot-password/'] },
  { modulePath: './googleSignInRoutes', exportName: 'googleAuth', mountPaths: ['/google/'] },
  { modulePath: './home', exportName: 'homePage', mountPaths: ['/homePage'] },
  { modulePath: './maharastraNursingCouncilAuth', exportName: 'maharastraNursingCouncilAuth', mountPaths: ['/mnc'] },
  { modulePath: './maternityFoundationAuth', exportName: 'maternityFoundationAuth', mountPaths: ['/maternityFoundation'] },
  { modulePath: './mobileAppApi', exportName: 'mobileAppApi', mountPaths: ['/mobileApp/'] },
  { modulePath: './mpNHMUser', exportName: 'mpNHMUserCreation', mountPaths: ['/mpNHMUserCreation'] },
  { modulePath: './publicCertifcateFlinkv2', exportName: 'publicCertificateFlinkv2', mountPaths: ['/publicCertificateFlinkv2/'] },
  { modulePath: './publicContent', exportName: 'publicContentApi', mountPaths: ['/publicContent/'] },
  { modulePath: './publicReadForm', exportName: 'publicReadForm', mountPaths: ['/publicReadForm'] },
  { modulePath: './publicSearch', exportName: 'publicSearch', mountPaths: ['/publicSearch/'] },
  { modulePath: './publicTelemetry', exportName: 'publicTelemetry', mountPaths: ['/publicTelemetry/'] },
  { modulePath: './ratingsSearch', exportName: 'ratingsSearch', mountPaths: ['/ratingsSearch'] },
  { modulePath: './sashaktAuth', exportName: 'sashakt', mountPaths: ['/sashaktAuth/'] },
  { modulePath: './signup', exportName: 'signup', mountPaths: ['/signup'] },
  { modulePath: './signupWithAutoLogin', exportName: 'signupWithAutoLogin', mountPaths: ['/signupWithAutoLogin'] },
  { modulePath: './signupWithAutoLoginOrgForm', exportName: 'signupWithAutoLoginOrgForm', mountPaths: ['/signupWithAutoLoginOrgForm'] },
  { modulePath: './signupWithAutoLoginV2', exportName: 'signupWithAutoLoginV2', mountPaths: ['/signupWithAutoLoginV2'] },
  { modulePath: './ssoLogin', exportName: 'ssoLogin', mountPaths: ['/ssoLogin'] },
  { modulePath: './tnaiAuth', exportName: 'tnaiAuth', mountPaths: ['/tnai'] },
  { modulePath: './tnc', exportName: 'publicTnc', mountPaths: ['/tnc'] },
  { modulePath: './tnnmcAuthV2', exportName: 'tnnmcAuth', mountPaths: ['/tnnmc'] },
  { modulePath: './upsmfUser', exportName: 'upsmfUserCreation', mountPaths: ['/upsmfUserCreation'] },
  { modulePath: './userDeactivation', exportName: 'deactivateUser', mountPaths: ['/deactivateUser'] },
  { modulePath: './userOtp', exportName: 'userOtp', mountPaths: ['/testUserOtp'] },
  { modulePath: './userReporting', exportName: 'userReporting', mountPaths: ['/userReporting'] },
]

subRouters.forEach(({ modulePath, exportName }) => {
  jest.doMock(modulePath, () => ({ [exportName]: makeStub(exportName) }))
})

// The '/assets' mount doesn't import a named sub-router — it builds one
// inline via proxyCreatorRoute(express.Router(), targetUrl). Mock the
// utility itself so it returns a stub instead of wiring up a real
// http-proxy target.
jest.doMock('../utils/proxyCreator', () => ({
  proxyCreatorRoute: (route: Router) => {
    route.all(/.*/, (req, res) => {
      res.status(200).json({ mounted: 'assetsProxy', subPath: req.path })
    })
    return route
  },
}))

// Required (not imported) so the doMock calls above are in place before
// publicApiV8.ts's own top-level imports run.
// tslint:disable-next-line: no-var-requires
const { publicApiV8 } = require('./publicApiV8')

const agent = () => mountRouter(publicApiV8)

describe('GET / (own route, not a sub-router)', () => {
  it('returns the status payload', async () => {
    const response = await agent().get('/')
    expect(response.status).toBe(200)
    expect(response.body.status).toEqual(expect.stringContaining('Public Api is working fine'))
  })
})

describe('mount /assets', () => {
  it('dispatches to the proxyCreatorRoute-built router', async () => {
    const response = await agent().get('/assets/some/sub/path')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ mounted: 'assetsProxy', subPath: '/some/sub/path' })
  })
})

describe.each(
  subRouters.flatMap(({ exportName, mountPaths }) =>
    mountPaths.map((mountPath) => [mountPath, exportName])
  )
)('mount %s', (mountPath: string, exportName: string) => {
  it(`dispatches to ${exportName}`, async () => {
    // Some source mount paths already end in '/' (e.g. '/certificate/'),
    // others don't (e.g. '/competency') — normalize before appending the
    // sub-path so the request always lands one segment below the mount.
    const base = mountPath.endsWith('/') ? mountPath.slice(0, -1) : mountPath
    const response = await agent().get(`${base}/some/sub/path`)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ mounted: exportName, subPath: '/some/sub/path' })
  })
})

describe('adjacent mount paths do not shadow one another', () => {
  it('routes /competency to publicCompetencyUser', async () => {
    const response = await agent().get('/competency/1')
    expect(response.body).toEqual({ mounted: 'publicCompetencyUser', subPath: '/1' })
  })

  it('routes /competencyAssets (registered after /competency) to competencyAssets, not publicCompetencyUser', async () => {
    const response = await agent().get('/competencyAssets/1')
    expect(response.body).toEqual({ mounted: 'competencyAssets', subPath: '/1' })
  })

  it('routes /competencyReporting (registered after /competency) to competencyReporting, not publicCompetencyUser', async () => {
    const response = await agent().get('/competencyReporting/1')
    expect(response.body).toEqual({ mounted: 'competencyReporting', subPath: '/1' })
  })

  it('routes /signup to signup', async () => {
    const response = await agent().get('/signup/1')
    expect(response.body).toEqual({ mounted: 'signup', subPath: '/1' })
  })

  it('routes /signupWithAutoLogin (registered after /signup) to signupWithAutoLogin, not signup', async () => {
    const response = await agent().get('/signupWithAutoLogin/1')
    expect(response.body).toEqual({ mounted: 'signupWithAutoLogin', subPath: '/1' })
  })

  it('routes /signupWithAutoLoginV2 to signupWithAutoLoginV2, not signupWithAutoLogin', async () => {
    const response = await agent().get('/signupWithAutoLoginV2/1')
    expect(response.body).toEqual({ mounted: 'signupWithAutoLoginV2', subPath: '/1' })
  })

  it('routes /signupWithAutoLoginOrgForm to signupWithAutoLoginOrgForm, not signupWithAutoLogin', async () => {
    const response = await agent().get('/signupWithAutoLoginOrgForm/1')
    expect(response.body).toEqual({ mounted: 'signupWithAutoLoginOrgForm', subPath: '/1' })
  })

  it('routes /appSignUpWithAutoLogin to appSignUpWithAutoLogin, not appCertificateDownload', async () => {
    const response = await agent().get('/appSignUpWithAutoLogin/1')
    expect(response.body).toEqual({ mounted: 'appSignUpWithAutoLogin', subPath: '/1' })
  })

  it('routes /appCertificateDownload/ to appCertificateDownload', async () => {
    const response = await agent().get('/appCertificateDownload/1')
    expect(response.body).toEqual({ mounted: 'appCertificateDownload', subPath: '/1' })
  })

  it('routes /tnc to publicTnc, not tnai/tnnmc', async () => {
    const response = await agent().get('/tnc/1')
    expect(response.body).toEqual({ mounted: 'publicTnc', subPath: '/1' })
  })

  it('routes /tnai to tnaiAuth', async () => {
    const response = await agent().get('/tnai/1')
    expect(response.body).toEqual({ mounted: 'tnaiAuth', subPath: '/1' })
  })

  it('routes /tnnmc to tnnmcAuth', async () => {
    const response = await agent().get('/tnnmc/1')
    expect(response.body).toEqual({ mounted: 'tnnmcAuth', subPath: '/1' })
  })

  it('routes /emailMobile/ and /login/ (same sub-router mounted twice) to emailOrMobileLogin', async () => {
    const viaEmailMobile = await agent().get('/emailMobile/1')
    const viaLogin = await agent().get('/login/1')
    expect(viaEmailMobile.body).toEqual({ mounted: 'emailOrMobileLogin', subPath: '/1' })
    expect(viaLogin.body).toEqual({ mounted: 'emailOrMobileLogin', subPath: '/1' })
  })
})

describe('unmounted path', () => {
  it('returns 404 for a path no sub-router owns', async () => {
    const response = await agent().get('/definitely-not-a-mounted-path')
    expect(response.status).toBe(404)
  })
})
