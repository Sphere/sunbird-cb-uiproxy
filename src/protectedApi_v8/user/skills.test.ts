/**
 * PHASE 1 — user/skills.ts.
 *
 * One route: POST /autocomplete. It reads the rootOrg/org/locale headers
 * (only for logging and to forward as upstream headers — there is no
 * validation branch, no 400 short-circuit), then calls axios.post() inside a
 * try/catch with the standard `(err && err.response && ...)` guarded
 * fallback in the catch. Single res.send() on success, single
 * res.status(...).send(...) in the catch — no double-send, no unguarded
 * error.response access, no logic outside the try block.
 *
 * No Pattern A/B/C/D/E/F issues found on inspection. Safe to exercise live
 * for both success and failure paths (including a network error with no
 * `.response`).
 */

jest.mock('axios')
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    AUTHORING_BACKEND: 'https://authoring-backend.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { skillsApi } from './skills'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(skillsApi)

beforeEach(() => {
  mockAxios.post.mockReset()
})

/**
 * @description Verifies the POST /autocomplete route forwards the request
 * body to the upstream skills API and returns the upstream response data on
 * success, works whether or not the rootOrg/org/locale headers are present
 * (they are only used for logging/forwarding, not validated), and forwards
 * the upstream status/body — or falls back to a generic 500 — on failure.
 */
describe('POST /autocomplete', () => {
  it('should return the upstream skills data on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([{ skill: 'java' }, { skill: 'python' }]))
    const response = await agent()
      .post('/autocomplete')
      .set('rootOrg', 'r1')
      .set('org', 'o1')
      .set('locale', 'en')
      .send({ term: 'ja' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ skill: 'java' }, { skill: 'python' }])
  })

  it('should succeed even when the rootOrg/org/locale headers are absent', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ result: [] }))
    const response = await agent().post('/autocomplete').send({ term: 'py' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ result: [] })
  })

  it('should forward the upstream status and body when the upstream call fails', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await agent().post('/autocomplete').send({ term: 'ja' })
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/autocomplete').send({ term: 'ja' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
