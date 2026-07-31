/**
 * catalog.ts — two routes.
 *
 * GET / uses the `axios.get()` form: try { forward status+data } catch
 * { logError + forward upstream status/body, falling back to 500 + a
 * generic body when the failure carries no err.response }. This matches the
 * counter.test.ts exemplar shape exactly.
 *
 * POST /tags does NOT call axios directly — it calls the service-layer
 * getFilters()/getFilterUnitByType() (from ../service/catalog), which are
 * mocked here rather than axios. It validates the `rootorg` header first
 * (400 + return, no fall-through), then looks up a filter unit and either
 * sends its children or 400s with ERROR_NO_ORG_DATA. Its catch block mirrors
 * GET /'s error-forwarding shape.
 *
 * NOT tested live: sending `rootorg` as a repeated header (which Node
 * surfaces as a string[] rather than a string). See the comment above that
 * describes handler behaviour for full detail — it is a real bug, not
 * reproduced here per the safety rule (Pattern B: zero response / hang).
 *
 * extractUserIdFromRequest and extractUserToken are mocked wholesale: their
 * real implementations fall back to req.session.userId / req.kauth, and
 * mountRouter() installs neither session nor kauth by default.
 * extractUserIdFromRequest's real implementation would throw on
 * req.session being undefined — inside POST /tags's try block here, so not
 * a hang/crash hazard, but it would make every POST /tags case (including
 * the rootorg-missing case) collapse into the catch block, which isn't the
 * behaviour under test. Matches the sibling attendent-content.test.ts /
 * cohorts.test.ts approach.
 */

jest.mock('axios')
jest.mock('../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    KONG_API_BASE: 'https://kong.test',
  },
}))
jest.mock('../utils/logger', () => ({ logError: jest.fn() }))
jest.mock('../service/catalog', () => ({
  getFilters: jest.fn(),
  getFilterUnitByType: jest.fn(),
}))

import axios from 'axios'
import { getFilters, getFilterUnitByType } from '../service/catalog'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { catalogApi } from './catalog'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockGetFilters = getFilters as jest.Mock
const mockGetFilterUnitByType = getFilterUnitByType as jest.Mock
const agent = () => mountRouter(catalogApi)

beforeEach(() => {
  mockGetFilters.mockReset()
  mockGetFilterUnitByType.mockReset()
})

/**
 * @description Verifies that GET / forwards the upstream catalog response
 * and status on success, calls the configured catalog endpoint, and maps
 * upstream/transport failures to the appropriate error status and body.
 */
describe('GET /', () => {
  it('should forward the upstream status and body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ terms: [] }))

    const response = await agent().get('/')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ terms: [] })
  })

  it('should call the configured catalog endpoint', async () => {
    // The outgoing URL IS the contract here — this handler exists to proxy.
    mockAxios.get.mockResolvedValue(upstreamOk({}))

    await agent().get('/')

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://kong.test/v1/catalog/',
      expect.anything()
    )
  })

  it('should forward an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(503, { error: 'unavailable' }))

    const response = await agent().get('/')

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'unavailable' })
  })

  it('should fall back to 500 when the failure carries no upstream response', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent().get('/')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies that POST /tags requires the rootorg header, looks
 * up the requested filter unit and returns its children on success, 400s
 * when no matching filter unit is found, and maps upstream/transport
 * failures from getFilters to the appropriate error status.
 */
describe('POST /tags', () => {
  it('should reject a request with no rootorg header', async () => {
    const response = await agent().post('/tags').send({ tags: 'x', type: 'course' })

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should return the matched filter unit children on success', async () => {
    const filterContent = { type: 'course', displayName: 'Course', count: 1, children: [] }
    mockGetFilters.mockResolvedValue([filterContent])
    mockGetFilterUnitByType.mockReturnValue({
      type: 'course',
      displayName: 'Course',
      count: 1,
      children: [{ type: 'child', displayName: 'Child', count: 0 }],
    })

    const response = await agent()
      .post('/tags')
      .set('rootorg', 'org1')
      .send({ tags: 'course', type: 'course' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ type: 'child', displayName: 'Child', count: 0 }])
  })

  it('should return 400 with ERROR_NO_ORG_DATA when no matching filter unit is found', async () => {
    mockGetFilters.mockResolvedValue([])
    mockGetFilterUnitByType.mockReturnValue(null)

    const response = await agent()
      .post('/tags')
      .set('rootorg', 'org1')
      .send({ tags: 'course', type: 'course' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'ERROR_NO_ORG_DATA' })
  })

  it('should forward the upstream error status and body when getFilters rejects', async () => {
    mockGetFilters.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))

    const response = await agent()
      .post('/tags')
      .set('rootorg', 'org1')
      .send({ tags: 'course', type: 'course' })

    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('should fall back to 500 with a generic message on a bare transport failure', async () => {
    mockGetFilters.mockRejectedValue(networkError())

    const response = await agent()
      .post('/tags')
      .set('rootorg', 'org1')
      .send({ tags: 'course', type: 'course' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
