/**
 * PHASE 1 — user/rdbms.ts.
 *
 * All eleven routes follow the same shape: extractUserIdFromRequest (mocked)
 * or a bare contentId param, one awaited axios call inside a try/catch, and
 * a single response send on both the success and failure path
 * (res.send/res.json in try, res.status(...).send(...) in catch). No route
 * performs its own validation (no rootOrg/header checks like sibling files
 * in this directory), so there are no 4xx validation-branch tests to add —
 * only success and upstream-failure paths per route.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: { VIEWER_PLUGIN_RDBMS_API_BASE: 'https://rdbms.test' },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { rdbmsApi } from './rdbms'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(rdbmsApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

describe('GET /initializeDb/:contentId', () => {
  it('initializes the db and forwards the upstream data', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ initialized: true }))
    const response = await agent().get('/initializeDb/c1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ initialized: true })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await agent().get('/initializeDb/c1')
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/initializeDb/c1')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /conceptData/:contentId', () => {
  it('returns the concept data', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ concept: 'c1' }))
    const response = await agent().get('/conceptData/c1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ concept: 'c1' })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/conceptData/c1')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/conceptData/c1')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /expectedOutput/:contentId', () => {
  it('returns the expected output', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ output: 'ok' }))
    const response = await agent().get('/expectedOutput/c1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ output: 'ok' })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(403, { error: 'forbidden' }))
    const response = await agent().get('/expectedOutput/c1')
    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'forbidden' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/expectedOutput/c1')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /dbstructure/:contentId', () => {
  it('returns the table data', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ tables: [] }))
    const response = await agent().get('/dbstructure/c1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ tables: [] })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(400, { error: 'bad request' }))
    const response = await agent().get('/dbstructure/c1')
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad request' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/dbstructure/c1')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /tableRefresh/:contentId', () => {
  it('returns the table info', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ refreshed: true }))
    const response = await agent().get('/tableRefresh/c1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ refreshed: true })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(409, { error: 'conflict' }))
    const response = await agent().get('/tableRefresh/c1')
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/tableRefresh/c1')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /executeQuery', () => {
  it('executes the query and returns the result', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ rows: [] }))
    const response = await agent().post('/executeQuery').send({ query: 'select 1' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ rows: [] })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(422, { error: 'invalid query' }))
    const response = await agent().post('/executeQuery').send({ query: 'bad' })
    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'invalid query' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/executeQuery').send({ query: 'select 1' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /compareQuery', () => {
  it('compares the query and returns the result', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ match: true }))
    const response = await agent().post('/compareQuery').send({ query: 'select 1' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ match: true })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(422, { error: 'invalid query' }))
    const response = await agent().post('/compareQuery').send({ query: 'bad' })
    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'invalid query' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/compareQuery').send({ query: 'select 1' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /playground', () => {
  it('runs the playground query', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ result: [] }))
    const response = await agent().post('/playground').send({ query: 'select 1' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ result: [] })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(400, { error: 'bad request' }))
    const response = await agent().post('/playground').send({ query: 'bad' })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad request' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/playground').send({ query: 'select 1' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /compositeQuery/:type', () => {
  it('runs the composite query for the given type', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ ok: true }))
    const response = await agent().post('/compositeQuery/union').send({ queries: [] })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(422, { error: 'invalid' }))
    const response = await agent().post('/compositeQuery/union').send({ queries: [] })
    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'invalid' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/compositeQuery/union').send({ queries: [] })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /verifyExercise/:contentId', () => {
  it('verifies the exercise', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ verified: true }))
    const response = await agent().post('/verifyExercise/c1').send({ answer: 'a' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ verified: true })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(400, { error: 'bad answer' }))
    const response = await agent().post('/verifyExercise/c1').send({ answer: 'a' })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad answer' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/verifyExercise/c1').send({ answer: 'a' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /submitExercise/:contentId', () => {
  it('submits the exercise', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ submitted: true }))
    const response = await agent().post('/submitExercise/c1').send({ answer: 'a' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ submitted: true })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(400, { error: 'bad answer' }))
    const response = await agent().post('/submitExercise/c1').send({ answer: 'a' })
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad answer' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/submitExercise/c1').send({ answer: 'a' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
