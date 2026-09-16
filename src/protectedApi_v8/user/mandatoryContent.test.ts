/**
 * PHASE — user/mandatoryContent.ts.
 *
 * One route: GET /checkStatus. A single axios.get() call (never the callable
 * axios({...}) form), wrapped in one try/catch using the standard guarded
 * `(err && err.response && ...)` fallback shape.
 *
 * The header-validation branch (rootorg / org / wid) sends its 400 and then
 * `return`s before the axios.get() call, so a missing header genuinely
 * blocks the upstream request — no Pattern F fall-through. The single
 * success response (res.status(response.status).send(response.data)) and the
 * single catch-block response are the only two response sites, so there's no
 * double-send (Pattern A) or dropped response (Pattern B). No Pattern
 * C/D/E issues either: the axios call is inside the try/catch, and nothing
 * here is a callback-based or fire-and-forget helper. Safe to exercise live
 * for both success and failure paths.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractAuthorizationFromRequest: jest.fn(() => 'Bearer token-1'),
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    KONG_API_BASE: 'https://kong.test',
    SB_API_KEY: 'sb-api-key',
  },
}))

import axios from 'axios'
import { mandatoryContent } from './mandatoryContent'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(mandatoryContent)
const withOrgHeaders = (req: ReturnType<typeof agent>) =>
  req.set('rootorg', 'root-1').set('org', 'org-1').set('wid', 'wid-1')

beforeEach(() => {
  mockAxios.get.mockReset()
})

/**
 * @description Verifies the GET /checkStatus route rejects requests missing
 * any of the rootorg/org/wid headers, forwards those headers plus the
 * derived auth token to the upstream call, and forwards the upstream
 * status/body — or falls back to a generic 500 — when the check fails.
 */
describe('GET /checkStatus', () => {
  it('should reject a request missing the rootorg header', async () => {
    const response = await agent().get('/checkStatus').set('org', 'org-1').set('wid', 'wid-1')
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should reject a request missing the org header', async () => {
    const response = await agent().get('/checkStatus').set('rootorg', 'root-1').set('wid', 'wid-1')
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should reject a request missing the wid header', async () => {
    const response = await agent().get('/checkStatus').set('rootorg', 'root-1').set('org', 'org-1')
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should return the upstream status and body when all org headers are present', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ mandatoryContentPending: false }))
    const response = await withOrgHeaders(agent().get('/checkStatus'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ mandatoryContentPending: false })
  })

  it('should forward the org headers and derived auth token to the upstream call', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ ok: true }))
    await withOrgHeaders(agent().get('/checkStatus'))
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://kong.test/v1/check/mandatoryContentStatus',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'sb-api-key',
          org: 'org-1',
          rootOrg: 'root-1',
          wid: 'wid-1',
          'x-authenticated-user-token': 'token-1',
          xAuthUser: 'token-1',
        }),
      })
    )
  })

  it('should forward the upstream status and body when the check fails', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await withOrgHeaders(agent().get('/checkStatus'))
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('should return 500 with the generic body when the check fails with no upstream response', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withOrgHeaders(agent().get('/checkStatus'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
