/**
 * PHASE — user/accessControl.ts.
 *
 * Two routes plus one exported helper (checkContentAccess), both routes using
 * axios.get (never the callable axios({...}) form), both wrapped in
 * try/catch with the `(err && err.response && ...)` guarded fallback shape.
 * No Pattern A/B/C/D/E/F issues found on inspection:
 *  - POST / builds contentIds/uuid then calls checkContentAccess, which has
 *    its OWN internal try/catch and always resolves to `{}` on any axios
 *    failure (upstream or malformed body) — it never rejects. The single
 *    res.json(response) is the only send in the try; the outer catch (for a
 *    synchronous throw building contentIds/uuid, e.g. contentIds.join on a
 *    non-array) is the only other send, and it's mutually exclusive with the
 *    try's send.
 *  - GET / guards on response.data.result with an if/else that sends exactly
 *    one response (200 with the result, or 404 "No Data found"), and the
 *    catch is the only other send. No fallthrough.
 * All safe to exercise live for both success and failure paths.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    ACCESS_CONTROL_API_BASE: 'https://access-control.test',
  },
}))

import axios from 'axios'
import { accessControlApi } from './accessControl'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockExtractUserId = extractUserIdFromRequest as jest.Mock
const agent = () => mountRouter(accessControlApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockExtractUserId.mockReset()
  mockExtractUserId.mockReturnValue('user-1')
})

/**
 * @description Verifies the POST / route returns per-content access-check
 * results, falls back to an empty object on internal checkContentAccess
 * failures, and surfaces synchronous/user-id-extraction errors correctly.
 */
describe('POST /', () => {
  it('should return the access-check results for the given content ids', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({ result: { response: { c1: { hasAccess: true }, c2: { hasAccess: false } } } })
    )
    const response = await agent().post('/').send({ contentIds: ['c1', 'c2'] })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ c1: { hasAccess: true }, c2: { hasAccess: false } })
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/accesscontrol/user/user-1/content?contentIds=c1,c2'),
      expect.anything()
    )
  })

  it('should resolve to an empty object when the upstream call fails (internal catch in checkContentAccess)', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().post('/').send({ contentIds: ['c1'] })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({})
  })

  it('should resolve to an empty object when the upstream body has no result.response (internal catch in checkContentAccess)', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({}))
    const response = await agent().post('/').send({ contentIds: ['c1'] })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({})
  })

  it('should return 500 with the generic body when contentIds is missing (contentIds.join throws synchronously)', async () => {
    const response = await agent().post('/').send({})
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('should forward the upstream status and body when extracting the user id throws', async () => {
    mockExtractUserId.mockImplementation(() => {
      throw upstreamError(400, { error: 'bad user' })
    })
    const response = await agent().post('/').send({ contentIds: ['c1'] })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad user' })
  })
})

/**
 * @description Verifies the GET / route returns the caller's access-control
 * data, returns 404 when the upstream body has no result, and forwards
 * upstream/network failures with the appropriate status and body.
 */
describe('GET /', () => {
  it('should return the access-control data for the caller', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ result: { role: 'admin' } }))
    const response = await agent().get('/').set('wid', 'user-1').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ role: 'admin' })
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/accesscontrol/user/user-1/?rootOrg=r1'),
      expect.anything()
    )
  })

  it('should return 404 "No Data found" when the upstream body has no result', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({}))
    const response = await agent().get('/').set('wid', 'user-1').set('rootOrg', 'r1')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'No Data found' })
  })

  it('should forward the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(403, { error: 'forbidden' }))
    const response = await agent().get('/').set('wid', 'user-1').set('rootOrg', 'r1')
    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'forbidden' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/').set('wid', 'user-1').set('rootOrg', 'r1')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
