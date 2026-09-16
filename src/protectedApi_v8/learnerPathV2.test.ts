/**
 * learnerPathV2.ts — two routes, both using the callable `axios({...})` form.
 *
 * Structurally identical to the sibling learnerPath.ts (learnerPath.test.ts):
 * POST / and GET / both validate the caller's session userId against the
 * request's own userid (body.userid for POST, query.userId for GET) with
 * `if (mismatch) { return res.status(400).json(...) }` — the `return` is
 * present, so this is a safe single-response validation branch.
 *
 * Both routes are fully wrapped in try/catch, and the catch block's
 * `res.status((err && err.response && err.response.status) || 500)` is
 * guarded against a missing `err.response`, so both the upstreamError() and
 * networkError() failure shapes from mockAxios are safe to exercise live.
 *
 * The only functional difference from learnerPath.ts is the upstream base
 * URL constant (CONSTANTS.SB_EXT_API_BASE_2 instead of
 * CONSTANTS.RECOMMENDATION_API_BASE_V2) and the log message text — verified
 * by reading learnerPathV2.ts independently, not assumed from the sibling.
 *
 * extractUserIdFromRequest and extractUserToken are mocked wholesale: their
 * real implementations fall back to req.session.userId / req.kauth, and
 * mountRouter() installs neither session nor kauth by default. Matches the
 * sibling learnerPath.test.ts approach.
 */

jest.mock('axios')
jest.mock('../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    SB_API_KEY: 'sb-api-key-test',
    SB_EXT_API_BASE_2: 'https://sb-ext-api.test',
  },
}))
jest.mock('../utils/logger', () => ({ logInfo: jest.fn() }))

import axios from 'axios'
import { learnerPathApiV2 } from './learnerPathV2'
import { mountRouter } from '../test-support/mountRouter'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'

const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(learnerPathApiV2)

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

/**
 * @description Verifies the POST / route validates the body userid against the
 * session userid and forwards success/error responses from the upstream call.
 */
describe('POST /', () => {
  it('should return 400 when the body userid does not match the session userid', async () => {
    const response = await agent().post('/').send({ userid: 'someone-else' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Invalid session or userid',
      status: 'FAILED',
    })
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('should forward the upstream data and return 200 on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ path: ['step1', 'step2'] }))

    const response = await agent()
      .post('/')
      .send({ userid: 'user-1', activity: 'course-complete' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      data: { path: ['step1', 'step2'] },
      status: 'SUCCESS',
    })
  })

  it('should forward the upstream status and body when the upstream call fails', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))

    const response = await agent().post('/').send({ userid: 'user-1' })

    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('should fall back to 500 with a generic body on a network-level failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent().post('/').send({ userid: 'user-1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      error: 'Something went wrong while updating or inserting learnerpath',
    })
  })
})

/**
 * @description Verifies the GET / route validates the query userId against the
 * session userid and forwards success/error responses from the upstream call.
 */
describe('GET /', () => {
  it('should return 400 when the query userId does not match the session userid', async () => {
    const response = await agent().get('/').query({ userId: 'someone-else' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Invalid session or userid',
      status: 'FAILED',
    })
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('should forward the upstream data and return 200 on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ path: ['step1'] }))

    const response = await agent().get('/').query({ userId: 'user-1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      data: { path: ['step1'] },
      status: 'SUCCESS',
    })
  })

  it('should forward the upstream status and body when the upstream call fails', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent().get('/').query({ userId: 'user-1' })

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('should fall back to 500 with a generic body on a network-level failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent().get('/').query({ userId: 'user-1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      error: 'Something went wrong while fetching learnerpath',
    })
  })
})
