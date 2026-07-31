/**
 * PHASE 1 — user/emailToUserId.ts.
 *
 * One route, GET /:emailId, wrapped in a single try/catch:
 *  - The route param emailId is passed straight to the exported getUserId()
 *    helper, which calls axios.get() and inspects response.data.result.
 *  - If result.error is truthy, getUserId() returns { email, userId: null }
 *    without touching the network again.
 *  - Otherwise it returns result.result verbatim.
 *  - The route sends whatever getUserId() resolves to via res.send(data) —
 *    the only success response, reached only after the await completes.
 *  - The catch uses the standard `(err && err.response && ...)` guarded
 *    fallback shape, so it's safe for both a structured upstream error and a
 *    bare network error with no `.response`.
 * No Pattern A/B/C/D/E/F issues found on inspection — safe to exercise live
 * for both success and failure paths.
 */

jest.mock('axios')
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    SB_EXT_API_BASE: 'https://sb-ext.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { emailToUserIdApi } from './emailToUserId'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(emailToUserIdApi)

beforeEach(() => {
  mockAxios.get.mockReset()
})

/**
 * @description Verifies GET /:emailId resolves a user id for a valid email,
 * returns a null userId when the upstream marks the lookup as an error, and
 * forwards the upstream status/body — or falls back to a generic 500 — when
 * the axios call itself fails.
 */
describe('GET /:emailId', () => {
  it('should return the resolved user id for a known email', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({ result: { result: { email: 'a@test.com', userId: 'u1' } } })
    )
    const response = await agent().get('/a@test.com')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ email: 'a@test.com', userId: 'u1' })
  })

  it('should return a null userId when the upstream result carries an error flag', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ result: { error: 'not found' } }))
    const response = await agent().get('/missing@test.com')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ email: 'missing@test.com', userId: null })
  })

  it('should request the upstream finduuid endpoint with the email in the query string', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ result: { result: { email: 'b@test.com', userId: 'u2' } } }))
    await agent().get('/b@test.com')
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://sb-ext.test/v1/user/finduuid?userEmail=b@test.com',
      expect.anything()
    )
  })

  it('should forward the upstream status and body when the lookup fails', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'user not found' }))
    const response = await agent().get('/missing@test.com')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'user not found' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/a@test.com')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
