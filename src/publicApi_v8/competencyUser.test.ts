/**
 * competencyUser.ts — a single GET '/' route proxying to
 * COMPETENCY_API_BASE/api/user via the callable `axios({...})` form:
 *   try {
 *     const response = await axios({ method: 'GET', url: ... })
 *     if (response.data.responseCode === 'OK') {
 *       logInfo(...); logInfo(...)
 *       res.status(response.status).send(response.data.result)
 *     } else {
 *       throw new Error(_.get(response.data, 'params.errmsg') || _.get(response.data, 'params.err'))
 *     }
 *   } catch (error) {
 *     logError(...)
 *     res.status(500).send({ message: COMPETENCY_USER_FAIL, status: 'failed' })
 *   }
 *
 * The whole body is wrapped in a single try/catch, there is exactly one
 * response sent per branch, and no branch falls through into another send —
 * no double-send / hang / crash patterns found, so every branch is safe to
 * exercise live (including a rejected axios call, and a resolved call whose
 * responseCode isn't 'OK').
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    COMPETENCY_API_BASE: 'https://competency.test',
  },
}))

import axios from 'axios'
import { publicCompetencyUser } from './competencyUser'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'

const mockAxios = axios as unknown as jest.Mock

const agent = () => mountRouter(publicCompetencyUser)

const FAIL_BODY = {
  message: 'Sorry ! Data is not received in competency.',
  status: 'failed',
}

beforeEach(() => {
  mockAxios.mockReset()
})

/**
 * @description Verifies GET '/' forwards the upstream `result` payload and
 * status when the upstream responseCode is 'OK'.
 */
describe('GET /', () => {
  it('should return the upstream result and status when responseCode is OK', async () => {
    mockAxios.mockResolvedValue(
      upstreamOk({ responseCode: 'OK', result: { id: 'user-1', name: 'Test User' } })
    )
    const response = await agent().get('/')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'user-1', name: 'Test User' })
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://competency.test/api/user',
      })
    )
  })

  it('should forward a non-200 upstream status when responseCode is OK', async () => {
    mockAxios.mockResolvedValue(
      upstreamOk({ responseCode: 'OK', result: { id: 'user-2' } }, 201)
    )
    const response = await agent().get('/')
    expect(response.status).toBe(201)
    expect(response.body).toEqual({ id: 'user-2' })
  })

  /**
   * responseCode !== 'OK' takes the else branch, which throws using
   * params.errmsg / params.err via lodash _.get (safe against a missing
   * `params` key) and is caught by the surrounding try/catch.
   */
  it('should return 500 with the generic failure message when responseCode is not OK', async () => {
    mockAxios.mockResolvedValue(
      upstreamOk({
        params: { errmsg: 'user not found' },
        responseCode: 'CLIENT_ERROR',
      })
    )
    const response = await agent().get('/')
    expect(response.status).toBe(500)
    expect(response.body).toEqual(FAIL_BODY)
  })

  it('should return 500 with the generic failure message when responseCode and params are both absent', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))
    const response = await agent().get('/')
    expect(response.status).toBe(500)
    expect(response.body).toEqual(FAIL_BODY)
  })

  it('should return 500 with the generic failure message when the upstream call rejects with a network error', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await agent().get('/')
    expect(response.status).toBe(500)
    expect(response.body).toEqual(FAIL_BODY)
  })
})
