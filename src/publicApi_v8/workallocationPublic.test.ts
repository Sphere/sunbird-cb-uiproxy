/**
 * workallocationPublic.ts — one route, GET /getWaPdf/:userId/:waId, proxying
 * to SB_EXT_API_BASE_2's /v1/workallocation/getWAPdf/:userId/:waId endpoint.
 *
 *   try {
 *     userId, waId read from req.params
 *     const response = await axios.get(url, { ...axiosRequestConfig, headers: {} })
 *     res.status(response.status).send(response.data)
 *   } catch (err) {
 *     logError(err)
 *     res.status((err && err.response && err.response.status) || 500).send(
 *       (err && err.response && err.response.data) || { error: ERROR.GENERAL_ERR_MSG }
 *     )
 *   }
 *
 * The whole handler is inside one try/catch with no validation branches and
 * no early returns, so there's no double-send / hang / crash pattern here —
 * every branch below is safe to exercise live.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    SB_EXT_API_BASE_2: 'https://workallocation.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { workallocationPublic } from './workallocationPublic'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(workallocationPublic)

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

beforeEach(() => {
  mockAxios.get.mockReset()
})

/**
 * @description Verifies the GET /getWaPdf/:userId/:waId route forwards the
 * userId/waId path params to the upstream getWAPdf endpoint and returns its
 * status/body, and that it forwards an upstream error's status/body or falls
 * back to a generic 500 on a network-level failure.
 */
describe('GET /getWaPdf/:userId/:waId', () => {
  it('should return 200 with the upstream pdf body when the upstream call succeeds', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ pdf: 'base64data' }))

    const response = await agent().get('/getWaPdf/user1/wa1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ pdf: 'base64data' })
  })

  it('should call the upstream getWAPdf endpoint with the userId and waId path params', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ pdf: 'base64data' }))

    await agent().get('/getWaPdf/user1/wa1')

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://workallocation.test/v1/workallocation/getWAPdf/user1/wa1',
      expect.objectContaining({ headers: {} })
    )
  })

  it('should forward the upstream status and body when the upstream call rejects with a response', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'upstream failed' }))

    const response = await agent().get('/getWaPdf/user1/wa1')

    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'upstream failed' })
  })

  it('should return a 500 with the generic error message on a network-level failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent().get('/getWaPdf/user1/wa1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: GENERAL_ERROR_MSG })
  })
})
