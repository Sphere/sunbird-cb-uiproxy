/**
 * home.ts — five routes: GET /latestCourses (delegates to searchV5()), POST
 * /searchV6 (raw axios.post + processContent mapping), GET /catalog
 * (delegates to getFilters()), POST /:contentId (delegates to
 * getContentDetails()), GET /searchAutoComplete (raw axios.request()).
 *
 * searchV5, getContentDetails and getFilters are imported as plain function
 * calls (not via axios directly), so their modules are mocked outright
 * rather than mocking axios underneath them.
 *
 * GET /searchAutoComplete reads `req.query.q` into a local `query` and
 * immediately does `query.length` with no guard. That IS still inside the
 * route's try/catch (synchronous statement in the try block, executed before
 * any await), so a missing `q` throws a TypeError that the catch handles and
 * turns into a normal 500 response — not a hang, not a process crash. Safe
 * to test live; see the test below asserting exactly that.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    ES_BASE: 'https://es.test',
    ES_PASSWORD: 'es-pass',
    ES_USERNAME: 'es-user',
    SEARCH_API_BASE: 'https://search.test',
  },
}))
jest.mock('../protectedApi_v8/content', () => ({
  getContentDetails: jest.fn(),
  searchV5: jest.fn(),
}))
jest.mock('../service/catalog', () => ({
  getFilters: jest.fn(),
}))

import axios from 'axios'
import { getContentDetails, searchV5 } from '../protectedApi_v8/content'
import { getFilters } from '../service/catalog'
import { mountRouter } from '../test-support/mountRouter'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { ERROR } from '../utils/message'
import { homePage } from './home'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockRequest = axios.request as jest.Mock
const mockSearchV5 = searchV5 as jest.Mock
const mockGetContentDetails = getContentDetails as jest.Mock
const mockGetFilters = getFilters as jest.Mock

const ADMIN_ID = 'ec2687b9-7b86-4321-bbc7-8c9509b834ee'
const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

const agent = () => mountRouter(homePage)

beforeEach(() => {
  mockAxios.post.mockReset()
  mockRequest.mockReset()
  mockSearchV5.mockReset()
  mockGetContentDetails.mockReset()
  mockGetFilters.mockReset()
})

describe('GET /latestCourses', () => {
  it('returns the searchV5 result as-is on success', async () => {
    mockSearchV5.mockResolvedValue({ filters: [], result: [{ identifier: 'c1' }], totalHits: 1 })
    const response = await agent().get('/latestCourses').set('rootOrg', 'org1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ filters: [], result: [{ identifier: 'c1' }], totalHits: 1 })
  })

  it('forwards the rootOrg header and adminId uuid into the search request', async () => {
    mockSearchV5.mockResolvedValue({ result: [] })
    await agent().get('/latestCourses').set('rootOrg', 'org1')
    expect(mockSearchV5).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ rootOrg: 'org1', uuid: ADMIN_ID }),
      })
    )
  })

  it('forwards the upstream error status and body on failure', async () => {
    mockSearchV5.mockRejectedValue(upstreamError(502, { error: 'upstream down' }))
    const response = await agent().get('/latestCourses')
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'upstream down' })
  })

  it('falls back to 500 with the generic message on a network-level failure', async () => {
    mockSearchV5.mockRejectedValue(networkError())
    const response = await agent().get('/latestCourses')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: GENERAL_ERROR_MSG })
  })
})

describe('POST /searchV6', () => {
  it('maps each result content through processContent on success', async () => {
    mockAxios.post.mockResolvedValue(
      upstreamOk({
        filters: [],
        filtersUsed: [],
        notVisibleFilters: [],
        result: [{ identifier: 'c1' }],
        totalHits: 1,
      })
    )
    const response = await agent().post('/searchV6').set('rootOrg', 'org1').send({})
    expect(response.status).toBe(200)
    expect(response.body.result).toHaveLength(1)
    expect(response.body.result[0].identifier).toBe('c1')
    // processContent-derived fields prove the mapping actually ran.
    expect(response.body.result[0].children).toEqual([])
  })

  it('leaves a non-array result untouched', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ result: null }))
    const response = await agent().post('/searchV6').send({})
    expect(response.status).toBe(200)
    expect(response.body.result).toBeNull()
  })

  it('forwards the rootOrg header and adminId uuid into the request body', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ result: [] }))
    await agent().post('/searchV6').set('rootOrg', 'org1').send({})
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/v6/search'),
      expect.objectContaining({ rootOrg: 'org1', uuid: ADMIN_ID }),
      expect.anything()
    )
  })

  it('forwards the upstream error status and body on failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(400, { error: 'bad request' }))
    const response = await agent().post('/searchV6').send({})
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad request' })
  })

  it('falls back to 500 with the generic message on a network-level failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/searchV6').send({})
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: GENERAL_ERROR_MSG })
  })
})

describe('GET /catalog', () => {
  it('returns 400 with ERROR_NO_ORG_DATA when the rootorg header is missing', async () => {
    const response = await agent().get('/catalog')
    expect(response.status).toBe(400)
    expect(response.text).toBe(ERROR.ERROR_NO_ORG_DATA)
  })

  it('returns the catalog filters on success', async () => {
    mockGetFilters.mockResolvedValue([{ id: 'path-1' }])
    const response = await agent().get('/catalog').set('rootorg', 'org1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'path-1' }])
    expect(mockGetFilters).toHaveBeenCalledWith(ADMIN_ID, 'org1', 'catalogPaths')
  })

  it('forwards the upstream error status and body on failure', async () => {
    mockGetFilters.mockRejectedValue(upstreamError(503, { error: 'catalog down' }))
    const response = await agent().get('/catalog').set('rootorg', 'org1')
    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'catalog down' })
  })

  it('falls back to 500 with the generic message on a network-level failure', async () => {
    mockGetFilters.mockRejectedValue(networkError())
    const response = await agent().get('/catalog').set('rootorg', 'org1')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: GENERAL_ERROR_MSG })
  })
})

describe('POST /:contentId', () => {
  it('returns 400 with ERROR_NO_ORG_DATA when the org header is missing', async () => {
    const response = await agent().post('/content-1').set('rootOrg', 'org1').send({})
    expect(response.status).toBe(400)
    expect(response.text).toBe(ERROR.ERROR_NO_ORG_DATA)
  })

  it('returns 400 with ERROR_NO_ORG_DATA when the rootOrg header is missing', async () => {
    const response = await agent().post('/content-1').set('org', 'org1').send({})
    expect(response.status).toBe(400)
    expect(response.text).toBe(ERROR.ERROR_NO_ORG_DATA)
  })

  it('returns the content details on success, defaulting fetchOneLevel to false', async () => {
    mockGetContentDetails.mockResolvedValue({ identifier: 'content-1', name: 'Course 1' })
    const response = await agent()
      .post('/content-1')
      .set('org', 'org1')
      .set('rootOrg', 'rootOrg1')
      .query({ hierarchyType: 'detail' })
      .send({ additionalFields: ['field1'] })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ identifier: 'content-1', name: 'Course 1' })
    expect(mockGetContentDetails).toHaveBeenCalledWith(
      'content-1',
      'rootOrg1',
      'org1',
      ADMIN_ID,
      'detail',
      ['field1'],
      false
    )
  })

  it('passes fetchOneLevel through when provided', async () => {
    mockGetContentDetails.mockResolvedValue({ identifier: 'content-1' })
    await agent()
      .post('/content-1')
      .set('org', 'org1')
      .set('rootOrg', 'rootOrg1')
      .send({ fetchOneLevel: true })
    expect(mockGetContentDetails).toHaveBeenCalledWith(
      'content-1',
      'rootOrg1',
      'org1',
      ADMIN_ID,
      undefined,
      undefined,
      true
    )
  })

  it('forwards the upstream error status and body on failure', async () => {
    mockGetContentDetails.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().post('/content-1').set('org', 'org1').set('rootOrg', 'rootOrg1').send({})
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('falls back to 500 with the generic message on a network-level failure', async () => {
    mockGetContentDetails.mockRejectedValue(networkError())
    const response = await agent().post('/content-1').set('org', 'org1').set('rootOrg', 'rootOrg1').send({})
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: GENERAL_ERROR_MSG })
  })
})

describe('GET /searchAutoComplete', () => {
  it('returns the filtered, non-empty searchTerm hits on success', async () => {
    mockRequest.mockResolvedValue(
      upstreamOk({
        hits: {
          hits: [
            { _source: { searchTerm: 'react' } },
            { _source: { searchTerm: '' } },
          ],
        },
      })
    )
    const response = await agent()
      .get('/searchAutoComplete')
      .query({ l: 'en', q: 'rea' })
      .set('rootOrg', 'org1')
      .set('org', 'org1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ _source: { searchTerm: 'react' } }])
  })

  it('sends the ES auth credentials and composed URL', async () => {
    mockRequest.mockResolvedValue(upstreamOk({ hits: { hits: [] } }))
    await agent().get('/searchAutoComplete').query({ l: 'en', q: 'rea' })
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { password: 'es-pass', username: 'es-user' },
        method: 'POST',
        url: 'https://es.test/searchautocomplete_en/autocomplete/_search',
      })
    )
  })

  it('returns an empty array when the response has no hits', async () => {
    mockRequest.mockResolvedValue(upstreamOk({}))
    const response = await agent().get('/searchAutoComplete').query({ l: 'en', q: 'rea' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it('treats an empty q as a request for suggested terms only', async () => {
    mockRequest.mockResolvedValue(upstreamOk({ hits: { hits: [] } }))
    await agent().get('/searchAutoComplete').query({ l: 'en', q: '' })
    const sentBody = mockRequest.mock.calls[0][0].data
    expect(sentBody.query.bool.should).toBeUndefined()
    expect(sentBody.query.bool.filter).toContainEqual({ term: { isSuggested: true } })
  })

  it('forwards the upstream error status and body on failure', async () => {
    mockRequest.mockRejectedValue(upstreamError(429, { error: 'rate limited' }))
    const response = await agent().get('/searchAutoComplete').query({ l: 'en', q: 'rea' })
    expect(response.status).toBe(429)
    expect(response.body).toEqual({ error: 'rate limited' })
  })

  // `const query = req.query.q` is used as `query.length` with no guard, but
  // this happens synchronously inside the route's try block (before any
  // await), so a missing `q` produces a caught TypeError -> the normal 500
  // fallback below, not a hang or crash. Safe to exercise live.
  it('falls back to 500 when q is missing (synchronous TypeError caught by the try/catch)', async () => {
    const response = await agent().get('/searchAutoComplete').query({ l: 'en' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: GENERAL_ERROR_MSG })
  })
})
