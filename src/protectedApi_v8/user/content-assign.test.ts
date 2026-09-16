/**
 * PHASE 1 — user/content-assign.ts.
 *
 * Four routes, all following the same shape: a `rootOrg` header guard that
 * `return`s immediately on failure (no fall-through/double-send risk), one
 * awaited axios call inside a try/catch, and a single response send on both
 * the success and failure path. getAdminLevel and getAssignments call
 * extractUserIdFromRequest (mocked) before the try block, but since the mock
 * never throws that's safe to exercise live.
 */

jest.mock('axios')
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: { SB_EXT_API_BASE_2: 'https://content-assign.test' },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { contentAssignApi } from './content-assign'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(contentAssignApi)
const withRootOrg = (req: ReturnType<typeof agent>) => req.set('rootOrg', 'r1')

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

describe('POST /searchUsers', () => {
  it('forwards the search results', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([{ id: 'u1' }]))
    const response = await withRootOrg(agent().post('/searchUsers')).send({ query: 'a' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'u1' }])
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/searchUsers').send({ query: 'a' })
    expect(response.status).toBe(400)
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await withRootOrg(agent().post('/searchUsers')).send({ query: 'a' })
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().post('/searchUsers')).send({ query: 'a' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /assignContent', () => {
  it('assigns the content', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ assigned: true }))
    const response = await withRootOrg(agent().post('/assignContent'))
      .set('org', 'o1')
      .send({ contentId: 'c1' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ assigned: true })
  })

  it('assigns the content when the optional org header is absent', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ assigned: true }))
    const response = await withRootOrg(agent().post('/assignContent')).send({ contentId: 'c1' })
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/assignContent').send({ contentId: 'c1' })
    expect(response.status).toBe(400)
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(409, { error: 'conflict' }))
    const response = await withRootOrg(agent().post('/assignContent')).send({ contentId: 'c1' })
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().post('/assignContent')).send({ contentId: 'c1' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /getAdminLevel', () => {
  it("returns the user's admin level", async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ level: 'admin' }))
    const response = await withRootOrg(agent().get('/getAdminLevel'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ level: 'admin' })
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/getAdminLevel')
    expect(response.status).toBe(400)
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await withRootOrg(agent().get('/getAdminLevel'))
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/getAdminLevel'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /getAssignments', () => {
  it('returns the content assignments for the given type', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ contentId: 'c1' }]))
    const response = await withRootOrg(agent().get('/getAssignments')).query({
      assignmentType: 'course',
    })
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ contentId: 'c1' }])
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/getAssignments').query({ assignmentType: 'course' })
    expect(response.status).toBe(400)
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(400, { error: 'bad request' }))
    const response = await withRootOrg(agent().get('/getAssignments')).query({
      assignmentType: 'course',
    })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad request' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/getAssignments')).query({
      assignmentType: 'course',
    })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
