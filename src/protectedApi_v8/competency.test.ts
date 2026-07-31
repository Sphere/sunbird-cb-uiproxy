/**
 * competency.ts — three routes, all the standard axios.get/axios.post proxy
 * shape with `err.response.status || 500` / `err.response.data || {...}`
 * catch blocks:
 *   GET  /getCompetency     — gated on a 'rootOrg' header, `return`s after
 *                             res.status(400).send(...) so there is no
 *                             fall-through into the protected axios.get call
 *                             (checked by hand: competency.ts lines 22-25).
 *   POST /addCompetency     — no header validation; straight axios.post proxy.
 *   POST /searchCompetency  — no header validation; straight axios.post proxy.
 *
 * None of the double-send (A), zero-response (B), missing try/catch (C),
 * unguarded err.response (D) or bypassed-validation (F) hazards from the
 * test-writing brief are present in this file — every route is wrapped in a
 * try/catch identical in shape to the ones already exercised live in
 * frac.test.ts and roleActivity.test.ts, and the one validation branch
 * (`getCompetency`'s missing rootOrg) returns immediately. Safe to exercise
 * every branch live.
 *
 * extractAuthorizationFromRequest is mocked wholesale (as in
 * roleActivity.test.ts / workallocation.test.ts) since its real
 * implementation reads req.kauth.grant.access_token.token and mountRouter()
 * doesn't install Keycloak middleware.
 */

jest.mock('axios')
jest.mock('../utils/requestExtract', () => ({
  extractAuthorizationFromRequest: jest.fn(() => 'Bearer token'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    FRAC_API_BASE: 'https://frac.test',
  },
}))

import axios from 'axios'
import { extractAuthorizationFromRequest } from '../utils/requestExtract'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { competencyApi } from './competency'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockExtractAuth = extractAuthorizationFromRequest as jest.Mock
const agent = () => mountRouter(competencyApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
  mockExtractAuth.mockReturnValue('Bearer token')
})

/**
 * @description Verifies that GET /getCompetency requires the rootOrg
 * header before calling upstream, forwards the upstream competency list and
 * status on success, and maps upstream/transport failures to the
 * appropriate error status and body.
 */
describe('GET /getCompetency', () => {
  it('should reject a request missing the rootOrg header', async () => {
    const response = await agent().get('/getCompetency').set('Authorization', 'Bearer token')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('should forward the upstream body and status on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'C1' }]))

    const response = await agent().get('/getCompetency').set('rootOrg', 'org-1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'C1' }])
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://frac.test/api/frac/getAllNodes?type=COMPETENCY&status=VERIFIED',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token' },
      })
    )
  })

  it('should forward an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent().get('/getCompetency').set('rootOrg', 'org-1')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('should fall back to 500 on a transport failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent().get('/getCompetency').set('rootOrg', 'org-1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies that POST /addCompetency proxies the request body
 * to the addDataNode endpoint, forwards the upstream body and status on
 * success, and maps upstream/transport failures to the appropriate error
 * status and body.
 */
describe('POST /addCompetency', () => {
  it('should forward the upstream body and status on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ id: 'C1' }))

    const response = await agent().post('/addCompetency').send({ name: 'Competency' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'C1' })
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://frac.test/api/frac/addDataNode',
      { name: 'Competency' },
      expect.objectContaining({
        headers: { Authorization: 'Bearer token' },
      })
    )
  })

  it('should forward an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(400, { error: 'bad request' }))

    const response = await agent().post('/addCompetency').send({ name: 'Competency' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad request' })
  })

  it('should fall back to 500 on a transport failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/addCompetency').send({ name: 'Competency' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies that POST /searchCompetency proxies the request
 * body to the searchNodes endpoint, forwards the upstream body and status
 * on success, and maps upstream/transport failures to the appropriate error
 * status and body.
 */
describe('POST /searchCompetency', () => {
  it('should forward the upstream body and status on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ results: [] }))

    const response = await agent().post('/searchCompetency').send({ searches: [] })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ results: [] })
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://frac.test/api/frac/searchNodes',
      { searches: [] },
      expect.objectContaining({
        headers: { Authorization: 'Bearer token' },
      })
    )
  })

  it('should forward an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(500, { error: 'server error' }))

    const response = await agent().post('/searchCompetency').send({ searches: [] })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'server error' })
  })

  it('should fall back to 500 on a transport failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/searchCompetency').send({ searches: [] })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
