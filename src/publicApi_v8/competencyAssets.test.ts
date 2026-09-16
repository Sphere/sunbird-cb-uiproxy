/**
 * competencyAssets.ts — two GET routes, each proxying a static file path via
 * the callable `axios({...})` form:
 *   try {
 *     const response = await axios({ headers: {}, method: 'GET', url: filePath })
 *     res.status(200).json({ response: response.data, status: 200 })
 *   } catch (err) {
 *     res.status(404).json({ message: '<route-specific message>', status: 404 })
 *   }
 *
 * Both routes are fully wrapped in a single try/catch, always send exactly
 * one response, and the catch block never touches `err`/`err.response` —
 * it always returns a fixed 404 body regardless of the error shape. No
 * double-send / hang / crash / unguarded-error-access patterns found, so
 * every branch is safe to exercise live.
 */

jest.mock('axios')
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    COMPETENCY_ROLES_DATA_PATH: 'https://competency.test/roles-data.json',
    COMPETENCY_ROLES_MAPPING_PATH: 'https://competency.test/roles-mapping.json',
  },
}))

import axios from 'axios'
import { competencyAssets } from './competencyAssets'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'

const mockAxios = axios as unknown as jest.Mock

const agent = () => mountRouter(competencyAssets)

beforeEach(() => {
  mockAxios.mockReset()
})

/**
 * @description Verifies GET /roleWiseCompetencyData forwards the upstream
 * data wrapped in a { response, status } envelope on success, and returns
 * a fixed 404 error body when the upstream call fails.
 */
describe('GET /roleWiseCompetencyData', () => {
  it('should return 200 with the upstream data wrapped in a response envelope', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ roles: ['admin', 'user'] }))
    const response = await agent().get('/roleWiseCompetencyData')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ response: { roles: ['admin', 'user'] }, status: 200 })
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {},
        method: 'GET',
        url: 'https://competency.test/roles-data.json',
      })
    )
  })

  it('should return 404 with the route-specific error message when the upstream call fails', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await agent().get('/roleWiseCompetencyData')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      message: 'Error while competency data fetch',
      status: 404,
    })
  })
})

/**
 * @description Verifies GET /rolesMappingData forwards the upstream data
 * wrapped in a { response, status } envelope on success, and returns a
 * fixed 404 error body when the upstream call fails.
 */
describe('GET /rolesMappingData', () => {
  it('should return 200 with the upstream data wrapped in a response envelope', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ mapping: { role1: 'competency1' } }))
    const response = await agent().get('/rolesMappingData')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      response: { mapping: { role1: 'competency1' } },
      status: 200,
    })
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {},
        method: 'GET',
        url: 'https://competency.test/roles-mapping.json',
      })
    )
  })

  it('should return 404 with the route-specific error message when the upstream call fails', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await agent().get('/rolesMappingData')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      message: 'Error while competency mapping fetch ',
      status: 404,
    })
  })
})
