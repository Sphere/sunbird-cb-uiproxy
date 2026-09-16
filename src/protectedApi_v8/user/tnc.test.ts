/**
 * PHASE 1 — user/tnc.ts.
 *
 * Endpoints mix two axios call shapes: the callable `axios({...})` form
 * (getCommonTnc, POST /accept, PATCH /postprocessing) and the method form
 * (`axios.get` for getTnc / GET / and GET /system/settings/:configName,
 * `axios.post` for POST /sbacceptTnc). Both are mocked separately, following
 * the pattern in playlist.test.ts (`axios as unknown as jest.Mock` for the
 * callable form, `axios.get`/`axios.post` for the method form).
 *
 * GET /status is notable: it calls getTncStatus, which itself swallows ALL
 * errors from getTnc (including the case where the getCommonTnc fallback
 * also fails) and resolves to `false` rather than throwing. So GET /status
 * effectively never reaches its own route-level catch block in practice --
 * an upstream failure surfaces as a 200 with body `false`, not a 500. See
 * the dedicated test below.
 *
 * No missing-`return`-after-`res.send` issues were found in tnc.ts -- every
 * validation branch that sends a response returns immediately afterward, so
 * all branches here are safe to exercise live.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    LEARNER_SERVICE_API_BASE: 'https://learner.test',
    SB_EXT_API_BASE: 'https://sbext.test',
    TNC_API_BASE: 'https://tnc.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { protectedTnc } from './tnc'

const mockAxios = axios as unknown as jest.Mock
const mockAxiosGet = (axios as jest.Mocked<typeof axios>).get
const mockAxiosPost = (axios as jest.Mocked<typeof axios>).post
const mockExtractUserId = extractUserIdFromRequest as jest.Mock
const agent = () => mountRouter(protectedTnc)
const withOrg = (req: ReturnType<typeof agent>) => req.set('org', 'o1').set('rootOrg', 'r1')

beforeEach(() => {
  mockAxios.mockReset()
  mockAxiosGet.mockReset()
  mockAxiosPost.mockReset()
})

describe('GET /status', () => {
  it('rejects a request missing org/rootOrg headers', async () => {
    const response = await agent().get('/status')
    expect(response.status).toBe(400)
  })

  it('returns true when the upstream reports acceptance', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk({ isAccepted: true, termsAndConditions: [] }))
    const response = await withOrg(agent().get('/status'))
    expect(response.status).toBe(200)
    expect(response.body).toBe(true)
  })

  it('returns false without erroring when both the primary and fallback upstream calls fail', async () => {
    mockAxiosGet.mockRejectedValue(networkError())
    mockAxios.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/status'))
    expect(response.status).toBe(200)
    expect(response.body).toBe(false)
  })

  it('honors an explicit locale query param', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk({ isAccepted: true, termsAndConditions: [] }))
    const response = await withOrg(agent().get('/status')).query({ locale: 'fr' })
    expect(response.status).toBe(200)
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ langCode: 'fr' }) })
    )
  })

  it('returns 500 when extracting the user id throws', async () => {
    mockExtractUserId.mockImplementationOnce(() => {
      throw new Error('no session')
    })
    const response = await withOrg(agent().get('/status'))
    expect(response.status).toBe(500)
  })

  it('returns false without erroring when the upstream responds with an HTTP error', async () => {
    // getTncStatus swallows all errors from getTnc -- including an upstream HTTP
    // error response, not just a network failure -- and resolves to false. See
    // the PHASE 1 note atop this file / docs/PROD-VERIFICATION.md.
    mockAxiosGet.mockRejectedValue(upstreamError(502))
    mockAxios.mockRejectedValue(upstreamError(502))
    const response = await withOrg(agent().get('/status'))
    expect(response.status).toBe(200)
    expect(response.body).toBe(false)
  })

  it('returns false when the upstream reports no acceptance and no terms', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk({ isAccepted: false, termsAndConditions: [] }))
    const response = await withOrg(agent().get('/status'))
    expect(response.status).toBe(200)
    expect(response.body).toBe(false)
  })
})

describe('GET /', () => {
  it('rejects a request missing org/rootOrg headers', async () => {
    const response = await agent().get('/')
    expect(response.status).toBe(400)
  })

  it('returns the tnc data with isNewUser computed', async () => {
    mockAxiosGet.mockResolvedValue(
      upstreamOk({
        isAccepted: false,
        termsAndConditions: [{ acceptedVersion: null }],
      })
    )
    const response = await withOrg(agent().get('/'))
    expect(response.status).toBe(200)
    expect(response.body.isNewUser).toBe(true)
  })

  it('falls back to the common tnc when the primary call fails, and still succeeds', async () => {
    mockAxiosGet.mockRejectedValue(networkError())
    mockAxios.mockResolvedValue(upstreamOk({ termsAndConditions: [] }))
    const response = await withOrg(agent().get('/'))
    expect(response.status).toBe(200)
    expect(response.body.isNewUser).toBe(true)
  })

  it('returns 500 when both the primary and fallback upstream calls fail', async () => {
    mockAxiosGet.mockRejectedValue(networkError())
    mockAxios.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })

  it('honors an explicit locale query param', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk({ termsAndConditions: [] }))
    const response = await withOrg(agent().get('/')).query({ locale: 'fr' })
    expect(response.status).toBe(200)
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ langCode: 'fr' }) })
    )
  })

  it('computes isNewUser false when the upstream reports acceptance', async () => {
    mockAxiosGet.mockResolvedValue(
      upstreamOk({ isAccepted: true, termsAndConditions: [{ acceptedVersion: 'v1' }] })
    )
    const response = await withOrg(agent().get('/'))
    expect(response.status).toBe(200)
    expect(response.body.isNewUser).toBe(false)
  })

  it('computes isNewUser false when there are no terms and conditions at all', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk({ isAccepted: false, termsAndConditions: [] }))
    const response = await withOrg(agent().get('/'))
    expect(response.status).toBe(200)
    expect(response.body.isNewUser).toBe(false)
  })

  it('falls back to a generic 500 when both calls fail, even with an upstream HTTP error', async () => {
    // getCommonTnc's catch re-wraps whatever it receives as `new Error(e)`, which
    // drops the original `.response` (status/data). So the route handler's own
    // catch never sees a `.response` here and always takes the 500/generic-body
    // fallback, regardless of the upstream's actual status code.
    mockAxiosGet.mockRejectedValue(upstreamError(502, { error: 'terms service down' }))
    mockAxios.mockRejectedValue(upstreamError(502, { error: 'terms service down' }))
    const response = await withOrg(agent().get('/'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })

  it('returns 500 when extracting the user id throws', async () => {
    mockExtractUserId.mockImplementationOnce(() => {
      throw new Error('no session')
    })
    const response = await withOrg(agent().get('/'))
    expect(response.status).toBe(500)
  })
})

describe('POST /accept', () => {
  it('rejects a request missing org/rootOrg headers', async () => {
    const response = await agent().post('/accept').send({ termsAccepted: 'v1' })
    expect(response.status).toBe(400)
  })

  it('returns 204 when the upstream reports success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ result: 'success' }))
    const response = await withOrg(agent().post('/accept')).send({ termsAccepted: 'v1' })
    expect(response.status).toBe(204)
  })

  it('returns 500 when the upstream reports a non-success result', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ result: 'FAILED' }))
    const response = await withOrg(agent().post('/accept')).send({ termsAccepted: 'v1' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ result: 'FAILED' })
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/accept')).send({ termsAccepted: 'v1' })
    expect(response.status).toBe(500)
  })

  it('forwards the upstream status and body on an upstream HTTP error', async () => {
    mockAxios.mockRejectedValue(upstreamError(409, { error: 'conflict' }))
    const response = await withOrg(agent().post('/accept')).send({ termsAccepted: 'v1' })
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('returns 500 when the upstream result is missing entirely', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))
    const response = await withOrg(agent().post('/accept')).send({ termsAccepted: 'v1' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({})
  })

  it('returns 500 when extracting the user id throws', async () => {
    mockExtractUserId.mockImplementationOnce(() => {
      throw new Error('no session')
    })
    const response = await withOrg(agent().post('/accept')).send({ termsAccepted: 'v1' })
    expect(response.status).toBe(500)
  })
})

describe('PATCH /postprocessing', () => {
  it('rejects a request missing org/rootOrg headers', async () => {
    const response = await agent().patch('/postprocessing')
    expect(response.status).toBe(400)
  })

  it('returns 200 with data when the upstream responds with a body', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ done: true }))
    const response = await withOrg(agent().patch('/postprocessing'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ done: true })
  })

  it('returns 204 when the upstream responds with no data', async () => {
    mockAxios.mockResolvedValue(upstreamOk(null))
    const response = await withOrg(agent().patch('/postprocessing'))
    expect(response.status).toBe(204)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await withOrg(agent().patch('/postprocessing'))
    expect(response.status).toBe(500)
  })

  it('forwards the upstream status and body on an upstream HTTP error', async () => {
    mockAxios.mockRejectedValue(upstreamError(403, { error: 'forbidden' }))
    const response = await withOrg(agent().patch('/postprocessing'))
    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'forbidden' })
  })

  it('returns 500 when extracting the user id throws', async () => {
    mockExtractUserId.mockImplementationOnce(() => {
      throw new Error('no session')
    })
    const response = await withOrg(agent().patch('/postprocessing'))
    expect(response.status).toBe(500)
  })
})

describe('GET /system/settings/:configName', () => {
  it('forwards the system config', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk({ value: 'on' }))
    const response = await agent().get('/system/settings/someConfig')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ value: 'on' })
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxiosGet.mockRejectedValue(networkError())
    const response = await agent().get('/system/settings/someConfig')
    expect(response.status).toBe(500)
  })

  it('forwards the upstream status and body on an upstream HTTP error', async () => {
    mockAxiosGet.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/system/settings/someConfig')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('forwards a non-200 upstream success status verbatim', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk({ value: 'partial' }, 206))
    const response = await agent().get('/system/settings/someConfig')
    expect(response.status).toBe(206)
    expect(response.body).toEqual({ value: 'partial' })
  })
})

describe('POST /sbacceptTnc', () => {
  it('forwards the accept-tnc request using the bearer token', async () => {
    mockAxiosPost.mockResolvedValue(upstreamOk({ accepted: true }))
    const response = await agent()
      .post('/sbacceptTnc')
      .set('Authorization', 'bearer tok-1')
      .send({ termsAccepted: 'v1' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ accepted: true })
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxiosPost.mockRejectedValue(networkError())
    const response = await agent()
      .post('/sbacceptTnc')
      .set('Authorization', 'bearer tok-1')
      .send({})
    expect(response.status).toBe(500)
  })

  it('forwards the upstream status and body on an upstream HTTP error', async () => {
    mockAxiosPost.mockRejectedValue(upstreamError(401, { error: 'unauthorized' }))
    const response = await agent()
      .post('/sbacceptTnc')
      .set('Authorization', 'bearer tok-1')
      .send({})
    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'unauthorized' })
  })

  it('still forwards the request when the Authorization header is absent', async () => {
    // No `!token` guard exists for this route -- String(undefined) becomes the
    // literal string 'undefined' and is sent upstream as-is.
    mockAxiosPost.mockResolvedValue(upstreamOk({ accepted: true }))
    const response = await agent().post('/sbacceptTnc').send({ termsAccepted: 'v1' })
    expect(response.status).toBe(200)
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Authenticated-User-Token': 'undefined' }),
      })
    )
  })
})
