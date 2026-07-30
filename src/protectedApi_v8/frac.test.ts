/**
 * frac.ts — six routes, all using the axios.get/axios.post form.
 *
 * Route registration order note: '/getAllNodes/:type' (2 segments, GET),
 * '/getNodeById/:id/:type' (3 segments, GET) and the catch-all '/:type/:key'
 * (2 segments, GET) are all GET routes. '/getAllNodes/:type' is registered
 * before the catch-all, so any 2-segment path starting with 'getAllNodes'
 * is claimed by the dedicated route first — no shadowing in practice, since
 * the only path that could collide (e.g. '/getAllNodes/dictionary') is
 * exactly what the dedicated route is meant to handle.
 *
 * SKIPPED LIVE TEST — see the 'unrecognised :type' block below for the
 * double-send hazard in GET /getAllNodes/:type's default switch branch
 * (frac.ts lines 42-45): res.status(400).send(...) has no `return`/`break`
 * out of the whole handler, so execution falls through into the same
 * axios.get(...).then(res.status(response.status).send(...)) call that the
 * valid branches use, sending a second response on top of the first. This
 * matches the documented Pattern A (double-send) hazard and is reported
 * below rather than reproduced live.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    FRAC_API_BASE: 'https://frac.test',
    TIMEOUT: '10000',
  },
}))

import axios from 'axios'
import { fracApi } from './frac'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(fracApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

describe('GET /getAllNodes/:type', () => {
  it.each([
    ['dictionary', 'https://frac.test/fracapis/frac/getAllNodes?type=COMPETENCY&status=VERIFIED'],
    ['competencyarea', 'https://frac.test/fracapis/frac/getAllNodes?type=COMPETENCYAREA'],
    ['role', 'https://frac.test/fracapis/frac/getAllNodes?type=ROLE&status=VERIFIED'],
    ['activity', 'https://frac.test/fracapis/frac/getAllNodes?type=ACTIVITY&status=VERIFIED'],
  ])('forwards the upstream body on success for type=%s', async (type, expectedUrl) => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 1 }]))

    const response = await agent().get(`/getAllNodes/${type}`)

    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 1 }])
    expect(mockAxios.get).toHaveBeenCalledWith(expectedUrl, expect.anything())
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent().get('/getAllNodes/dictionary')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent().get('/getAllNodes/role')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })

  // NOT tested live: an unrecognised :type (e.g. '/getAllNodes/bogus') hits
  // the default branch at frac.ts:42-45, which sends a 400 response with no
  // return/break out of the handler. Execution then falls through to the
  // axios.get(...) call below the switch with apiEndPoint === '', which
  // sends a SECOND response via res.status(response.status).send(...) (or,
  // on rejection, a second response from the catch block). This is the
  // double-send hazard (Pattern A) called out in the test-writing brief —
  // reproducing it live risks a real 'ERR_HTTP_HEADERS_SENT' throw escaping
  // an async handler uncaught. Reported to the requester for
  // docs/PROD-VERIFICATION.md instead of exercised here.
})

describe('POST /addDataNode', () => {
  it('forwards the upstream body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ id: 'node-1' }))

    const response = await agent().post('/addDataNode').send({ name: 'Node' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'node-1' })
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://frac.test/fracapis/frac/addDataNode',
      { name: 'Node' },
      expect.anything()
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(400, { error: 'bad request' }))

    const response = await agent().post('/addDataNode').send({ name: 'Node' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad request' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/addDataNode').send({ name: 'Node' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /addDataNodeBulk', () => {
  it('forwards the upstream body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ inserted: 3 }))

    const response = await agent()
      .post('/addDataNodeBulk')
      .send([{ name: 'A' }, { name: 'B' }])

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ inserted: 3 })
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://frac.test/fracapis/frac/addDataNodeBulk',
      [{ name: 'A' }, { name: 'B' }],
      expect.anything()
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(422, { error: 'invalid batch' }))

    const response = await agent().post('/addDataNodeBulk').send([{ name: 'A' }])

    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'invalid batch' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/addDataNodeBulk').send([{ name: 'A' }])

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /searchNodes', () => {
  it('forwards the upstream body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ results: [] }))

    const response = await agent().post('/searchNodes').send({ searches: [] })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ results: [] })
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://frac.test/fracapis/frac/searchNodes',
      { searches: [] },
      expect.anything()
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(500, { error: 'server error' }))

    const response = await agent().post('/searchNodes').send({ searches: [] })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'server error' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/searchNodes').send({ searches: [] })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /getNodeById/:id/:type', () => {
  it('forwards the upstream body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'abc123' }))

    const response = await agent().get('/getNodeById/abc123/ROLE')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'abc123' })
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://frac.test/fracapis/frac/getNodeById?id=abc123&type=ROLE&isDetail=true',
      expect.anything()
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent().get('/getNodeById/missing/ROLE')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent().get('/getNodeById/abc123/ROLE')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /:type/:key', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const response = await agent()
      .get('/role/engineer')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('returns 400 when Authorization header is missing', async () => {
    const response = await agent().get('/role/engineer').set('rootOrg', 'org-1')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('searches and forwards the upstream body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ results: [{ id: 1 }] }))

    const response = await agent()
      .get('/role/engineer')
      .set('rootOrg', 'org-1')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ results: [{ id: 1 }] })
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://frac.test/fracapis/frac/searchNodes',
      {
        childCount: true,
        childNodes: true,
        searches: [
          { field: 'name', keyword: 'engineer', type: 'role' },
          { field: 'status', keyword: 'VERIFIED', type: 'role' },
        ],
      },
      expect.anything()
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent()
      .get('/role/engineer')
      .set('rootOrg', 'org-1')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent()
      .get('/role/engineer')
      .set('rootOrg', 'org-1')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
