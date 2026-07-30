/**
 * protectedApiV8.ts is a pure aggregator: it imports ~50 sub-router modules
 * and mounts each of them at a fixed path with
 * `protectedApiV8.use(mountPath, subRouter)`, plus one inline GET '/' health
 * handler. There is no conditional logic, no axios call, and no validation
 * branch of its own — every line executes unconditionally at module-load
 * time. So the thing worth testing here is the WIRING: does each mount path
 * actually dispatch to the sub-router the source says it should, given the
 * mount order (a later `protectedApiV8.use()` registration must not be
 * shadowed by an earlier, more general one — e.g. '/user' vs
 * '/userEnrolledInSource', '/recommendation' vs '/recommendationEngineV2',
 * '/learnerPath' vs '/learnerPathV2', '/network' vs '/networkHub',
 * '/assessment' vs '/assessmentCompetency').
 *
 * Every sub-router is replaced with a tiny stub (registered via
 * `jest.doMock` in a loop, then `protectedApiV8.ts` is `require()`'d
 * afterwards so the stubs are in place before it runs its imports) that
 * echoes back which module it is and the sub-path it received. That keeps
 * this file scoped to protectedApiV8.ts's own logic — none of the real
 * sub-modules' axios calls, env lookups or validation code runs here, only
 * their route mount points.
 */

import { Router } from 'express'
import { CONSTANTS } from '../utils/env'
import { mountRouter } from '../test-support/mountRouter'

function makeStub(name: string): Router {
  const r = Router()
  r.all(/.*/, (req, res) => {
    res.status(200).json({ mounted: name, subPath: req.path })
  })
  return r
}

// modulePath (relative to this file / to protectedApiV8.ts — both live in
// this same directory, so the relative specifiers resolve to the same
// module and jest's mock intercepts it) -> the named export
// protectedApiV8.ts imports from it -> the path(s) it is mounted at.
//
// Some modules are mounted at more than one path (userAuthKeyCloakApi at
// both '/resource' entries, fracApi at both '/frac' entries) — those extra
// mounts are deliberately redundant re-registrations of the SAME router, so
// they're listed once here (covered by the same stub either way) and called
// out separately below.
const subRouters: Array<{ modulePath: string; exportName: string; mountPath: string }> = [
  { modulePath: './admin/admin', exportName: 'admin', mountPath: '/admin' },
  { modulePath: './AI_Hub_Research/AIService', exportName: 'aiServiceAPI', mountPath: '/AI' },
  { modulePath: './assessment', exportName: 'assessmentApi', mountPath: '/assessment' },
  { modulePath: './assessmentCompetency', exportName: 'assessmentCompetency', mountPath: '/assessmentCompetency' },
  { modulePath: './attendent-content', exportName: 'attendedContentApi', mountPath: '/attended-content' },
  { modulePath: './autoCompletev2', exportName: 'autoCompletev2', mountPath: '/autoCompletev2' },
  { modulePath: './autoEnrollmentv2', exportName: 'autoEnrollmentApiv2', mountPath: '/autoEnrollmentv2' },
  { modulePath: './catalog', exportName: 'catalogApi', mountPath: '/catalog' },
  { modulePath: './cbExtRatings', exportName: 'ratingServiceApi', mountPath: '/ratings' },
  { modulePath: './certifications', exportName: 'certificationApi', mountPath: '/certifications' },
  { modulePath: './cohorts', exportName: 'cohortsApi', mountPath: '/cohorts' },
  { modulePath: './competency', exportName: 'competencyApi', mountPath: '/competency' },
  { modulePath: './concept', exportName: 'conceptGraphApi', mountPath: '/concept' },
  { modulePath: './connections_v2', exportName: 'connectionsV2Api', mountPath: '/connections' },
  { modulePath: './content', exportName: 'contentApi', mountPath: '/content' },
  { modulePath: './contentValidation', exportName: 'contentValidationApi', mountPath: '/profanity' },
  { modulePath: './counter', exportName: 'counterApi', mountPath: '/counter' },
  { modulePath: './creatorCertificateTemplate', exportName: 'creatorCertificateTemplate', mountPath: '/creatorCertificateTemplate' },
  { modulePath: './departments', exportName: 'deptApi', mountPath: '/dept' },
  { modulePath: './discussionHub/discussionHub', exportName: 'discussionHubApi', mountPath: '/discussionHub' },
  { modulePath: './entityCompetency', exportName: 'entityCompetencyApi', mountPath: '/entityCompetency' },
  { modulePath: './event-external', exportName: 'externalEventsApi', mountPath: '/event-external' },
  { modulePath: './events', exportName: 'eventsApi', mountPath: '/events' },
  { modulePath: './frac', exportName: 'fracApi', mountPath: '/frac' },
  { modulePath: './khub', exportName: 'knowledgeHubApi', mountPath: '/khub' },
  { modulePath: './leaderboard', exportName: 'leaderBoardApi', mountPath: '/leaderboard' },
  { modulePath: './learnerPath', exportName: 'learnerPathApi', mountPath: '/learnerPath' },
  { modulePath: './learnerPathV2', exportName: 'learnerPathApiV2', mountPath: '/learnerPathV2' },
  { modulePath: './navigator', exportName: 'navigatorApi', mountPath: '/navigator' },
  { modulePath: './network', exportName: 'networkConnectionApi', mountPath: '/network' },
  { modulePath: './network-hub', exportName: 'networkHubApi', mountPath: '/networkHub' },
  { modulePath: './playlist', exportName: 'playlistApi', mountPath: '/playlist' },
  { modulePath: './portal-v3', exportName: 'portalApi', mountPath: '/portal' },
  { modulePath: './profileupdatev2', exportName: 'profileupdatev2', mountPath: '/profileupdatev2' },
  { modulePath: './rcEvents', exportName: 'sunbirdrRcCertificate', mountPath: '/sunbirdrRcCertificate' },
  { modulePath: './recommendation', exportName: 'recommendationApi', mountPath: '/recommendation' },
  { modulePath: './recommendationEngineV2', exportName: 'recommendationEngineV2', mountPath: '/recommendationEngineV2' },
  { modulePath: './resource', exportName: 'userAuthKeyCloakApi', mountPath: '/resource' },
  { modulePath: './roleActivity', exportName: 'roleActivityApi', mountPath: '/roleactivity' },
  { modulePath: './scoring', exportName: 'scoringApi', mountPath: '/scroing' },
  { modulePath: './scrom', exportName: 'scromApi', mountPath: '/scrom' },
  { modulePath: './social', exportName: 'socialApi', mountPath: '/social' },
  { modulePath: './training', exportName: 'trainingApi', mountPath: '/training' },
  { modulePath: './translate', exportName: 'translateApi', mountPath: '/translate' },
  { modulePath: './updateProgressv2', exportName: 'updateProgressv2', mountPath: '/updateProgressv2' },
  { modulePath: './updateProgressv3', exportName: 'updateProgressv3', mountPath: '/updateProgressv3' },
  { modulePath: './user/rc-certificate', exportName: 'rcCert', mountPath: '/rcCert' },
  { modulePath: './user/user', exportName: 'user', mountPath: '/user' },
  { modulePath: './userEnrolledInSource', exportName: 'userEnrolledInSource', mountPath: '/userEnrolledInSource' },
  { modulePath: './workallocation', exportName: 'workAllocationApi', mountPath: '/workallocation' },
  { modulePath: './workflow-handler', exportName: 'workflowHandlerApi', mountPath: '/workflowhandler' },
]

subRouters.forEach(({ modulePath, exportName }) => {
  jest.doMock(modulePath, () => ({ [exportName]: makeStub(exportName) }))
})

// Required (not imported) so the doMock calls above are in place before
// protectedApiV8.ts's own top-level imports run.
// tslint:disable-next-line: no-var-requires
const { protectedApiV8 } = require('./protectedApiV8')

const agent = () => mountRouter(protectedApiV8)

describe('GET /', () => {
  it('returns the health payload with CONSTANTS.HTTPS_HOST', async () => {
    const response = await agent().get('/')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      config: CONSTANTS.HTTPS_HOST,
      type: 'PROTECTED API HOST 👌',
    })
  })
})

describe.each(subRouters.map(({ exportName, mountPath }) => [mountPath, exportName]))(
  'mount %s',
  (mountPath: string, exportName: string) => {
    it(`dispatches to ${exportName}`, async () => {
      const response = await agent().get(`${mountPath}/some/sub/path`)
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ mounted: exportName, subPath: '/some/sub/path' })
    })
  },
)

describe('adjacent mount paths do not shadow one another', () => {
  it('routes /assessmentCompetency (registered before /assessment) to assessmentCompetency', async () => {
    const response = await agent().get('/assessmentCompetency/1')
    expect(response.body).toEqual({ mounted: 'assessmentCompetency', subPath: '/1' })
  })

  it('routes /assessment to assessmentApi, not assessmentCompetency', async () => {
    const response = await agent().get('/assessment/1')
    expect(response.body).toEqual({ mounted: 'assessmentApi', subPath: '/1' })
  })

  it('routes /networkHub (registered before /network) to networkHubApi', async () => {
    const response = await agent().get('/networkHub/1')
    expect(response.body).toEqual({ mounted: 'networkHubApi', subPath: '/1' })
  })

  it('routes /network to networkConnectionApi, not networkHubApi', async () => {
    const response = await agent().get('/network/1')
    expect(response.body).toEqual({ mounted: 'networkConnectionApi', subPath: '/1' })
  })

  it('routes /recommendation (registered before /recommendationEngineV2) to recommendationApi', async () => {
    const response = await agent().get('/recommendation/1')
    expect(response.body).toEqual({ mounted: 'recommendationApi', subPath: '/1' })
  })

  it('routes /recommendationEngineV2 to recommendationEngineV2, not recommendationApi', async () => {
    const response = await agent().get('/recommendationEngineV2/1')
    expect(response.body).toEqual({ mounted: 'recommendationEngineV2', subPath: '/1' })
  })

  it('routes /user (registered before /userEnrolledInSource) to user', async () => {
    const response = await agent().get('/user/1')
    expect(response.body).toEqual({ mounted: 'user', subPath: '/1' })
  })

  it('routes /userEnrolledInSource to userEnrolledInSource, not user', async () => {
    const response = await agent().get('/userEnrolledInSource/1')
    expect(response.body).toEqual({ mounted: 'userEnrolledInSource', subPath: '/1' })
  })

  it('routes /learnerPath (registered before /learnerPathV2) to learnerPathApi', async () => {
    const response = await agent().get('/learnerPath/1')
    expect(response.body).toEqual({ mounted: 'learnerPathApi', subPath: '/1' })
  })

  it('routes /learnerPathV2 to learnerPathApiV2, not learnerPathApi', async () => {
    const response = await agent().get('/learnerPathV2/1')
    expect(response.body).toEqual({ mounted: 'learnerPathApiV2', subPath: '/1' })
  })

  it('routes /events to eventsApi, not shadowed by /event-external', async () => {
    const response = await agent().get('/events/1')
    expect(response.body).toEqual({ mounted: 'eventsApi', subPath: '/1' })
  })

  it('routes /event-external to externalEventsApi, not eventsApi', async () => {
    const response = await agent().get('/event-external/1')
    expect(response.body).toEqual({ mounted: 'externalEventsApi', subPath: '/1' })
  })

  it('routes /entityCompetency to entityCompetencyApi, not competencyApi', async () => {
    const response = await agent().get('/entityCompetency/1')
    expect(response.body).toEqual({ mounted: 'entityCompetencyApi', subPath: '/1' })
  })

  it('routes /competency to competencyApi', async () => {
    const response = await agent().get('/competency/1')
    expect(response.body).toEqual({ mounted: 'competencyApi', subPath: '/1' })
  })
})

describe('duplicate mount registrations re-register the same router', () => {
  it('routes /resource to userAuthKeyCloakApi (mounted twice at lines 94 and 100)', async () => {
    const response = await agent().get('/resource/1')
    expect(response.body).toEqual({ mounted: 'userAuthKeyCloakApi', subPath: '/1' })
  })

  it('routes /frac to fracApi (mounted twice at lines 98 and 102)', async () => {
    const response = await agent().get('/frac/1')
    expect(response.body).toEqual({ mounted: 'fracApi', subPath: '/1' })
  })
})

describe('unmounted path', () => {
  it('returns 404 for a path no sub-router owns', async () => {
    const response = await agent().get('/definitely-not-a-mounted-path')
    expect(response.status).toBe(404)
  })
})
