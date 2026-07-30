/**
 * user.ts is a pure aggregator: it imports 41 sub-router modules and mounts
 * each of them at a fixed path with `user.use(mountPath, subRouter)`. There
 * is no conditional logic, no axios call, and no validation branch of its
 * own — every line executes unconditionally at module-load time. So the
 * thing worth testing here is the WIRING: does each mount path actually
 * dispatch to the sub-router the source says it should, given the mount
 * order (a later `user.use()` registration must not be shadowed by an
 * earlier, more general one — e.g. '/topic' vs '/topics', '/content' vs
 * '/content-assign').
 *
 * Every sub-router is replaced with a tiny stub (registered via
 * `jest.doMock` in a loop, then `user.ts` is `require()`'d afterwards so the
 * stubs are in place before it runs its imports) that echoes back which
 * module it is and the sub-path it received. That keeps this file scoped to
 * user.ts's own logic — none of the 41 real sub-modules' axios calls, env
 * lookups or validation code runs here, only their route mount points.
 */

import { Router } from 'express'
import { mountRouter } from '../../test-support/mountRouter'

function makeStub(name: string): Router {
  const r = Router()
  r.all(/.*/, (req, res) => {
    res.status(200).json({ mounted: name, subPath: req.path })
  })
  return r
}

// modulePath (relative to this file / to user.ts — both live in this same
// directory, so the relative specifiers resolve to the same module and
// jest's mock intercepts it) -> the named export user.ts imports from it.
const subRouters: Array<{ modulePath: string; exportName: string; mountPath: string }> = [
  { modulePath: './accessControl', exportName: 'accessControlApi', mountPath: '/accessControl' },
  { modulePath: './account-settings', exportName: 'accountSettingsApi', mountPath: '/account-settings' },
  { modulePath: './activity', exportName: 'activity', mountPath: '/activity' },
  { modulePath: './admin-users', exportName: 'usersApi', mountPath: '/users' },
  { modulePath: './auto-complete', exportName: 'autocompleteApi', mountPath: '/autocomplete' },
  { modulePath: './badge', exportName: 'badgeApi', mountPath: '/badge' },
  { modulePath: './changeEmail', exportName: 'changeEmailApi', mountPath: '/change-email' },
  { modulePath: './classDiagram', exportName: 'classDiagramApi', mountPath: '/class-diagram' },
  { modulePath: './code', exportName: 'codeApi', mountPath: '/code' },
  { modulePath: './content', exportName: 'userContentApi', mountPath: '/content' },
  { modulePath: './content-assign', exportName: 'contentAssignApi', mountPath: '/content-assign' },
  { modulePath: './dashboard', exportName: 'dashboardApi', mountPath: '/dashboard' },
  { modulePath: './details', exportName: 'detailsApi', mountPath: '/details' },
  { modulePath: './email', exportName: 'emailApi', mountPath: '/email' },
  { modulePath: './emailToUserId', exportName: 'emailToUserIdApi', mountPath: '/emailToUserId' },
  { modulePath: './evaluate', exportName: 'evaluateApi', mountPath: '/evaluate' },
  { modulePath: './exercise', exportName: 'exerciseApi', mountPath: '/exercise' },
  { modulePath: './feedback', exportName: 'feedbackApi', mountPath: '/feedback' },
  { modulePath: './feedbackV2', exportName: 'feedbackV2Api', mountPath: '/feedbackV2' },
  { modulePath: './follow', exportName: 'followApi', mountPath: '/follow' },
  { modulePath: './goals', exportName: 'goalsApi', mountPath: '/goals' },
  { modulePath: './group', exportName: 'userGroupApi', mountPath: '/group' },
  { modulePath: './history', exportName: 'historyApi', mountPath: '/history' },
  { modulePath: './iconBadge', exportName: 'iconBadgeApi', mountPath: '/iconBadge' },
  { modulePath: './mandatoryContent', exportName: 'mandatoryContent', mountPath: '/mandatoryContent' },
  { modulePath: './miniProfile', exportName: 'userMiniProfile', mountPath: '/mini-profile' },
  { modulePath: './myAnalytics', exportName: 'myAnalyticsApi', mountPath: '/myAnalytics' },
  { modulePath: './notifications', exportName: 'notificationsApi', mountPath: '/notifications' },
  { modulePath: './ocm', exportName: 'ocmApi', mountPath: '/ocm' },
  { modulePath: './playlist', exportName: 'playlistApi', mountPath: '/playlist' },
  { modulePath: './preference', exportName: 'protectedPreference', mountPath: '/preference' },
  { modulePath: './profile', exportName: 'profileApi', mountPath: '/profile' },
  { modulePath: './profile-details', exportName: 'profileDeatailsApi', mountPath: '/profileDetails' },
  { modulePath: './profile-registry', exportName: 'profileRegistryApi', mountPath: '/profileRegistry' },
  { modulePath: './progress', exportName: 'progressApi', mountPath: '/progress' },
  { modulePath: './rating', exportName: 'ratingApi', mountPath: '/rating' },
  { modulePath: './rdbms', exportName: 'rdbmsApi', mountPath: '/rdbms' },
  { modulePath: './realTimeProgress', exportName: 'realTimeProgressApi', mountPath: '/realTimeProgress' },
  { modulePath: './roles', exportName: 'rolesApi', mountPath: '/roles' },
  { modulePath: './share', exportName: 'shareApi', mountPath: '/share' },
  { modulePath: './skills', exportName: 'skillsApi', mountPath: '/skills' },
  { modulePath: './telemetry', exportName: 'telemetryApi', mountPath: '/telemetry' },
  { modulePath: './tnc', exportName: 'protectedTnc', mountPath: '/tnc' },
  { modulePath: './token', exportName: 'userTokenApi', mountPath: '/token' },
  { modulePath: './topic', exportName: 'topicApi', mountPath: '/topic' },
  { modulePath: './topics', exportName: 'topicsApi', mountPath: '/topics' },
  { modulePath: './validate', exportName: 'validateApi', mountPath: '/validate' },
  { modulePath: './viewprofile', exportName: 'viewProfileApi', mountPath: '/viewprofile' },
]

subRouters.forEach(({ modulePath, exportName }) => {
  jest.doMock(modulePath, () => ({ [exportName]: makeStub(exportName) }))
})

// Required (not imported) so the doMock calls above are in place before
// user.ts's own top-level imports run.
// tslint:disable-next-line: no-var-requires
const { user } = require('./user')

const agent = () => mountRouter(user)

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
  it('routes /topics (registered after /topic) to topicsApi, not topicApi', async () => {
    const response = await agent().get('/topics/list')
    expect(response.body).toEqual({ mounted: 'topicsApi', subPath: '/list' })
  })

  it('routes /topic to topicApi', async () => {
    const response = await agent().get('/topic/1')
    expect(response.body).toEqual({ mounted: 'topicApi', subPath: '/1' })
  })

  it('routes /content-assign (registered before /content) to contentAssignApi', async () => {
    const response = await agent().get('/content-assign/1')
    expect(response.body).toEqual({ mounted: 'contentAssignApi', subPath: '/1' })
  })

  it('routes /content to userContentApi, not contentAssignApi', async () => {
    const response = await agent().get('/content/1')
    expect(response.body).toEqual({ mounted: 'userContentApi', subPath: '/1' })
  })

  it('routes /profileDetails to profileDeatailsApi, not profileApi', async () => {
    const response = await agent().get('/profileDetails/1')
    expect(response.body).toEqual({ mounted: 'profileDeatailsApi', subPath: '/1' })
  })

  it('routes /profileRegistry to profileRegistryApi, not profileApi', async () => {
    const response = await agent().get('/profileRegistry/1')
    expect(response.body).toEqual({ mounted: 'profileRegistryApi', subPath: '/1' })
  })
})

describe('unmounted path', () => {
  it('returns 404 for a path no sub-router owns', async () => {
    const response = await agent().get('/definitely-not-a-mounted-path')
    expect(response.status).toBe(404)
  })
})
