/**
 * PHASE 1 — user/group.ts.
 *
 * Two routes, both using axios.get/axios.post (never the callable axios({...})
 * form), both wrapped in try/catch with the `(err && err.response && ...)`
 * guarded fallback shape. No Pattern A/B/C/D/E/F issues found on inspection:
 *  - GET /groupContent has no header validation branch; both axios calls
 *    (get then post) are inside the single try/catch, and the only response
 *    is the trailing res.json() / the catch's res.status(...).send(...).
 *  - GET /fetchUserGroup guards on the rootOrg header with an explicit
 *    `return` after the 400, so the real axios.get() below never runs when
 *    rootOrg is missing.
 * All safe to exercise live for both success and failure paths.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    SB_EXT_API_BASE: 'https://sb-ext.test',
    USER_PROFILE_API_BASE: 'https://user-profile.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { userGroupApi } from './group'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(userGroupApi)
const withRootOrg = (req: ReturnType<typeof agent>) => req.set('rootOrg', 'r1')

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

/**
 * @description Verifies the GET /groupContent route combines the group
 * lookup and content search into a single response, defaults and forwards
 * pageSize correctly, and forwards the upstream status/body — or falls back
 * to a generic 500 — when either upstream call fails.
 */
describe('GET /groupContent', () => {
  it('should return the search results for the caller\'s group content', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ group_id: 'g1' }, { group_id: 'g2' }]))
    mockAxios.post.mockResolvedValue(upstreamOk({ result: [{ id: 'c1' }] }))
    const response = await withRootOrg(agent().get('/groupContent'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ contents: [{ id: 'c1' }] })
  })

  it('should default pageSize to 50 when none is given', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))
    mockAxios.post.mockResolvedValue(upstreamOk({ result: [] }))
    const response = await withRootOrg(agent().get('/groupContent'))
    expect(response.status).toBe(200)
  })

  it('should forward a caller-provided pageSize', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))
    mockAxios.post.mockResolvedValue(upstreamOk({ result: [] }))
    const response = await withRootOrg(agent().get('/groupContent')).query({ pageSize: 10 })
    expect(response.status).toBe(200)
  })

  it('should forward the upstream status and body when the group lookup fails', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await withRootOrg(agent().get('/groupContent'))
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('should return 500 with the generic body when the search call fails with no upstream response', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ group_id: 'g1' }]))
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/groupContent'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies the GET /fetchUserGroup route rejects requests
 * missing the rootOrg header, returns group data for either the session
 * user or an explicit userId query param, and forwards the upstream
 * status/body — or falls back to a generic 500 — on failure.
 */
describe('GET /fetchUserGroup', () => {
  it('should reject a request missing the rootOrg header', async () => {
    const response = await agent().get('/fetchUserGroup')
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should return the group data for the caller (userId from the session)', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ groups: ['g1'] }))
    const response = await withRootOrg(agent().get('/fetchUserGroup'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ groups: ['g1'] })
  })

  it('should return the group data for an explicit userId query param', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ groups: ['g2'] }))
    const response = await withRootOrg(agent().get('/fetchUserGroup')).query({ userId: 'u2' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ groups: ['g2'] })
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await withRootOrg(agent().get('/fetchUserGroup'))
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/fetchUserGroup'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
