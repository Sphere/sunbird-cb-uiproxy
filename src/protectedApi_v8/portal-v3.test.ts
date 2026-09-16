/**
 * PHASE 1 — portal-v3.ts (205 uncovered).
 *
 * Five portals (spv/mdo/cbp/cbc/frac) share the same four exported functions
 * (getMyDepartment, updateDepartment, addUserRole, updateUserRole), so those
 * are tested directly ONCE each rather than once per portal route — exercising
 * a shared function five times through five thin route wrappers would inflate
 * the test count without adding real coverage. The route-level table below
 * covers the remaining standalone axios-proxy endpoints.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({ CONSTANTS: { SB_EXT_API_BASE_2: 'https://ext.test' } }))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import {
  addUserRole,
  getMyDepartment,
  getRoles,
  getUserStatus,
  portalApi,
  updateDepartment,
  updateUserRole,
} from './portal-v3'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(portalApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
  mockAxios.patch.mockReset()
  mockAxios.delete.mockReset()
})

// tslint:disable-next-line: no-any
const mockRes = () => {
  const res: { statusCode?: number; body?: unknown; status: any; send: any } = {
    send(body: unknown) {
      res.body = body
      return res
    },
    status(code: number) {
      res.statusCode = code
      return res
    },
  }
  return res
}

describe('shared helper: getMyDepartment', () => {
  it('forwards the department for the given portal', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'dept-1' }))
    const res = mockRes()
    await getMyDepartment('mdo', { headers: {}, originalUrl: '/x', query: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ id: 'dept-1' })
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const res = mockRes()
    await getMyDepartment('mdo', { headers: {}, originalUrl: '/x', query: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})

describe('shared helper: updateDepartment', () => {
  it('rejects a request with no wid header', async () => {
    const res = mockRes()
    await updateDepartment('mdo', { body: {}, headers: {} }, res)
    expect(res.statusCode).toBe(400)
    expect(mockAxios.patch).not.toHaveBeenCalled()
  })

  it('forwards the update when wid is present', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    const res = mockRes()
    await updateDepartment('mdo', { body: {}, headers: { wid: 'u1' } }, res)
    expect(res.statusCode).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.patch.mockRejectedValue(networkError())
    const res = mockRes()
    await updateDepartment('mdo', { body: {}, headers: { wid: 'u1' } }, res)
    expect(res.statusCode).toBe(500)
  })
})

describe('shared helper: addUserRole', () => {
  it('forwards the role addition', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ added: true }))
    const res = mockRes()
    await addUserRole('mdo', { body: {}, headers: {} }, res)
    expect(res.statusCode).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const res = mockRes()
    await addUserRole('mdo', { body: {}, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})

describe('shared helper: updateUserRole', () => {
  it('forwards the role update', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    const res = mockRes()
    await updateUserRole('mdo', { body: {}, headers: {} }, res)
    expect(res.statusCode).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.patch.mockRejectedValue(networkError())
    const res = mockRes()
    await updateUserRole('mdo', { body: {}, headers: {} }, res)
    expect(res.statusCode).toBe(500)
  })
})

describe('getRoles (exported helper)', () => {
  it('returns the roles on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk(['ADMIN']))
    await expect(getRoles('u1')).resolves.toEqual(['ADMIN'])
  })

  it('returns an empty array on failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    await expect(getRoles('u1')).resolves.toEqual([])
  })
})

describe('getUserStatus (exported helper)', () => {
  it('returns the status on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ active: true }))
    await expect(getUserStatus('u1')).resolves.toEqual({ active: true })
  })

  it('returns undefined on failure (not a rejection)', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    await expect(getUserStatus('u1')).resolves.toBeUndefined()
  })
})

/** Route-level endpoints that are NOT thin wrappers around the shared helpers,
 *  and do not require the `wid` header (that group is tested separately below).
 */
const DIRECT_GET_ENDPOINTS = [
  '/listDeptNames',
  '/spv/mydepartment',
  '/deptRole',
  '/deptRole/committee',
  '/departmentType',
  '/departmentType/committee',
  '/userrole/u1',
]

describe.each(DIRECT_GET_ENDPOINTS)('GET %s', (path) => {
  it('forwards the upstream response', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ ok: true }))
    const response = await agent().get(path)
    expect(response.status).toBe(200)
  })

  it('forwards an upstream error status', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get(path)
    expect(response.status).toBe(500)
  })
})

// The following all guard on req.headers.wid before calling upstream.
describe('endpoints requiring the wid header', () => {
  it('GET /spv/department rejects without wid', async () => {
    const response = await agent().get('/spv/department')
    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('GET /spv/department forwards the response when wid is present', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'd1' }]))
    const response = await agent().get('/spv/department').set('wid', 'u1')
    expect(response.status).toBe(200)
  })

  it('GET /spv/department forwards an upstream error status', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/spv/department').set('wid', 'u1')
    expect(response.status).toBe(500)
  })

  it('GET /spv/department/:deptId forwards the department', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'd1' }))
    const response = await agent().get('/spv/department/d1').set('wid', 'u1')
    expect(response.status).toBe(200)
  })

  it('POST /spv/department creates the department', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ id: 'd1' }))
    const response = await agent()
      .post('/spv/department')
      .set('wid', 'u1')
      .send({ name: 'x' })
    expect(response.status).toBe(200)
  })

  it('POST /spv/department returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/spv/department').set('wid', 'u1').send({})
    expect(response.status).toBe(500)
  })

  it('DELETE /spv/deleteDepartment/:deptId deletes the department', async () => {
    mockAxios.delete.mockResolvedValue(upstreamOk({ deleted: true }))
    const response = await agent().delete('/spv/deleteDepartment/d1').set('wid', 'u1')
    expect(response.status).toBe(200)
  })

  it('DELETE /spv/deleteDepartment/:deptId returns 500 on an upstream failure', async () => {
    mockAxios.delete.mockRejectedValue(networkError())
    const response = await agent().delete('/spv/deleteDepartment/d1').set('wid', 'u1')
    expect(response.status).toBe(500)
  })

  it('GET /cbc/department forwards the department list', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'd1' }]))
    const response = await agent().get('/cbc/department').set('wid', 'u1')
    expect(response.status).toBe(200)
  })

  it('GET /cbc/department/:deptId forwards the department', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'd1' }))
    const response = await agent().get('/cbc/department/d1').set('wid', 'u1')
    expect(response.status).toBe(200)
  })
})

describe('route wrappers delegate to the shared helpers (smoke check)', () => {
  it('GET /mdo/mydepartment reaches getMyDepartment', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ portal: 'mdo' }))
    const response = await agent().get('/mdo/mydepartment')
    expect(response.status).toBe(200)
  })

  it('POST /cbc/deptAction/userrole reaches addUserRole', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ added: true }))
    const response = await agent().post('/cbc/deptAction/userrole').send({})
    expect(response.status).toBe(200)
  })

  it('PATCH /spv/deptAction/userrole reaches updateUserRole', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent().patch('/spv/deptAction/userrole').send({})
    expect(response.status).toBe(200)
  })

  it('PATCH /spv/department reaches updateDepartment', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent().patch('/spv/department').set('wid', 'u1').send({})
    expect(response.status).toBe(200)
  })

  it('POST /spv/deptAction/userrole reaches addUserRole', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ added: true }))
    const response = await agent().post('/spv/deptAction/userrole').send({})
    expect(response.status).toBe(200)
  })

  it('PATCH /mdo/department reaches updateDepartment', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent().patch('/mdo/department').set('wid', 'u1').send({})
    expect(response.status).toBe(200)
  })

  it('POST /mdo/deptAction/userrole reaches addUserRole', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ added: true }))
    const response = await agent().post('/mdo/deptAction/userrole').send({})
    expect(response.status).toBe(200)
  })

  it('PATCH /mdo/deptAction/userrole reaches updateUserRole', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent().patch('/mdo/deptAction/userrole').send({})
    expect(response.status).toBe(200)
  })

  it('GET /cbp/mydepartment reaches getMyDepartment', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ portal: 'cbp' }))
    const response = await agent().get('/cbp/mydepartment')
    expect(response.status).toBe(200)
  })

  it('PATCH /cbp/department reaches updateDepartment', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent().patch('/cbp/department').set('wid', 'u1').send({})
    expect(response.status).toBe(200)
  })

  it('POST /cbp/deptAction/userrole reaches addUserRole', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ added: true }))
    const response = await agent().post('/cbp/deptAction/userrole').send({})
    expect(response.status).toBe(200)
  })

  it('PATCH /cbp/deptAction/userrole reaches updateUserRole', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent().patch('/cbp/deptAction/userrole').send({})
    expect(response.status).toBe(200)
  })

  it('GET /frac/mydepartment reaches getMyDepartment', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ portal: 'frac' }))
    const response = await agent().get('/frac/mydepartment')
    expect(response.status).toBe(200)
  })

  it('GET /cbc/mydepartment reaches getMyDepartment', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ portal: 'cbc' }))
    const response = await agent().get('/cbc/mydepartment')
    expect(response.status).toBe(200)
  })

  it('PATCH /cbc/department reaches updateDepartment', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent().patch('/cbc/department').set('wid', 'u1').send({})
    expect(response.status).toBe(200)
  })

  it('PATCH /cbc/deptAction/userrole reaches updateUserRole', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent().patch('/cbc/deptAction/userrole').send({})
    expect(response.status).toBe(200)
  })
})

/** Branches of the wid-guarded routes not exercised above: the 400 rejection
 *  path for routes only smoke-tested on their happy path, and the catch-block
 *  (upstream failure) path for the two full standalone handlers that embed
 *  their own try/catch (spv & cbc department-by-id lookups).
 */
describe('additional guarded-route branches', () => {
  it('GET /spv/department/:deptId rejects without wid', async () => {
    const response = await agent().get('/spv/department/d1')
    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('GET /spv/department/:deptId forwards an upstream error status', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/spv/department/d1').set('wid', 'u1')
    expect(response.status).toBe(500)
  })

  it('POST /spv/department rejects without wid', async () => {
    const response = await agent().post('/spv/department').send({})
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('DELETE /spv/deleteDepartment/:deptId rejects without wid', async () => {
    const response = await agent().delete('/spv/deleteDepartment/d1')
    expect(response.status).toBe(400)
    expect(mockAxios.delete).not.toHaveBeenCalled()
  })

  it('GET /cbc/department rejects without wid', async () => {
    const response = await agent().get('/cbc/department')
    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('GET /cbc/department forwards an upstream error status', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/cbc/department').set('wid', 'u1')
    expect(response.status).toBe(500)
  })

  it('GET /cbc/department/:deptId rejects without wid', async () => {
    const response = await agent().get('/cbc/department/d1')
    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('GET /cbc/department/:deptId forwards an upstream error status', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/cbc/department/d1').set('wid', 'u1')
    expect(response.status).toBe(500)
  })
})

/** Every handler's catch block branches on whether the rejection carries an
 *  upstream `response` (forward its real status/body) or not (fall back to
 *  500 + a generic error object). The suites above only exercise the
 *  no-`response` fallback via networkError(); these assert the other side of
 *  that `||` using upstreamError(), which the mockAxios helper module
 *  provides specifically for this branch.
 */
describe('upstream-error-response forwarding branch', () => {
  it('GET /listDeptNames forwards the upstream status and body verbatim', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await agent().get('/listDeptNames')
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('GET /spv/department forwards a non-500 upstream status', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/spv/department').set('wid', 'u1')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('GET /spv/department/:deptId forwards a non-500 upstream status', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(403, { error: 'forbidden' }))
    const response = await agent().get('/spv/department/d1').set('wid', 'u1')
    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'forbidden' })
  })

  it('POST /spv/department forwards a non-500 upstream status', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(409, { error: 'conflict' }))
    const response = await agent().post('/spv/department').set('wid', 'u1').send({})
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('DELETE /spv/deleteDepartment/:deptId forwards a non-500 upstream status', async () => {
    mockAxios.delete.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().delete('/spv/deleteDepartment/d1').set('wid', 'u1')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('GET /cbc/department forwards a non-500 upstream status', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(401, { error: 'unauthorized' }))
    const response = await agent().get('/cbc/department').set('wid', 'u1')
    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'unauthorized' })
  })

  it('GET /cbc/department/:deptId forwards a non-500 upstream status', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(400, { error: 'bad request' }))
    const response = await agent().get('/cbc/department/d1').set('wid', 'u1')
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad request' })
  })

  it('GET /deptRole/:deptTypeName forwards a non-500 upstream status', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/deptRole/committee')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('GET /departmentType/:deptType forwards a non-500 upstream status', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/departmentType/committee')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('GET /userrole/:userId forwards a non-500 upstream status', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/userrole/u1')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('shared helper getMyDepartment forwards a non-500 upstream status', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(503, { error: 'unavailable' }))
    const res = mockRes()
    await getMyDepartment('mdo', { headers: {}, originalUrl: '/x', query: {} }, res)
    expect(res.statusCode).toBe(503)
    expect(res.body).toEqual({ error: 'unavailable' })
  })

  it('shared helper updateDepartment forwards a non-500 upstream status', async () => {
    mockAxios.patch.mockRejectedValue(upstreamError(409, { error: 'conflict' }))
    const res = mockRes()
    await updateDepartment('mdo', { body: {}, headers: { wid: 'u1' } }, res)
    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({ error: 'conflict' })
  })

  it('shared helper addUserRole forwards a non-500 upstream status', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(422, { error: 'invalid' }))
    const res = mockRes()
    await addUserRole('mdo', { body: {}, headers: {} }, res)
    expect(res.statusCode).toBe(422)
    expect(res.body).toEqual({ error: 'invalid' })
  })

  it('shared helper updateUserRole forwards a non-500 upstream status', async () => {
    mockAxios.patch.mockRejectedValue(upstreamError(422, { error: 'invalid' }))
    const res = mockRes()
    await updateUserRole('mdo', { body: {}, headers: {} }, res)
    expect(res.statusCode).toBe(422)
    expect(res.body).toEqual({ error: 'invalid' })
  })
})

/** The `isUserInfoRequired` local defaults to `false` only when the query
 *  value is falsy; a truthy `allUsers` query string exercises the other side
 *  of that `if (!isUserInfoRequired)` guard in each of the four routes/
 *  helpers that read it.
 */
describe('allUsers query parameter (isUserInfoRequired) truthy branch', () => {
  it('GET /spv/mydepartment passes allUsers=true straight through unmodified', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'dept-1' }))
    const response = await agent().get('/spv/mydepartment?allUsers=true')
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('allUsers=true'),
      expect.anything()
    )
  })

  it('GET /spv/department/:deptId passes allUsers=true straight through unmodified', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'd1' }))
    const response = await agent()
      .get('/spv/department/d1?allUsers=true')
      .set('wid', 'u1')
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('allUsers=true'),
      expect.anything()
    )
  })

  it('DELETE /spv/deleteDepartment/:deptId ignores a truthy allUsers query (deleteDepartmentApi takes no such param)', async () => {
    mockAxios.delete.mockResolvedValue(upstreamOk({ deleted: true }))
    const response = await agent()
      .delete('/spv/deleteDepartment/d1?allUsers=true')
      .set('wid', 'u1')
    expect(response.status).toBe(200)
  })

  it('GET /cbc/department/:deptId passes allUsers=true straight through unmodified', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'd1' }))
    const response = await agent()
      .get('/cbc/department/d1?allUsers=true')
      .set('wid', 'u1')
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('allUsers=true'),
      expect.anything()
    )
  })

  it('shared helper getMyDepartment passes a truthy allUsers query through unmodified', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'dept-1' }))
    const res = mockRes()
    await getMyDepartment(
      'mdo',
      { headers: {}, originalUrl: '/x', query: { allUsers: 'true' } },
      res
    )
    expect(res.statusCode).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('allUsers=true'),
      expect.anything()
    )
  })
})
