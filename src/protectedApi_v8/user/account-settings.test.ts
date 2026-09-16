/**
 * PHASE 1 — user/account-settings.ts.
 *
 * Two routes:
 *  - POST '/resetPassword': no validation, straight axios.post() inside a
 *    try/catch with the standard `(err && err.response && ...)` guarded
 *    fallback in the catch — safe to exercise live for both success and
 *    failure (including a network error with no `.response`).
 *  - POST '/': guarded by a rootOrg header check with a `return` after the
 *    400 — safe, no fall-through. Direct axios.post() inside try/catch with
 *    the same guarded catch fallback — safe to exercise live for both
 *    success and failure.
 *
 * No Pattern A/B/C/D/E/F issues found on inspection.
 */

jest.mock('axios')
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    NODE_API_BASE: 'https://node-api.test',
    RESET_PASSWORD: 'https://reset-password.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { accountSettingsApi } from './account-settings'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(accountSettingsApi)

beforeEach(() => {
  mockAxios.post.mockReset()
})

/**
 * @description Verifies the POST /resetPassword route forwards the upstream
 * response on both success and failure, and falls back to 500 on a network
 * error with no upstream response.
 */
describe('POST /resetPassword', () => {
  it('should forward the upstream status and body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ token: 'abc123' }))
    const response = await agent().post('/resetPassword')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ token: 'abc123' })
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(422, { error: 'invalid request' }))
    const response = await agent().post('/resetPassword')
    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'invalid request' })
  })

  it('should return 500 on a network failure with no upstream response', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/resetPassword')
    expect(response.status).toBe(500)
  })
})

/**
 * @description Verifies the POST / route rejects requests missing the
 * rootOrg header, and otherwise forwards the account settings update and the
 * upstream response (success, failure, and network-error cases) unchanged.
 */
describe('POST /', () => {
  it('should reject a request missing the rootOrg header', async () => {
    const response = await agent().post('/').send({ name: 'test' })
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('should update the account settings and forward the upstream status and body', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ userId: 'u1' }, 201))
    const response = await agent()
      .post('/')
      .set('rootOrg', 'r1')
      .set('org', 'o1')
      .send({ name: 'test' })
    expect(response.status).toBe(201)
    expect(response.body).toEqual({ userId: 'u1' })
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(409, { error: 'conflict' }))
    const response = await agent()
      .post('/')
      .set('rootOrg', 'r1')
      .send({ name: 'test' })
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('should return 500 on a network failure with no upstream response', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent()
      .post('/')
      .set('rootOrg', 'r1')
      .send({ name: 'test' })
    expect(response.status).toBe(500)
  })
})
