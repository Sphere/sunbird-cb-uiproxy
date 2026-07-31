/**
 * assessmentCompetency.ts — two routes:
 *   GET  /v1/assessment/*        — strips the mount prefix off
 *                                  req.originalUrl and hands the remainder to
 *                                  jumbler(), sending whatever jumbler
 *                                  resolves with.
 *   POST /v1/assessment/submit   — delegates to assessmentCreator() and
 *                                  forwards its {status, data} shape.
 *
 * jumbler (../utils/jumbler) and assessmentCreator (../utils/assessmentSubmitHelper)
 * are already-tested internal utils and are mocked wholesale here, matching
 * mobileAppApi.test.ts's pattern, so this suite only exercises
 * assessmentCompetency.ts's own routing/response logic.
 *
 * extractUserToken / extractUserIdFromRequest are mocked wholesale too (as in
 * assessment.test.ts) since their real implementations read
 * req.kauth.grant.access_token.token / req.session.userId, and mountRouter()
 * doesn't install Keycloak/session middleware by default.
 *
 * DANGEROUS PATTERN — NOT reproduced live, see inline comment in the GET
 * describe block below: GET /v1/assessment/* calls `jumbler(path).then(...)`
 * without a `.catch`, and does not `await` it, so the surrounding try/catch
 * never sees a jumbler rejection. A rejection there becomes an unhandled
 * promise rejection rather than a caught error — Pattern C/E territory. Only
 * the resolving (success) path is exercised live; the rejection path is
 * intentionally left untested. See the report back to the requester for the
 * file/line detail to record in docs/PROD-VERIFICATION.md.
 */

jest.mock('../utils/assessmentSubmitHelper', () => ({
  assessmentCreator: jest.fn(),
}))
jest.mock('../utils/jumbler', () => ({
  jumbler: jest.fn(),
}))
jest.mock('../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
  extractUserToken: jest.fn(() => 'token-1'),
}))

import { assessmentCompetency } from './assessmentCompetency'
import { mountRouter } from '../test-support/mountRouter'
import { upstreamError, networkError } from '../test-support/mockAxios'
import { assessmentCreator } from '../utils/assessmentSubmitHelper'
import { jumbler } from '../utils/jumbler'

const mockAssessmentCreator = assessmentCreator as jest.Mock
const mockJumbler = jumbler as jest.Mock

// Mounted at the real path (see protectedApiV8.ts: `.use('/assessmentCompetency', ...)`
// under server.ts's `.use('/protected/v8', ...)`) so removePrefix() strips the
// mount prefix exactly as it does in production.
const MOUNT_PATH = '/protected/v8/assessmentCompetency'
const agent = () => mountRouter(assessmentCompetency, { basePath: MOUNT_PATH })

beforeEach(() => {
  mockAssessmentCreator.mockReset()
  mockJumbler.mockReset()
})

/**
 * @description Verifies that GET /v1/assessment/* strips the mount prefix
 * from the request path, forwards the remainder to jumbler(), and sends
 * back whatever jumbler resolves with.
 */
describe('GET /v1/assessment/*', () => {
  // NOTE: jumbler rejecting is NOT tested live here. The handler does
  // `jumbler(path).then((response) => res.send(response))` with no `.catch`
  // and without awaiting the promise, so a rejection is never routed through
  // the route's own try/catch — it becomes an unhandled promise rejection.
  // See file header comment and the report back to the requester.

  it('should return 200 with the jumbled assessment body when jumbler resolves', async () => {
    mockJumbler.mockResolvedValue({ questions: [], timeLimit: 30 })

    const response = await agent().get(
      `${MOUNT_PATH}/v1/assessment/some/path.json`
    )

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ questions: [], timeLimit: 30 })
  })

  it('should call jumbler with the path stripped of the mount prefix', async () => {
    mockJumbler.mockResolvedValue({ questions: [] })

    await agent().get(`${MOUNT_PATH}/v1/assessment/some/path.json`)

    expect(mockJumbler).toHaveBeenCalledWith('some/path.json')
  })
})

/**
 * @description Verifies that POST /v1/assessment/submit delegates to
 * assessmentCreator() and forwards its resolved {status, data} shape, or
 * maps a rejection (with or without an upstream response) to the
 * appropriate error status and body.
 */
describe('POST /v1/assessment/submit', () => {
  it('should return 200 with the data returned by assessmentCreator on success', async () => {
    mockAssessmentCreator.mockResolvedValue({
      data: { passPercent: 60, result: 80 },
      status: 200,
    })

    const response = await agent()
      .post(`${MOUNT_PATH}/v1/assessment/submit`)
      .send({ artifactUrl: 'https://artifact.test/a1.json' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ passPercent: 60, result: 80 })
  })

  it('should forward a non-200 status returned by assessmentCreator', async () => {
    mockAssessmentCreator.mockResolvedValue({
      data: {},
      message: 'Error occured while submit in cb-ext',
      status: 404,
    })

    const response = await agent()
      .post(`${MOUNT_PATH}/v1/assessment/submit`)
      .send({})

    expect(response.status).toBe(404)
    expect(response.body).toEqual({})
  })

  it('should return the upstream error status and body when assessmentCreator rejects with a response', async () => {
    mockAssessmentCreator.mockRejectedValue(
      upstreamError(502, { error: 'upstream failed' })
    )

    const response = await agent()
      .post(`${MOUNT_PATH}/v1/assessment/submit`)
      .send({})

    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'upstream failed' })
  })

  it('should return 500 with the generic error body when assessmentCreator rejects without a response', async () => {
    mockAssessmentCreator.mockRejectedValue(networkError())

    const response = await agent()
      .post(`${MOUNT_PATH}/v1/assessment/submit`)
      .send({})

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
