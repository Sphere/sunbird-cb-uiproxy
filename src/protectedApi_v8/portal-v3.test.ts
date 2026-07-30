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
import { networkError, upstreamOk } from '../test-support/mockAxios'
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
})
