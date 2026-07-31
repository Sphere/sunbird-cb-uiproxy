/**
 * infyradio.ts — one route, GET /, using the `axios.request({...})` form
 * (not `axios.get`/`axios.post`, and not the callable `axios({...})` form).
 *
 * try { build an ES nested-term query body from req.query.type (remapping
 * 'Podcasts' -> 'Archives'); POST it via axios.request(); if
 * response.data.hits.hits exists, map each hit to its _source (or {} when
 * _source is falsy); res.json(data) } catch (err) { forward
 * err.response.status/data when present, else 500 + a generic body }.
 *
 * The catch block guards `err && err.response && ...` before touching
 * `.status`/`.data`, so there is no Pattern-D crash risk in the failure path
 * — both upstreamError() and networkError() are safe to exercise live.
 * try/catch wraps the entire handler body, so there is no Pattern-C
 * (unhandled rejection) risk either. Every branch ends in exactly one
 * res.json/res.status(...).send(...) call, so no double-send / hang risk.
 */

jest.mock('axios')
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    ES_BASE: 'https://es.test',
    ES_PASSWORD: 'es-pass',
    ES_USERNAME: 'es-user',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { infyRadioApi } from './infyradio'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(infyRadioApi)

beforeEach(() => {
  mockAxios.request.mockReset()
})

/**
 * @description Verifies that GET / maps upstream ES hits to their _source
 * documents on success, falls back to {} for a hit with no _source, returns
 * an empty array when the upstream response carries no hits, remaps a
 * 'Podcasts' type query param to 'Archives' before querying upstream, and
 * maps upstream/transport failures to the appropriate error status and body.
 */
describe('GET /', () => {
  it('should return the mapped _source documents on success', async () => {
    mockAxios.request.mockResolvedValue(
      upstreamOk({
        hits: {
          hits: [
            { _source: { identifier: 'do_1', name: 'Track 1' } },
            { _source: { identifier: 'do_2', name: 'Track 2' } },
          ],
        },
      })
    )

    const response = await agent().get('/').query({ type: 'Music' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      { identifier: 'do_1', name: 'Track 1' },
      { identifier: 'do_2', name: 'Track 2' },
    ])
  })

  it('should fall back to {} for a hit with no _source', async () => {
    mockAxios.request.mockResolvedValue(
      upstreamOk({
        hits: {
          hits: [{ _source: null }],
        },
      })
    )

    const response = await agent().get('/').query({ type: 'Music' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual([{}])
  })

  it('should return an empty array when the upstream response has no hits', async () => {
    mockAxios.request.mockResolvedValue(upstreamOk({ hits: {} }))

    const response = await agent().get('/').query({ type: 'Music' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it('should return an empty array when the upstream response has no data', async () => {
    mockAxios.request.mockResolvedValue(upstreamOk(undefined))

    const response = await agent().get('/').query({ type: 'Music' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it('should remap a Podcasts type to Archives when querying upstream', async () => {
    mockAxios.request.mockResolvedValue(upstreamOk({ hits: { hits: [] } }))

    await agent().get('/').query({ type: 'Podcasts' })

    expect(mockAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { username: 'es-user', password: 'es-pass' },
        method: 'POST',
        url: 'https://es.test/lexcontentindex/resource/_search',
        data: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              must: [
                expect.objectContaining({
                  nested: expect.objectContaining({
                    path: 'tags',
                    query: {
                      term: { 'tags.value.keyword': { value: 'Archives' } },
                    },
                  }),
                }),
              ],
            }),
          }),
        }),
      })
    )
  })

  it('should pass a non-Podcasts type through unchanged when querying upstream', async () => {
    mockAxios.request.mockResolvedValue(upstreamOk({ hits: { hits: [] } }))

    await agent().get('/').query({ type: 'Music' })

    expect(mockAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              must: [
                expect.objectContaining({
                  nested: expect.objectContaining({
                    query: {
                      term: { 'tags.value.keyword': { value: 'Music' } },
                    },
                  }),
                }),
              ],
            }),
          }),
        }),
      })
    )
  })

  it('should forward an upstream error status and body', async () => {
    mockAxios.request.mockRejectedValue(upstreamError(503, { error: 'es unavailable' }))

    const response = await agent().get('/').query({ type: 'Music' })

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'es unavailable' })
  })

  it('should fall back to 500 with a generic body on a bare transport failure', async () => {
    mockAxios.request.mockRejectedValue(networkError())

    const response = await agent().get('/').query({ type: 'Music' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
