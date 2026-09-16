/**
 * PHASE 1 — user/preference.ts.
 *
 * Two routes:
 *  - GET '/': userId comes from req.query.wid, falling back to
 *    extractUserIdFromRequest(req). Guarded by a rootOrg header check with a
 *    `return` after the 400 — safe. The actual upstream call is delegated to
 *    the exported getUserPreference() helper, which has its OWN try/catch
 *    that swallows any axios failure and resolves to `{}` — so a rejected
 *    axios.get() never reaches the route handler's catch block; the route
 *    always responds 200 in that case. The route's own catch is only
 *    reachable if something outside getUserPreference() throws
 *    synchronously (e.g. extractUserIdFromRequest), which is exercised below
 *    by making the mocked extractUserIdFromRequest throw.
 *  - PUT '/': userId always comes from extractUserIdFromRequest(req). Same
 *    rootOrg guard with a `return` after the 400. Direct axios.put() inside
 *    try/catch, with the standard `(err && err.response && ...)` guarded
 *    fallback in the catch — safe to exercise live for both success and
 *    failure (including a network error with no `.response`).
 *
 * No Pattern A/B/C/D/E/F issues found on inspection.
 */

jest.mock('axios')
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    PREFERENCE_API_BASE: 'https://preference.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { protectedPreference } from './preference'
import { extractUserIdFromRequest } from '../../utils/requestExtract'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockExtractUserIdFromRequest = extractUserIdFromRequest as jest.Mock
const agent = () => mountRouter(protectedPreference)
const withRootOrg = (req: ReturnType<typeof agent>) => req.set('rootOrg', 'r1')

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.put.mockReset()
  mockExtractUserIdFromRequest.mockReset()
  mockExtractUserIdFromRequest.mockImplementation(() => 'user-1')
})

/**
 * @description Verifies the GET / route rejects requests missing the
 * rootOrg header, returns preference data for the session user or an
 * explicit wid, and — because getUserPreference() swallows axios failures —
 * always returns 200 with an empty object on an upstream or network error,
 * falling back to the route-level 500 only when userId extraction itself
 * throws synchronously.
 */
describe('GET /', () => {
  it('should reject a request missing the rootOrg header', async () => {
    const response = await agent().get('/')
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should return the upstream preference data for the caller (userId from the session)', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ language: 'en' }))
    const response = await withRootOrg(agent().get('/'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ language: 'en' })
  })

  it('should use an explicit wid query param instead of the session user', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ language: 'fr' }))
    const response = await withRootOrg(agent().get('/')).query({ wid: 'u2' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ language: 'fr' })
    expect(mockExtractUserIdFromRequest).not.toHaveBeenCalled()
  })

  it('should return an empty object when the upstream call fails (swallowed by getUserPreference)', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await withRootOrg(agent().get('/'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({})
  })

  it('should return an empty object on a network failure too', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({})
  })

  it('should fall back to the route-level 500 catch when userId extraction throws synchronously', async () => {
    mockExtractUserIdFromRequest.mockImplementation(() => {
      throw new Error('boom')
    })
    const response = await withRootOrg(agent().get('/'))
    expect(response.status).toBe(500)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })
})

/**
 * @description Verifies the PUT / route rejects requests missing the
 * rootOrg header, and otherwise updates the preference and forwards the
 * upstream response on success, failure, and network-error cases.
 */
describe('PUT /', () => {
  it('should reject a request missing the rootOrg header', async () => {
    const response = await agent().put('/').send({ language: 'en' })
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should update the preference and forward the upstream status and body', async () => {
    mockAxios.put.mockResolvedValue(upstreamOk({ language: 'en' }, 201))
    const response = await withRootOrg(agent().put('/')).send({ language: 'en' })
    expect(response.status).toBe(201)
    expect(response.body).toEqual({ language: 'en' })
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxios.put.mockRejectedValue(upstreamError(422, { error: 'invalid preference' }))
    const response = await withRootOrg(agent().put('/')).send({ language: 'xx' })
    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'invalid preference' })
  })

  it('should return 500 with the raw error body on a network failure', async () => {
    mockAxios.put.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().put('/')).send({ language: 'en' })
    expect(response.status).toBe(500)
  })
})
