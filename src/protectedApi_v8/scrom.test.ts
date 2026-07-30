/**
 * scrom.ts — three routes, two axios call shapes:
 *  - GET /get/:id and DELETE /remove/:id use the `.get()`/`.post()` form.
 *  - POST /add/:id makes TWO sequential calls: first the callable `axios({...})`
 *    form (checks whether the module was already passed), then — only when not
 *    already passed — `axios.post()` to actually record progress.
 *
 * extractUserIdFromRequest is mocked wholesale rather than exercised for real:
 * its fallback path reads req.session.userId, and mountRouter() does not
 * install session middleware by default, so the real implementation would
 * throw on req.session being undefined whenever the 'wid' header is absent.
 * That throw is caught by each route's own try/catch, so it isn't a live-test
 * safety hazard — it's just irrelevant to this file's behaviour, matching the
 * convention already used in cohorts.test.ts.
 *
 * Validation-branch note: in all three routes, `contentId` comes from a route
 * param (`:id`), which Express never matches as an empty string — so the
 * `if (!contentId)` branches are dead code, unreachable via real HTTP and not
 * exercised here. In POST /add/:id, `org`/`rootOrg` are defaulted with
 * `|| 'dopt'` / `|| 'igot'`, so they're always truthy and the
 * `if (!org || !rootOrg)` branch there is likewise unreachable — unlike the
 * GET and DELETE routes, where org/rootOrg come straight from headers with no
 * default and the missing-header 400 is reachable and tested below.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    AUTHORING_BACKEND: 'https://authoring.test',
    KB_TIMEOUT: '5000',
    TIMEOUT: '10000',
  },
}))

import axios from 'axios'
import { scromApi } from './scrom'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(scromApi)

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

describe('GET /get/:id', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ progress: 50 }))

    const response = await agent()
      .get('/get/content1')
      .set('org', 'o1')
      .set('rootOrg', 'r1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ progress: 50 })
  })

  it('requests the configured scrom fetch endpoint with contentId/userId params', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({}))

    await agent().get('/get/content1').set('org', 'o1').set('rootOrg', 'r1')

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://authoring.test/action/scrom/fetch',
      expect.objectContaining({
        headers: { org: 'o1', rootOrg: 'r1' },
        params: { contentId: 'content1', userId: 'user-1' },
      })
    )
  })

  it('rejects a request missing the org/rootOrg headers', async () => {
    const response = await agent().get('/get/content1')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('rejects a request missing only the org header', async () => {
    const response = await agent().get('/get/content1').set('rootOrg', 'r1')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent()
      .get('/get/content1')
      .set('org', 'o1')
      .set('rootOrg', 'r1')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent()
      .get('/get/content1')
      .set('org', 'o1')
      .set('rootOrg', 'r1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /add/:id', () => {
  it('records progress when the module was not already passed', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ data: [] }))
    mockAxios.post.mockResolvedValue(upstreamOk({ saved: true }))

    const response = await agent()
      .post('/add/content1')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
      .send({ score: 10 })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ saved: true })
  })

  it('sends the contentId/userId-augmented body to the configured add endpoint', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ data: [] }))
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    await agent()
      .post('/add/content1')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
      .send({ score: 10 })

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://authoring.test/action/scrom/add',
      expect.objectContaining({ score: 10, contentId: 'content1', userId: 'user-1' }),
      expect.objectContaining({ headers: { org: 'o1', rootOrg: 'r1' } })
    )
  })

  it('rejects with 400 when the module was already passed, without calling the add endpoint', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({ data: [{ cmi_core_lesson_status: 'passed' }] })
    )

    const response = await agent()
      .post('/add/content1')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
      .send({})

    expect(response.status).toBe(400)
    expect(response.text).toBe('Bad Request, already passed the module')
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('still records progress when the lesson status is present but not "passed"', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({ data: [{ cmi_core_lesson_status: 'incomplete' }] })
    )
    mockAxios.post.mockResolvedValue(upstreamOk({ saved: true }))

    const response = await agent()
      .post('/add/content1')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
      .send({})

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ saved: true })
  })

  it('forwards an upstream error status and body when the status-check call fails', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))

    const response = await agent()
      .post('/add/content1')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
      .send({})

    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('falls back to 500 on a transport failure of the status-check call', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent()
      .post('/add/content1')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
      .send({})

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })

  it('forwards an upstream error status and body when the add call itself fails', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ data: [] }))
    mockAxios.post.mockRejectedValue(upstreamError(409, { error: 'conflict' }))

    const response = await agent()
      .post('/add/content1')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
      .send({})

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })
})

describe('DELETE /remove/:id', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ deleted: true }))

    const response = await agent()
      .delete('/remove/content1')
      .set('org', 'o1')
      .set('rootOrg', 'r1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ deleted: true })
  })

  it('posts to the configured delete endpoint with contentId/userId params', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    await agent().delete('/remove/content1').set('org', 'o1').set('rootOrg', 'r1')

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://authoring.test/action/scrom/delete',
      {},
      expect.objectContaining({
        headers: { org: 'o1', rootOrg: 'r1' },
        params: { contentId: 'content1', userId: 'user-1' },
      })
    )
  })

  it('rejects a request missing the org/rootOrg headers', async () => {
    const response = await agent().delete('/remove/content1')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('rejects a request missing only the rootOrg header', async () => {
    const response = await agent().delete('/remove/content1').set('org', 'o1')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(403, { error: 'forbidden' }))

    const response = await agent()
      .delete('/remove/content1')
      .set('org', 'o1')
      .set('rootOrg', 'r1')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'forbidden' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent()
      .delete('/remove/content1')
      .set('org', 'o1')
      .set('rootOrg', 'r1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
