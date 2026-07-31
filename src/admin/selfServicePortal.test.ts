/**
 * selfServicePortal.ts — four GET routes, all proxying to
 * CONSTANTS.SELF_SERVICE_PORTAL_API_BASE via the callable `axios({...})`
 * form (not axios.get()). Every route has the same shape: try { axios call,
 * forward/derive a response } catch { logInfo + always res.status(403).send
 * (the shared `errorMessage` unauthorized HTML page) }, regardless of what
 * the underlying error actually was (upstream 4xx/5xx or a bare transport
 * failure) — there is no err.response branching here, so a single
 * networkError()/upstreamError() case per route is representative of both.
 *
 * No request validation exists anywhere in this file (no header/body checks,
 * no auth gate beyond whatever upstream enforces), so there are no
 * validation-branch tests beyond the success/failure pair per route.
 *
 * GET /v1/public/getInitialFormDetails is the one route with a different
 * success shape: it does res.redirect(response.data.redirectUrl) instead of
 * sending a body, so its success test asserts on the 302 + Location header.
 *
 * All four routes wrap their axios call in try/catch with no fall-through
 * after either res.send/res.redirect or the catch's res.status(403).send —
 * no double-send, no zero-response branch, no unguarded error.response
 * access, so every case here is safe to run live.
 */

jest.mock('axios')
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    SELF_SERVICE_PORTAL_API_BASE: 'https://ssp.test',
  },
}))
jest.mock('../utils/logger', () => ({ logInfo: jest.fn() }))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { adminApiV8 } from './selfServicePortal'

const mockAxios = axios as unknown as jest.Mock
const agent = () => mountRouter(adminApiV8)

beforeEach(() => {
  mockAxios.mockReset()
})

/**
 * @description Verifies the GET /v1/user/getLearnerDetails route forwards
 * the upstream learner details on success and always returns the 403
 * unauthorized page on any upstream or transport failure.
 */
describe('GET /v1/user/getLearnerDetails', () => {
  it('should return the upstream learner details on success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ id: 'learner-1', name: 'Jane' }))

    const response = await agent().get('/v1/user/getLearnerDetails').query({ userId: 'u1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'learner-1', name: 'Jane' })
  })

  it('should return 403 with the unauthorized HTML page on an upstream error', async () => {
    mockAxios.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))

    const response = await agent().get('/v1/user/getLearnerDetails')

    expect(response.status).toBe(403)
    expect(response.text).toContain('Unauthorized Access')
  })

  it('should return 403 with the unauthorized HTML page on a bare transport failure', async () => {
    mockAxios.mockRejectedValue(networkError())

    const response = await agent().get('/v1/user/getLearnerDetails')

    expect(response.status).toBe(403)
    expect(response.text).toContain('Unauthorized Access')
  })
})

/**
 * @description Verifies the GET /v1/user/getLeanerCompletedResourceDetails
 * route returns the upstream resource details on success and falls back to
 * the 403 unauthorized page on failure.
 */
describe('GET /v1/user/getLeanerCompletedResourceDetails', () => {
  it('should return the upstream resource details on success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ resources: [] }))

    const response = await agent().get('/v1/user/getLeanerCompletedResourceDetails')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ resources: [] })
  })

  it('should return 403 with the unauthorized HTML page on failure', async () => {
    mockAxios.mockRejectedValue(networkError())

    const response = await agent().get('/v1/user/getLeanerCompletedResourceDetails')

    expect(response.status).toBe(403)
    expect(response.text).toContain('Unauthorized Access')
  })
})

/**
 * @description Verifies the GET /v1/public/getInitialFormDetails route
 * redirects to the upstream-provided redirectUrl on success and returns the
 * 403 unauthorized page on failure.
 */
describe('GET /v1/public/getInitialFormDetails', () => {
  it('should redirect to the upstream-provided redirectUrl on success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ redirectUrl: 'https://example.com/next' }))

    const response = await agent().get('/v1/public/getInitialFormDetails').query({ code: 'abc' })

    expect(response.status).toBe(302)
    expect(response.header.location).toBe('https://example.com/next')
  })

  it('should return 403 with the unauthorized HTML page on failure', async () => {
    mockAxios.mockRejectedValue(networkError())

    const response = await agent().get('/v1/public/getInitialFormDetails').query({ code: 'abc' })

    expect(response.status).toBe(403)
    expect(response.text).toContain('Unauthorized Access')
  })
})

/**
 * @description Verifies the GET /v1/public/dashboard route sends the
 * templateData from the upstream response on success and returns the 403
 * unauthorized page on failure.
 */
describe('GET /v1/public/dashboard', () => {
  it('should send the templateData from the upstream response on success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ templateData: { title: 'Dashboard' } }))

    const response = await agent().get('/v1/public/dashboard')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ title: 'Dashboard' })
  })

  it('should return 403 with the unauthorized HTML page on failure', async () => {
    mockAxios.mockRejectedValue(networkError())

    const response = await agent().get('/v1/public/dashboard')

    expect(response.status).toBe(403)
    expect(response.text).toContain('Unauthorized Access')
  })
})
