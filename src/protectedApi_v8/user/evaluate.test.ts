/**
 * PHASE 1 — user/evaluate.ts.
 *
 * Three routes, two axios call shapes:
 *  - POST /assessment/submit/v2: try/catch around the callable `axios({...})`
 *    form, guarded by org+rootOrg header checks with a `return` after the
 *    400 — safe to exercise live.
 *  - POST /assessment/submit/iap: no header validation, callable `axios(...)`
 *    form chained with .then/.catch (not awaited, but the rejection is
 *    handled via .catch so there's no unhandled-rejection risk) — safe.
 *  - GET /post-assessment/:contentId: try/catch around axios.post(), guarded
 *    by a rootOrg header check with a `return` after the 400 — safe.
 *
 * All three catch blocks use the `(err && err.response && err.response...)`
 * guarded shape, so a network error with no `.response` safely falls back to
 * 500 rather than throwing inside the catch itself.
 */

jest.mock('axios')
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    POST_ASSESSMENT_BASE: 'https://post-assessment.test',
    POST_ASSESSMENT_CLIENT_ID: 'client-1',
    POST_ASSESSMENT_CLIENT_SECRET: 'secret-1',
    SB_API_KEY: 'api-key-1',
    SB_EXT_API_BASE_2: 'https://sb-ext.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { evaluateApi } from './evaluate'

const mockAxiosMethods = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(evaluateApi)
const withOrgHeaders = (req: ReturnType<typeof agent>) =>
  req.set('org', 'o1').set('rootOrg', 'r1')

beforeEach(() => {
  mockAxiosMethods.post.mockReset()
  mockAxiosCallable.mockReset()
})

/**
 * @description Verifies the POST /assessment/submit/v2 route rejects
 * requests missing the org or rootOrg header, and otherwise submits the
 * assessment and forwards the upstream response (success, failure, and
 * network-error cases) unchanged.
 */
describe('POST /assessment/submit/v2', () => {
  it('should submit the assessment and forward the upstream response', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ submitted: true }))
    const response = await withOrgHeaders(agent().post('/assessment/submit/v2')).send({
      answers: ['a'],
    })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ submitted: true })
  })

  it('should reject a request missing the org header', async () => {
    const response = await agent()
      .post('/assessment/submit/v2')
      .set('rootOrg', 'r1')
      .send({})
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should reject a request missing the rootOrg header', async () => {
    const response = await agent()
      .post('/assessment/submit/v2')
      .set('org', 'o1')
      .send({})
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(422, { error: 'invalid submission' }))
    const response = await withOrgHeaders(agent().post('/assessment/submit/v2')).send({})
    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'invalid submission' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await withOrgHeaders(agent().post('/assessment/submit/v2')).send({})
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies the POST /assessment/submit/iap route submits the
 * iap assessment and forwards the upstream response on success, failure,
 * and network-error cases, with no header validation involved.
 */
describe('POST /assessment/submit/iap', () => {
  it('should submit the iap assessment and forward the upstream response', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ submitted: true }))
    const response = await agent()
      .post('/assessment/submit/iap')
      .send({ root_org: 'r1', answers: ['a'] })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ submitted: true })
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(409, { error: 'conflict' }))
    const response = await agent().post('/assessment/submit/iap').send({ root_org: 'r1' })
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().post('/assessment/submit/iap').send({ root_org: 'r1' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies the GET /post-assessment/:contentId route rejects
 * requests missing the rootOrg header, and otherwise returns the
 * post-assessment data and forwards the upstream status/body — or falls
 * back to a generic 500 on a network failure.
 */
describe('GET /post-assessment/:contentId', () => {
  it('should return the post-assessment data', async () => {
    mockAxiosMethods.post.mockResolvedValue(upstreamOk({ result: 'pass' }))
    const response = await withOrgHeaders(agent().get('/post-assessment/c1')).set('wid', 'u1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ result: 'pass' })
  })

  it('should reject a request missing the rootOrg header', async () => {
    const response = await agent().get('/post-assessment/c1')
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxiosMethods.post.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await withOrgHeaders(agent().get('/post-assessment/c1'))
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxiosMethods.post.mockRejectedValue(networkError())
    const response = await withOrgHeaders(agent().get('/post-assessment/c1'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
