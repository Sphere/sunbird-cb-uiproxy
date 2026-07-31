/**
 * competencyReporting.ts — two GET routes proxying to
 * RECOMMENDATION_API_BASE_V2, both gated by a shared `accesskey` header
 * check compared with `!=` against CONSTANTS.EKSHAMATA_SECURITY_KEY_MASTER.
 * Both routes follow the identical shape:
 *   try {
 *     if (req.headers.accesskey != accessKey) { res.status(400).json(...); return }
 *     logInfo(...)
 *     if (!startDate || !endDate) { res.status(400).json(...); return }
 *     const response = await axios({...})       // callable axios(...) form, not .get()
 *     res.status(response.status).send(response.data)
 *   } catch (error) { res.status(400).json({...}) }
 *
 * Both routes are fully try/catch-wrapped with a `return` after the
 * access-key rejection and after the missing-date rejection, so no
 * double-send / hang / crash patterns were found — every branch is safe to
 * exercise live.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    EKSHAMATA_SECURITY_KEY_MASTER: 'test-access-key',
    RECOMMENDATION_API_BASE_V2: 'https://recommendation.test',
  },
}))

import axios from 'axios'
import { competencyReporting } from './competencyReporting'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'

const mockAxios = axios as unknown as jest.Mock

const agent = () => mountRouter(competencyReporting)

const VALID_KEY = 'test-access-key'
const keyMissingMessage = {
  message: 'Access key invalid or not present',
  status: 'Failed',
}
const dateMissingMessage = {
  message: 'Start date or end date cant be empty',
  status: 'Failed',
}

beforeEach(() => {
  mockAxios.mockReset()
})

/**
 * @description Verifies both the /reports/assessment and /reports/passbook
 * GET routes enforce the accesskey header and required start/end dates,
 * forward the upstream payload and status on success, and return the
 * route-specific error message when the upstream call fails.
 */
describe.each([
  {
    errorMessage: 'Something went wrong in recommendation service',
    path: '/reports/assessment',
  },
  {
    errorMessage: 'Something went wrong in recommendation service',
    path: '/reports/passbook',
  },
])('GET $path', ({ path, errorMessage }) => {
  it('should return the upstream payload when the access key is valid and both dates are given', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ report: 'data' }))
    const response = await agent()
      .get(path)
      .query({ start_date: '2026-01-01', end_date: '2026-01-31' })
      .set('accesskey', VALID_KEY)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ report: 'data' })
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        params: { end_date: '2026-01-31', start_date: '2026-01-01' },
      })
    )
  })

  it('should forward a non-200 upstream status', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ report: [] }, 201))
    const response = await agent()
      .get(path)
      .query({ start_date: '2026-01-01', end_date: '2026-01-31' })
      .set('accesskey', VALID_KEY)
    expect(response.status).toBe(201)
  })

  it('should return 400 with the invalid-key message when the accesskey header is missing', async () => {
    const response = await agent()
      .get(path)
      .query({ start_date: '2026-01-01', end_date: '2026-01-31' })
    expect(response.status).toBe(400)
    expect(response.body).toEqual(keyMissingMessage)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('should return 400 with the invalid-key message when the accesskey header is wrong', async () => {
    const response = await agent()
      .get(path)
      .query({ start_date: '2026-01-01', end_date: '2026-01-31' })
      .set('accesskey', 'wrong-key')
    expect(response.status).toBe(400)
    expect(response.body).toEqual(keyMissingMessage)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('should return 400 with the date-missing message when both dates are absent', async () => {
    const response = await agent().get(path).set('accesskey', VALID_KEY)
    expect(response.status).toBe(400)
    expect(response.body).toEqual(dateMissingMessage)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('should return 400 with the date-missing message when only start_date is given', async () => {
    const response = await agent()
      .get(path)
      .query({ start_date: '2026-01-01' })
      .set('accesskey', VALID_KEY)
    expect(response.status).toBe(400)
    expect(response.body).toEqual(dateMissingMessage)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('should return 400 with the date-missing message when only end_date is given', async () => {
    const response = await agent()
      .get(path)
      .query({ end_date: '2026-01-31' })
      .set('accesskey', VALID_KEY)
    expect(response.status).toBe(400)
    expect(response.body).toEqual(dateMissingMessage)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('should return 400 with the route-specific message when the upstream call fails', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await agent()
      .get(path)
      .query({ start_date: '2026-01-01', end_date: '2026-01-31' })
      .set('accesskey', VALID_KEY)
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: errorMessage, status: 'Failed' })
  })
})
