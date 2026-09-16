/**
 * authSearch.ts — a single catch-all route (`ALL *`) that forwards every
 * request verbatim to the upstream search API via the callable `axios({...})`
 * form (not `axios.get`/`.post`). Core logic under test:
 *   - the forwarded URL is `${CONSTANTS.SEARCH_API_BASE}${req.url}`
 *   - the forwarded method mirrors `req.method`
 *   - `sourceFields: DEFAULT_META` is added to the body, then stripped again
 *     unless the request URL contains `/v6/`
 *   - success forwards the upstream status/body; failure forwards
 *     `error.response.status`/`error.response.data`
 *
 * KNOWN BUG (not reproduced live, reported for docs/PROD-VERIFICATION.md):
 * the `.catch` handler does `error.response.status` / `error.response.data`
 * with NO guard for `error.response` being undefined. `mockAxios.networkError()`
 * (a rejection with no `.response`, simulating DNS/timeout/ECONNREFUSED) would
 * throw *inside* the `.catch` callback itself, producing an unhandled promise
 * rejection that Node treats as fatal — the exact "Pattern D" crash-the-process
 * bug documented in this campaign. Deliberately not exercised live here.
 */

jest.mock('../utils/env', () => ({
  CONSTANTS: { SEARCH_API_BASE: 'https://search-api.test' },
}))

import axios from 'axios'
import { upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { authSearch } from './authSearch'

jest.mock('axios')

const mockAxiosCallable = axios as unknown as jest.Mock

const agent = () => mountRouter(authSearch)

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

/**
 * @description Verifies the happy path: the handler calls the callable
 * `axios({...})` form (not `.get`/`.post`) with a URL built from
 * `CONSTANTS.SEARCH_API_BASE` + `req.url`, forwards `req.method`, and relays
 * the upstream status/body back to the client unchanged.
 */
describe('ALL * — forwarding a successful upstream response', () => {
  it('should return the upstream status and body for a GET request', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: 'ok' }, 200))
    const response = await agent().get('/v5/search')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ result: 'ok' })
  })

  it('should call axios with a URL built from SEARCH_API_BASE and req.url', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: 'ok' }, 200))
    await agent().get('/v5/search')
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://search-api.test/v5/search', method: 'GET' })
    )
  })

  it('should forward the request method for a POST request and return the upstream status/body', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ created: true }, 201))
    const response = await agent().post('/v5/search').send({ query: 'x' })
    expect(response.status).toBe(201)
    expect(response.body).toEqual({ created: true })
    expect(mockAxiosCallable).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST' }))
  })

  it('should forward the request method for a PUT request', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ updated: true }, 200))
    const response = await agent().put('/v5/search/1').send({ query: 'y' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ updated: true })
    expect(mockAxiosCallable).toHaveBeenCalledWith(expect.objectContaining({ method: 'PUT' }))
  })

  it('should forward the request method for a DELETE request', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ deleted: true }, 200))
    const response = await agent().delete('/v5/search/1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ deleted: true })
    expect(mockAxiosCallable).toHaveBeenCalledWith(expect.objectContaining({ method: 'DELETE' }))
  })
})

/**
 * @description Verifies the `sourceFields` branch: the body always starts
 * with `sourceFields: DEFAULT_META` merged in, but it is deleted again unless
 * `req.url` contains `/v6/`. Since this only affects what is forwarded
 * upstream (not the HTTP response), these tests assert on the axios call
 * body directly — the call shape is the contract being verified here.
 */
describe('sourceFields injection based on the /v6/ URL segment', () => {
  it('should include sourceFields in the forwarded body when the URL contains /v6/', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({}, 200))
    await agent().post('/v6/search').send({ query: 'x' })
    const callArg = mockAxiosCallable.mock.calls[0][0]
    expect(callArg.data).toHaveProperty('sourceFields')
    expect(Array.isArray(callArg.data.sourceFields)).toBe(true)
    expect(callArg.data.query).toBe('x')
  })

  it('should omit sourceFields from the forwarded body when the URL does not contain /v6/', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({}, 200))
    await agent().post('/v5/search').send({ query: 'x' })
    const callArg = mockAxiosCallable.mock.calls[0][0]
    expect(callArg.data).not.toHaveProperty('sourceFields')
    expect(callArg.data.query).toBe('x')
  })

  it('should omit sourceFields when there is no request body at all', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({}, 200))
    await agent().get('/v5/search')
    const callArg = mockAxiosCallable.mock.calls[0][0]
    expect(callArg.data).not.toHaveProperty('sourceFields')
  })
})

/**
 * @description Verifies the failure path where the upstream rejection DOES
 * carry a `.response` (the shape `upstreamError()` produces) — the handler
 * forwards `error.response.status`/`error.response.data` as-is. A rejection
 * WITHOUT `.response` (`networkError()`) is deliberately not exercised here;
 * see the file-level comment above for why.
 */
describe('ALL * — forwarding an upstream error response', () => {
  it('should return the upstream error status and body when axios rejects with a response', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await agent().get('/v5/search')
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('should return the upstream error status and body for a 404 upstream error', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/v6/search/missing')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })
})
