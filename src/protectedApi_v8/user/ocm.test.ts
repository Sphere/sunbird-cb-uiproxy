/**
 * PHASE 1 — user/ocm.ts (29 lines).
 *
 * One route:
 *  - GET '/getToDos/:id': userId comes from extractUserIdFromRequest(req),
 *    id from req.params.id. Direct axios.get() inside a try/catch, with the
 *    standard `(err && err.response && ...)` guarded fallback in the catch —
 *    safe to exercise live for success, an upstream error response, and a
 *    network error with no `.response`.
 *
 * No Pattern A/B/C/D/E/F issues found on inspection.
 */

jest.mock('axios')
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    SB_EXT_API_BASE: 'https://sbext.test',
  },
}))

import axios from 'axios'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { ocmApi } from './ocm'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockExtractUserIdFromRequest = extractUserIdFromRequest as jest.Mock
const agent = () => mountRouter(ocmApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockExtractUserIdFromRequest.mockReset()
  mockExtractUserIdFromRequest.mockImplementation(() => 'user-1')
})

/**
 * @description Verifies the GET /getToDos/:id route forwards the upstream
 * status and body on success, forwards the upstream status and body on an
 * upstream error response, and falls back to a 500 with a generic error body
 * on a network failure with no upstream response.
 */
describe('GET /getToDos/:id', () => {
  it('should return the upstream to-dos for the given task group id', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'task-1' }]))
    const response = await agent().get('/getToDos/tg1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'task-1' }])
  })

  it('should forward the upstream status and body on an upstream error', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'task group not found' }))
    const response = await agent().get('/getToDos/missing')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'task group not found' })
  })

  it('should return a 500 with a generic error body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/getToDos/tg1')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
