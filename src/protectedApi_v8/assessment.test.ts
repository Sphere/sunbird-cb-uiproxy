/**
 * assessment.ts — two routes, both using the callable `axios({...})` form
 * (via the module-private fetchAssessment helper, and via assessmentCreator).
 *
 * assessmentCreator (../utils/assessmentSubmitHelper) is mocked wholesale,
 * matching src/publicApi_v8/mobileAppApi.test.ts's pattern: that module
 * constructs a real cassandra-driver Client at import time and executes a
 * CQL insert internally, none of which is this file's concern — assessment.ts
 * only cares about the {status, data} shape it returns.
 *
 * DANGEROUS PATTERN — NOT reproduced live, see inline comments below:
 * Both POST /submit/v2 and POST /get validate required fields with
 * `if (!field) { res.status(400).json(...) }` and NO `return`. Execution
 * falls through to the rest of the handler and sends a SECOND response.
 * Since Express/Node throw synchronously ("Cannot set headers after they
 * are sent") when a second res.json()/res.send() tries to set
 * Content-Length after the first response already completed, that throw:
 *  - for /get: happens inside the try block, is caught by the route's own
 *    catch, whose res.status(401).send(...) ALSO throws (headers already
 *    sent) — that second throw is unhandled (nothing wraps the catch body),
 *    surfacing as an unhandled promise rejection.
 *  - for /submit/v2: same shape — a missing artifactUrl/courseId/batchId
 *    falls through either into the org/rootOrg check's res.send()+return,
 *    or (if org/rootOrg are present) into the final
 *    assessmentCreator-driven res.json() — either way a second send that
 *    throws, caught by the catch, whose own res.status(500).send(...)
 *    throws again, unhandled.
 * This is the exact double-send Pattern A the test-writing process calls
 * out as unsafe to reproduce live. Only the single-response paths (all
 * required fields present) are exercised below; the missing-field branches
 * are intentionally left untested. See the report back to the requester for
 * the file/line detail to record in docs/PROD-VERIFICATION.md.
 *
 * extractUserIdFromRequest is mocked wholesale, matching cohorts.test.ts's
 * documented reasoning: its fallback path reads req.session.userId, and
 * mountRouter() does not install session middleware by default, so the real
 * implementation throws on req.session being undefined. That throw is
 * caught by /submit/v2's own try/catch (harmlessly, as a single-response
 * 500) but is irrelevant to this file's behaviour, so it's mocked out here
 * too rather than exercised for real.
 */

jest.mock('axios')
jest.mock('../utils/assessmentSubmitHelper', () => ({
  assessmentCreator: jest.fn(),
}))
jest.mock('../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
  extractUserToken: jest.fn(() => 'token-1'),
}))

import axios from 'axios'
import { assessmentCreator } from '../utils/assessmentSubmitHelper'
import { mountRouter } from '../test-support/mountRouter'
import { assessmentApi } from './assessment'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockAssessmentCreator = assessmentCreator as jest.Mock
const agent = () => mountRouter(assessmentApi)

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockAssessmentCreator.mockReset()
})

describe('POST /submit/v2', () => {
  const validBody = {
    artifactUrl: 'https://artifact.test/a1.json',
    batchId: 'batch1',
    courseId: 'course1',
  }

  // NOTE: missing artifactUrl / courseId / batchId are NOT tested live here.
  // Each `if (!field) { res.status(400).json(...) }` check has no `return`,
  // so a missing field falls through into the rest of the handler and a
  // SECOND response gets attempted later (either the org/rootOrg 400, or
  // the final assessmentCreator-driven response). See file header comment
  // and the report back — this is the double-send Pattern A the process
  // explicitly says not to reproduce live.

  it('rejects a request missing org/rootOrg headers (single response, safe)', async () => {
    const response = await agent().post('/submit/v2').send(validBody)

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAssessmentCreator).not.toHaveBeenCalled()
  })

  it('forwards the status and data returned by assessmentCreator on success', async () => {
    mockAssessmentCreator.mockResolvedValue({
      data: { passPercent: 60, result: 80 },
      status: 200,
    })

    const response = await agent()
      .post('/submit/v2')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
      .send(validBody)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ passPercent: 60, result: 80 })
  })

  it('forwards a non-200 status returned by assessmentCreator (its own internal failure shape)', async () => {
    mockAssessmentCreator.mockResolvedValue({
      data: {},
      message: 'Error occured while submit in cb-ext',
      status: 404,
    })

    const response = await agent()
      .post('/submit/v2')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
      .send(validBody)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({})
  })

  it('falls back to 500 when assessmentCreator rejects', async () => {
    mockAssessmentCreator.mockRejectedValue(new Error('boom'))

    const response = await agent()
      .post('/submit/v2')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
      .send(validBody)

    expect(response.status).toBe(500)
    expect(response.body).toMatchObject({ message: 'Failed due to unknown reason' })
  })
})

describe('POST /get', () => {
  // NOTE: a missing artifactUrl is NOT tested live here either — the same
  // no-`return` shape as /submit/v2 sends a first 400, then falls through
  // to `fetchAssessment(undefined)` / `getFormatedResponse(undefined)`,
  // which throws (reading `.questions` off `undefined`) into the route's
  // catch, whose res.status(401).send(...) throws again on the
  // already-sent headers. See file header comment.

  it('returns the formatted assessment on success', async () => {
    mockAxiosCallable.mockResolvedValue({
      data: {
        isAssessment: true,
        questions: [
          {
            options: [{ optionId: 'a', isCorrect: true }],
            questionType: 'mcq-sca',
          },
          {
            options: [{ optionId: 'b', isCorrect: true, text: 'keep' }],
            questionType: 'fitb',
          },
          {
            options: [],
            questionType: 'other',
          },
        ],
        timeLimit: 30,
      },
      status: 200,
    })

    const response = await agent()
      .post('/get')
      .send({ artifactUrl: 'https://artifact.test/a1.json' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      isAssessment: true,
      questions: [
        {
          options: [{ optionId: 'a', isCorrect: false }],
          questionType: 'mcq-sca',
        },
        {
          options: [{ optionId: 'b', isCorrect: false, text: '' }],
          questionType: 'fitb',
        },
        {
          options: [],
          questionType: 'other',
        },
      ],
      timeLimit: 30,
    })
  })

  it('returns 401 when the upstream response has no questions (fetchAssessment yields undefined)', async () => {
    mockAxiosCallable.mockResolvedValue({ data: {}, status: 200 })

    const response = await agent()
      .post('/get')
      .send({ artifactUrl: 'https://artifact.test/a1.json' })

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'error while fetching assesment !!' })
  })

  it('returns 401 when the upstream call fails (fetchAssessment swallows the error internally)', async () => {
    mockAxiosCallable.mockRejectedValue(new Error('network down'))

    const response = await agent()
      .post('/get')
      .send({ artifactUrl: 'https://artifact.test/a1.json' })

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'error while fetching assesment !!' })
  })
})
