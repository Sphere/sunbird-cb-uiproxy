/**
 * PHASE 1 — user/realTimeProgress.ts.
 *
 * Two call shapes: the callable `axios({...})` form for POST
 * /update/:contentId (used both for the SCORM/LMS status check and for the
 * regular progress update), and axios.post for POST /markAsComplete/:contentId.
 *
 * NOT tested live (dead code, unreachable via HTTP — see report to caller):
 * realTimeProgress.ts:40-42 has
 *   if (!contentId) { res.send(400); }
 * with no `return`, so if contentId were ever falsy execution would fall
 * through into the rest of the handler and could double-send. It cannot be
 * reached here because contentId is bound from the `:contentId` route
 * param — Express/path-to-regexp never matches that segment as empty, so
 * there is no request shape that triggers it over real HTTP.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({
  logError: jest.fn(),
  logErrorHeading: jest.fn(),
  logInfoHeading: jest.fn(),
}))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: { PROGRESS_API_BASE: 'https://progress.test' },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { realTimeProgressApi } from './realTimeProgress'

const mockAxiosMethods = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(realTimeProgressApi)
const withOrg = (req: ReturnType<typeof agent>) => req.set('org', 'o1').set('rootOrg', 'r1')

beforeEach(() => {
  mockAxiosMethods.post.mockReset()
  mockAxiosCallable.mockReset()
})

describe('POST /update/:contentId', () => {
  it('rejects a request missing both org and rootOrg headers', async () => {
    const response = await agent().post('/update/c1').send({})
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('rejects a request missing only rootOrg', async () => {
    const response = await agent().post('/update/c1').set('org', 'o1').send({})
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  describe('non-LMS content (no lmsType, or lmsType not "lms")', () => {
    it('forwards the progress update and returns the upstream data', async () => {
      mockAxiosCallable.mockResolvedValue(upstreamOk({ updated: true }))
      const response = await withOrg(agent().post('/update/c1')).send({ progress: 50 })
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ updated: true })
    })

    it('treats a lmsType that is not "lms" as non-LMS content', async () => {
      mockAxiosCallable.mockResolvedValue(upstreamOk({ updated: true }))
      const response = await withOrg(agent().post('/update/c1')).send({ lmsType: 'web' })
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ updated: true })
    })

    it('forwards the upstream status and body on failure', async () => {
      mockAxiosCallable.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
      const response = await withOrg(agent().post('/update/c1')).send({ progress: 50 })
      expect(response.status).toBe(502)
      expect(response.body).toEqual({ error: 'bad gateway' })
    })

    it('returns 500 with the generic body on a network failure', async () => {
      mockAxiosCallable.mockRejectedValue(networkError())
      const response = await withOrg(agent().post('/update/c1')).send({ progress: 50 })
      expect(response.status).toBe(500)
      expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
    })
  })

  describe('LMS/SCORM content (lmsType === "lms", case-insensitive)', () => {
    it('completes the update when the SCORM status check reports a passed lesson', async () => {
      mockAxiosCallable
        .mockResolvedValueOnce(
          upstreamOk({ status: 'success', data: [{ cmi_core_lesson_status: 'passed' }] })
        )
        .mockResolvedValueOnce(upstreamOk({ finalized: true }))
      const response = await withOrg(agent().post('/update/c1')).send({ lmsType: 'LMS' })
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ finalized: true })
    })

    it('reports incomplete when the SCORM status check reports a non-passed lesson', async () => {
      mockAxiosCallable.mockResolvedValue(
        upstreamOk({ status: 'success', data: [{ cmi_core_lesson_status: 'incomplete' }] })
      )
      const response = await withOrg(agent().post('/update/c1')).send({ lmsType: 'lms' })
      expect(response.status).toBe(400)
      expect(response.text).toBe('Still incomplete')
    })

    it('reports incomplete when the SCORM status check returns no data rows', async () => {
      mockAxiosCallable.mockResolvedValue(upstreamOk({ status: 'success', data: [] }))
      const response = await withOrg(agent().post('/update/c1')).send({ lmsType: 'lms' })
      expect(response.status).toBe(400)
      expect(response.text).toBe('Still incomplete')
    })

    it('reports incomplete when the SCORM status check itself is not "success"', async () => {
      mockAxiosCallable.mockResolvedValue(upstreamOk({ status: 'failed' }))
      const response = await withOrg(agent().post('/update/c1')).send({ lmsType: 'lms' })
      expect(response.status).toBe(400)
      expect(response.text).toBe('Still incomplete')
    })

    it('forwards the upstream status and body when the SCORM status check itself fails', async () => {
      mockAxiosCallable.mockRejectedValue(upstreamError(503, { error: 'scorm service down' }))
      const response = await withOrg(agent().post('/update/c1')).send({ lmsType: 'lms' })
      expect(response.status).toBe(503)
      expect(response.body).toEqual({ error: 'scorm service down' })
    })
  })
})

describe('POST /markAsComplete/:contentId', () => {
  it('marks the content complete and returns the upstream data', async () => {
    mockAxiosMethods.post.mockResolvedValue(upstreamOk({ completed: true }))
    const response = await agent().post('/markAsComplete/c1').set('rootOrg', 'r1').send({})
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ completed: true })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxiosMethods.post.mockRejectedValue(upstreamError(409, { error: 'conflict' }))
    const response = await agent().post('/markAsComplete/c1').set('rootOrg', 'r1').send({})
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxiosMethods.post.mockRejectedValue(networkError())
    const response = await agent().post('/markAsComplete/c1').set('rootOrg', 'r1').send({})
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
