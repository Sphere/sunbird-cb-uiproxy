/**
 * admin.ts is a pure aggregator: it imports 4 sub-router modules and mounts
 * each of them at a fixed path with `admin.use(mountPath, subRouter)`. There
 * is no conditional logic, no axios call, and no validation branch of its
 * own — every line executes unconditionally at module-load time. So the
 * thing worth testing here is the WIRING: does each mount path actually
 * dispatch to the sub-router the source says it should.
 *
 * Every sub-router is replaced with a tiny stub (registered via
 * `jest.doMock` in a loop, then `admin.ts` is `require()`'d afterwards so
 * the stubs are in place before it runs its imports) that echoes back which
 * module it is and the sub-path it received. That keeps this file scoped to
 * admin.ts's own logic — none of the 4 real sub-modules' axios calls, env
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

// modulePath (relative to this file / to admin.ts — both live in this same
// directory, so the relative specifiers resolve to the same module and
// jest's mock intercepts it) -> the named export admin.ts imports from it.
const subRouters: Array<{ modulePath: string; exportName: string; mountPath: string }> = [
  { modulePath: './userRegistration', exportName: 'userRegistrationApi', mountPath: '/userRegistration' },
  { modulePath: './bulkUploadUser', exportName: 'bulkUploadUserApi', mountPath: '/bulk-upload' },
  { modulePath: './userRoles', exportName: 'userRolesApi', mountPath: '/userRoles' },
  { modulePath: './bulkUserSsoMapping', exportName: 'bulkUserSsoMappingApi', mountPath: '/bulk-user-mapping' },
]

subRouters.forEach(({ modulePath, exportName }) => {
  jest.doMock(modulePath, () => ({ [exportName]: makeStub(exportName) }))
})

// Required (not imported) so the doMock calls above are in place before
// admin.ts's own top-level imports run.
// tslint:disable-next-line: no-var-requires
const { admin } = require('./admin')

const agent = () => mountRouter(admin)

/**
 * @description Verifies that each mount path registered in admin.ts
 * dispatches to the correct sub-router, and that the sub-path after the
 * mount prefix is forwarded through unchanged.
 */
describe.each(subRouters.map(({ exportName, mountPath }) => [mountPath, exportName]))(
  'mount %s',
  (mountPath: string, exportName: string) => {
    it(`should dispatch to ${exportName}`, async () => {
      const response = await agent().get(`${mountPath}/some/sub/path`)
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ mounted: exportName, subPath: '/some/sub/path' })
    })
  },
)

/**
 * @description Verifies that a request to a path no sub-router owns is not
 * swallowed by any of the mounted routers and falls through to Express's
 * default 404 handling.
 */
describe('unmounted path', () => {
  it('should return 404 for a path no sub-router owns', async () => {
    const response = await agent().get('/definitely-not-a-mounted-path')
    expect(response.status).toBe(404)
  })
})
