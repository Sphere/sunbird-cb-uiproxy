/**
 * PHASE 2 — assessmentSubmitHelper.ts. Not Express routes — one exported
 * function (`assessmentCreator`) with two internal helpers. `cassandra-driver`
 * (via `require`, module-load side effect) and `uuid` v3.4.0 (a directly
 * callable default export — `uuid()`, not the named `{ v4 }` style used in
 * some other files) are both mocked below.
 *
 * Real, if narrow, bug found while reading this file (documented in
 * docs/PROD-VERIFICATION.md, safe to test live — no hang/crash, just a
 * silently different return contract): when `fetchAssessment` resolves
 * falsy (e.g. the artifact URL's response has no `questions`), the whole
 * `if (assessmentQuestions) { ... }` block is skipped and `assessmentCreator`
 * falls off the end of its function body, implicitly returning `undefined`
 * — NOT the `statusMessage` object every other path returns. Callers
 * expecting a consistent `{ data, message, status }` shape get `undefined`
 * instead.
 */

const mockCassandraExecute = jest.fn()
jest.mock('cassandra-driver', () => ({
  Client: jest.fn(() => ({ execute: mockCassandraExecute, shutdown: jest.fn() })),
}))
jest.mock('uuid', () => jest.fn(() => 'uuid-1'))
jest.mock('axios')
jest.mock('./logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('./env', () => ({
  CONSTANTS: {
    CASSANDRA_IP: '127.0.0.1',
    SB_API_KEY: 'sb-api-key',
    SB_EXT_API_BASE_2: 'https://ext2.test',
    SUNBIRD_PROXY_API_BASE: 'https://proxy.test',
  },
}))

import axios from 'axios'
import { upstreamOk } from '../test-support/mockAxios'
import { assessmentCreator } from './assessmentSubmitHelper'

const mockAxiosCallable = axios as unknown as jest.Mock

const reqData = {
  artifactUrl: 'https://cdn.test/assessment.json',
  batchId: 'b1',
  contentId: 'c1',
  courseId: 'course1',
  questions: [{ options: [{ optionId: 'o1' }], question: 'Q1' }],
}

function mockAssessmentFetchAndSubmit(submitResult: number, extra: Record<string, unknown> = {}) {
  mockAxiosCallable.mockImplementation((config: { url: string; method?: string }) => {
    if (config.url === reqData.artifactUrl) {
      return Promise.resolve(
        upstreamOk({ questions: [{ options: [{ isCorrect: true, optionId: 'o1', text: 'A' }], question: 'Q1', questionType: 'mcq-sca' }] })
      )
    }
    if (config.url.includes('assessment/submit')) {
      return Promise.resolve(upstreamOk({ blank: 0, correct: 1, inCorrect: 0, result: submitResult, total: 1, ...extra }))
    }
    if (config.url.includes('content/state/update')) {
      return Promise.resolve(upstreamOk({}))
    }
    return Promise.reject(new Error(`Unexpected axios call: ${config.url}`))
  })
}

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockCassandraExecute.mockReset()
})

describe('assessmentCreator', () => {
  it('submits the assessment and updates content state when the pass threshold is met', async () => {
    mockAssessmentFetchAndSubmit(80)
    const result = await assessmentCreator(reqData, 'token-1', 'user-1')
    expect(result).toEqual({ data: expect.objectContaining({ passPercent: 60, result: 80 }), message: 'Assessment submitted successfully', status: 200 })
    expect(mockAxiosCallable).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('content/state/update') }))
  })

  it('skips the content-state update when the score is below the default 60% threshold', async () => {
    mockAssessmentFetchAndSubmit(40)
    await assessmentCreator(reqData, 'token-1', 'user-1')
    expect(mockAxiosCallable).not.toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('content/state/update') }))
  })

  it('honours an explicit passPercentage of 0 (every result passes)', async () => {
    mockAssessmentFetchAndSubmit(0)
    const result = await assessmentCreator({ ...reqData, passPercentage: 0 }, 'token-1', 'user-1')
    expect((result.data as { passPercent: number }).passPercent).toBe(0)
    expect(mockAxiosCallable).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('content/state/update') }))
  })

  it('honours a custom explicit passPercentage', async () => {
    mockAssessmentFetchAndSubmit(75)
    const result = await assessmentCreator({ ...reqData, passPercentage: 90 }, 'token-1', 'user-1')
    expect((result.data as { passPercent: number }).passPercent).toBe(90)
    expect(mockAxiosCallable).not.toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('content/state/update') }))
  })

  it('records the attempt in Cassandra', async () => {
    mockAssessmentFetchAndSubmit(80)
    await assessmentCreator(reqData, 'token-1', 'user-1')
    expect(mockCassandraExecute).toHaveBeenCalledWith(
      expect.stringContaining('user_assessment_info'),
      expect.arrayContaining(['uuid-1', 'user-1', 'c1']),
      expect.objectContaining({ prepare: true })
    )
  })

  it('still returns the success statusMessage when the Cassandra insert itself throws', async () => {
    mockAssessmentFetchAndSubmit(80)
    mockCassandraExecute.mockImplementation(() => {
      throw new Error('cassandra unavailable')
    })
    const result = await assessmentCreator(reqData, 'token-1', 'user-1')
    expect(result.status).toBe(200)
  })

  it('returns a 404 statusMessage when the submit call fails', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url === reqData.artifactUrl) {
        return Promise.resolve(upstreamOk({ questions: [{ options: [], question: 'Q1' }] }))
      }
      return Promise.reject(new Error('network down'))
    })
    const result = await assessmentCreator(reqData, 'token-1', 'user-1')
    expect(result).toEqual({ data: {}, message: 'Error occured while submit in cb-ext', status: 404 })
  })

  it('returns undefined (documented inconsistent contract) when the artifact has no questions', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ questions: null }))
    const result = await assessmentCreator(reqData, 'token-1', 'user-1')
    expect(result).toBeUndefined()
  })
})
