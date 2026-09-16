/**
 * tnc.ts — one route, GET /, proxying to SB_EXT_API_BASE_2's /v1/latest/terms.
 *
 *   try {
 *     rootOrg/org read from headers (default '')
 *     if (!org || !rootOrg) { res.status(400).send(ERROR.ERROR_NO_ORG_DATA); return }
 *     locale defaults to 'en', overridden by req.query.locale if present
 *     const response = await axios({...})   // callable axios(...) form, not .get()
 *     res.json(response.data)
 *   } catch (err) {
 *     logError('TNC ERR >', err)
 *     res.status((err && err.response && err.response.status) || 500).send(
 *       (err && err.response && err.response.data) || { error: 'Failed due to unknown reason' }
 *     )
 *   }
 *
 * The whole handler is inside one try/catch, and the org/rootOrg validation
 * branch has an explicit `return` before falling into the axios call, so
 * there's no double-send / hang / crash pattern here — every branch below is
 * safe to exercise live.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    SB_EXT_API_BASE_2: 'https://tnc.test',
  },
}))

import axios from 'axios'
import { publicTnc } from './tnc'
import { mountRouter } from '../test-support/mountRouter'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'

const mockAxios = axios as unknown as jest.Mock
const agent = () => mountRouter(publicTnc)

beforeEach(() => {
  mockAxios.mockReset()
})

/**
 * @description Verifies the GET / route returns the upstream terms body with
 * the correct locale/org headers, rejects with 400 when org/rootOrg headers
 * are missing, and forwards upstream errors or falls back to a 500 on
 * network-level failures.
 */
describe('GET /', () => {
  it('should return 200 with the upstream terms body when org and rootOrg headers are present', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ terms: 'accept me' }))

    const response = await agent()
      .get('/')
      .set('org', 'org1')
      .set('rootOrg', 'root1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ terms: 'accept me' })
  })

  it('should call the upstream terms endpoint with the org/rootOrg headers and the default locale', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ terms: 'accept me' }))

    await agent().get('/').set('org', 'org1').set('rootOrg', 'root1')

    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          langCode: 'en',
          org: 'org1',
          rootOrg: 'root1',
        },
        method: 'GET',
        url: 'https://tnc.test/v1/latest/terms',
      })
    )
  })

  it('should use the query locale instead of the default when one is given', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ terms: 'accept me' }))

    await agent()
      .get('/')
      .query({ locale: 'fr' })
      .set('org', 'org1')
      .set('rootOrg', 'root1')

    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ langCode: 'fr' }),
      })
    )
  })

  it('should return 400 with the no-org-data error when both org and rootOrg headers are missing', async () => {
    const response = await agent().get('/')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('should return 400 with the no-org-data error when only the org header is present', async () => {
    const response = await agent().get('/').set('org', 'org1')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('should return 400 with the no-org-data error when only the rootOrg header is present', async () => {
    const response = await agent().get('/').set('rootOrg', 'root1')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('should forward the upstream error status and body when the upstream call fails with an HTTP error', async () => {
    mockAxios.mockRejectedValue(upstreamError(404, { error: 'terms not found' }))

    const response = await agent()
      .get('/')
      .set('org', 'org1')
      .set('rootOrg', 'root1')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'terms not found' })
  })

  it('should fall back to 500 with the generic error body on a network-level failure', async () => {
    mockAxios.mockRejectedValue(networkError())

    const response = await agent()
      .get('/')
      .set('org', 'org1')
      .set('rootOrg', 'root1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
