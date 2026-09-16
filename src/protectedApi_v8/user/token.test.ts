/**
 * PHASE 1 — user/token.ts.
 *
 * One route, GET /, wrapped in a single try/catch with the standard
 * `(err && err.response && ...)` guarded fallback shape:
 *  - if (email) -> axios.get(tokenWithEmail + email) -> res.json(response)
 *  - else if (code && redirectUrl) -> axios.get(tokenWithCode + code +
 *    '&redirecturi=' + redirectUrl) -> res.json(response)
 *  - else -> res.status(400).send('You must pass ...')
 * The if/else-if/else chain is mutually exclusive (each branch is a single
 * res.* call reached from its own branch only), so there is no Pattern A
 * double-send risk, and the else covers every remaining input so there is no
 * Pattern B hang. The whole handler is inside one try/catch (no Pattern C/E),
 * and the catch guards `err.response` with `&&` before touching
 * `.status`/`.data` (no Pattern D crash). The 400 branch never falls through
 * to an axios call (no Pattern F bypass). Safe to exercise live for both
 * success and failure paths.
 *
 * Note: unlike most handlers in this codebase, the success branches here
 * call `res.json(response)` on the *whole* axios response object (not
 * `response.data`), so the expected response body is the full
 * `upstreamOk(...)` shape, not just the payload.
 */

jest.mock('axios')
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    CONTENT_API_BASE: 'https://content.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { userTokenApi } from './token'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(userTokenApi)

beforeEach(() => {
  mockAxios.get.mockReset()
})

/**
 * @description Verifies GET / resolves a token via the email query param,
 * forwarding the whole upstream axios response (not just its data) as the
 * response body, and requests the expected upstream URL.
 */
describe('GET / with email', () => {
  it('should return the upstream response for a valid email', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ token: 'tok-1' }))
    const response = await agent().get('/').query({ email: 'a@test.com' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual(upstreamOk({ token: 'tok-1' }))
  })

  it('should request the upstream access-token endpoint with the email in the query string', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ token: 'tok-1' }))
    await agent().get('/').query({ email: 'a@test.com' })
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://content.test/access-token?email=a@test.com',
      expect.anything()
    )
  })

  it('should prefer the email branch when email, code and redirectUrl are all present', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ token: 'tok-1' }))
    await agent().get('/').query({ email: 'a@test.com', code: 'c1', redirectUrl: 'https://cb.test' })
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://content.test/access-token?email=a@test.com',
      expect.anything()
    )
  })

  it('should forward the upstream status and body when the lookup fails', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'unknown email' }))
    const response = await agent().get('/').query({ email: 'missing@test.com' })
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'unknown email' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/').query({ email: 'a@test.com' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies GET / resolves a token via the code + redirectUrl
 * query params when no email is given, forwarding the whole upstream axios
 * response as the response body, and requests the expected upstream URL.
 */
describe('GET / with code and redirectUrl', () => {
  it('should return the upstream response for a valid code and redirectUrl', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ token: 'tok-2' }))
    const response = await agent().get('/').query({ code: 'c1', redirectUrl: 'https://cb.test' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual(upstreamOk({ token: 'tok-2' }))
  })

  it('should request the upstream user-access-token endpoint with code and redirecturi in the query string', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ token: 'tok-2' }))
    await agent().get('/').query({ code: 'c1', redirectUrl: 'https://cb.test' })
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://content.test/user-access-token?code=c1&redirecturi=https://cb.test',
      expect.anything()
    )
  })

  it('should forward the upstream status and body when the exchange fails', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(401, { error: 'invalid code' }))
    const response = await agent().get('/').query({ code: 'bad', redirectUrl: 'https://cb.test' })
    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'invalid code' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/').query({ code: 'c1', redirectUrl: 'https://cb.test' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies GET / rejects requests that supply neither an email
 * nor a complete code+redirectUrl pair, without calling the upstream at all.
 */
describe('GET / with missing query parameters', () => {
  it('should reject a request with no query parameters at all', async () => {
    const response = await agent().get('/')
    expect(response.status).toBe(400)
    expect(response.text).toBe(
      'You must pass (email) || (code && redirectUrl) in query parameter, to retrieve the code.'
    )
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('should reject a request with only code and no redirectUrl', async () => {
    const response = await agent().get('/').query({ code: 'c1' })
    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('should reject a request with only redirectUrl and no code', async () => {
    const response = await agent().get('/').query({ redirectUrl: 'https://cb.test' })
    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })
})
