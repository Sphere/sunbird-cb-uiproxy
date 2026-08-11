/**
 * PHASE 1 — network.ts (152 uncovered).
 *
 * A third near-copy of connections.ts / connections_v2.ts, sharing the same
 * route names but NOT identical logic — /connections/recommended/userDepartment
 * here uses apiEndpoints.detail and reads department_name off a flat array
 * response, unlike either sibling file's version. Read directly rather than
 * assumed from the other two.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    KONG_API_BASE: 'https://kong.test',
    USER_PROFILE_API_BASE: 'https://profile.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { extractUserIdFromRequest } from '../utils/requestExtract'
import { networkConnectionApi } from './network'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockExtractUserIdFromRequest = extractUserIdFromRequest as jest.Mock
const agent = () => mountRouter(networkConnectionApi)
const withOrg = (req: ReturnType<typeof agent>) => req.set('rootorg', 'r1')

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

/**
 * @description CHANGE 33 regression: all 5 GET routes now funnel through
 * the shared fetchConnectionsList helper. This proves each route calls
 * its OWN distinct upstream endpoint, not a copy-pasted neighbor's — the
 * exact bug class a shared-helper refactor risks (e.g. /suggests
 * accidentally calling the /requested endpoint).
 */
describe('each GET route calls its own distinct endpoint (CHANGE 33)', () => {
  it('/connections/requested calls the requested endpoint', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))
    await withOrg(agent().get('/connections/requested'))
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://kong.test/connections/profile/fetch/requested',
      expect.anything()
    )
  })

  it('/connections/requests/received calls the requests/received endpoint', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))
    await withOrg(agent().get('/connections/requests/received'))
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://kong.test/connections/profile/fetch/requests/received',
      expect.anything()
    )
  })

  it('/connections/established calls the established endpoint', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))
    await withOrg(agent().get('/connections/established'))
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://kong.test/connections/profile/fetch/established',
      expect.anything()
    )
  })

  it('/connections/established/:id calls the established endpoint with the path param as userId', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))
    await withOrg(agent().get('/connections/established/user-99'))
    const callArgs = mockAxios.get.mock.calls[0]
    expect(callArgs[0]).toBe('https://kong.test/connections/profile/fetch/established')
    expect(callArgs[1].headers.userId).toBe('user-99')
  })

  it('/connections/suggests calls the suggests endpoint', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))
    await withOrg(agent().get('/connections/suggests'))
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://kong.test/connections/profile/find/suggests',
      expect.anything()
    )
  })
})

describe('GET /connections/requested', () => {
  it('forwards requested connections', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'c1' }]))
    const response = await withOrg(agent().get('/connections/requested'))
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootorg', async () => {
    const response = await agent().get('/connections/requested')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/connections/requested'))
    expect(response.status).toBe(500)
  })

  it('rejects a request when userId cannot be resolved', async () => {
    mockExtractUserIdFromRequest.mockReturnValueOnce('')
    const response = await withOrg(agent().get('/connections/requested'))
    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('forwards the upstream status and body on an upstream HTTP error', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await withOrg(agent().get('/connections/requested'))
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })
})

describe('GET /connections/requests/received', () => {
  it('forwards received requests', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'c1' }]))
    const response = await withOrg(agent().get('/connections/requests/received'))
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootorg', async () => {
    const response = await agent().get('/connections/requests/received')
    expect(response.status).toBe(400)
  })

  it('rejects a request when userId cannot be resolved', async () => {
    mockExtractUserIdFromRequest.mockReturnValueOnce('')
    const response = await withOrg(agent().get('/connections/requests/received'))
    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/connections/requests/received'))
    expect(response.status).toBe(500)
  })

  it('forwards the upstream status and body on an upstream HTTP error', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(503, { error: 'unavailable' }))
    const response = await withOrg(agent().get('/connections/requests/received'))
    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'unavailable' })
  })
})

describe('GET /connections/established', () => {
  it('forwards established connections', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'c1' }]))
    const response = await withOrg(agent().get('/connections/established'))
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootorg', async () => {
    const response = await agent().get('/connections/established')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/connections/established'))
    expect(response.status).toBe(500)
  })

  it('rejects a request when userId cannot be resolved', async () => {
    mockExtractUserIdFromRequest.mockReturnValueOnce('')
    const response = await withOrg(agent().get('/connections/established'))
    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('forwards the upstream status and body on an upstream HTTP error', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(403, { error: 'forbidden' }))
    const response = await withOrg(agent().get('/connections/established'))
    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'forbidden' })
  })
})

describe('GET /connections/established/:id', () => {
  it('forwards a single established connection', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'c1' }))
    const response = await withOrg(agent().get('/connections/established/c1'))
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootorg', async () => {
    const response = await agent().get('/connections/established/c1')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/connections/established/c1'))
    expect(response.status).toBe(500)
  })

  // NOTE: the `!userId` branch here (userId = req.params.id) is unreachable
  // live — Express 404s '/connections/established/' and
  // '/connections/established//' rather than routing to this handler with an
  // empty :id, so there is no HTTP request that produces a falsy req.params.id
  // for this route. Left uncovered rather than forced.

  it('forwards the upstream status and body on an upstream HTTP error', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await withOrg(agent().get('/connections/established/c1'))
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  // Known, documented security-relevant divergence — see docs/DUPLICATE-CODE-CLEANUP.md
  // L3-17. Unlike every other route in this file, this one derives `userId`
  // from the :id path param rather than from the authenticated caller
  // (extractUserIdFromRequest), so it can look up a DIFFERENT user's
  // established connections by id. Asserting current behavior as-is; not a bug fix.
  it('derives userId from the path param, not the authenticated caller (documented divergence, L3-17)', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'other-user-connections' }))
    mockExtractUserIdFromRequest.mockReturnValueOnce('authenticated-caller')

    const response = await withOrg(agent().get('/connections/established/some-other-user'))

    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ userId: 'some-other-user' }),
      })
    )
    // extractUserIdFromRequest is never even consulted by this route.
    expect(mockExtractUserIdFromRequest).not.toHaveBeenCalled()
  })
})

describe('GET /connections/suggests', () => {
  it('forwards suggested connections', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'c2' }]))
    const response = await withOrg(agent().get('/connections/suggests'))
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootorg', async () => {
    const response = await agent().get('/connections/suggests')
    expect(response.status).toBe(400)
  })

  it('rejects a request when userId cannot be resolved', async () => {
    mockExtractUserIdFromRequest.mockReturnValueOnce('')
    const response = await withOrg(agent().get('/connections/suggests'))
    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/connections/suggests'))
    expect(response.status).toBe(500)
  })

  it('forwards the upstream status and body on an upstream HTTP error', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await withOrg(agent().get('/connections/suggests'))
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })
})

describe('POST /add/connection', () => {
  it('adds the connection', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ added: true }))
    const response = await withOrg(agent().post('/add/connection')).send({ connectionId: 'c1' })
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootorg', async () => {
    const response = await agent().post('/add/connection').send({ connectionId: 'c1' })
    expect(response.status).toBe(400)
  })

  it('rejects a request missing connectionId', async () => {
    const response = await withOrg(agent().post('/add/connection')).send({})
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('rejects a request when userId cannot be resolved', async () => {
    mockExtractUserIdFromRequest.mockReturnValueOnce('')
    const response = await withOrg(agent().post('/add/connection')).send({ connectionId: 'c1' })
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/add/connection')).send({ connectionId: 'c1' })
    expect(response.status).toBe(500)
  })

  it('forwards the upstream status and body on an upstream HTTP error', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(409, { error: 'conflict' }))
    const response = await withOrg(agent().post('/add/connection')).send({ connectionId: 'c1' })
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })
})

describe('POST /update/connection', () => {
  it('updates the connection', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await withOrg(agent().post('/update/connection')).send({
      connectionId: 'c1',
      status: 'accepted',
    })
    expect(response.status).toBe(200)
  })

  it('rejects a request missing status', async () => {
    const response = await withOrg(agent().post('/update/connection')).send({ connectionId: 'c1' })
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('rejects a request missing connectionId', async () => {
    const response = await withOrg(agent().post('/update/connection')).send({ status: 'accepted' })
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('rejects a request when userId cannot be resolved', async () => {
    mockExtractUserIdFromRequest.mockReturnValueOnce('')
    const response = await withOrg(agent().post('/update/connection')).send({
      connectionId: 'c1',
      status: 'accepted',
    })
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('rejects a request missing rootorg', async () => {
    const response = await agent()
      .post('/update/connection')
      .send({ connectionId: 'c1', status: 'accepted' })
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/update/connection')).send({
      connectionId: 'c1',
      status: 'accepted',
    })
    expect(response.status).toBe(500)
  })

  it('forwards the upstream status and body on an upstream HTTP error', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(422, { error: 'invalid status' }))
    const response = await withOrg(agent().post('/update/connection')).send({
      connectionId: 'c1',
      status: 'accepted',
    })
    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'invalid status' })
  })
})

describe('POST /connections/recommended', () => {
  it('forwards recommended connections', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([{ id: 'c3' }]))
    const response = await withOrg(agent().post('/connections/recommended')).send({})
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootorg', async () => {
    const response = await agent().post('/connections/recommended').send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/connections/recommended')).send({})
    expect(response.status).toBe(500)
  })

  it('rejects a request when userId cannot be resolved', async () => {
    mockExtractUserIdFromRequest.mockReturnValueOnce('')
    const response = await withOrg(agent().post('/connections/recommended')).send({})
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('forwards the upstream status and body on an upstream HTTP error', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(500, { error: 'server error' }))
    const response = await withOrg(agent().post('/connections/recommended')).send({})
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'server error' })
  })

  // Known, documented divergence — see docs/DUPLICATE-CODE-CLEANUP.md L3-17.
  // Unlike the GET connection routes above, this route omits Authorization
  // and x-authenticated-user-token from the outbound headers entirely.
  // Asserting current behavior as-is; not a bug fix.
  it('omits Authorization and x-authenticated-user-token from the outbound request (documented divergence, L3-17)', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([{ id: 'c3' }]))
    const response = await withOrg(agent().post('/connections/recommended')).send({})

    expect(response.status).toBe(200)
    const [, , config] = mockAxios.post.mock.calls[0]
    expect(config.headers).not.toHaveProperty('Authorization')
    expect(config.headers).not.toHaveProperty('x-authenticated-user-token')
  })
})

describe('POST /connections/recommended/userDepartment', () => {
  it('reads the department from a flat array response and forwards recommendations', async () => {
    mockAxios.post
      .mockResolvedValueOnce(upstreamOk([{ department_name: 'Health' }]))
      .mockResolvedValueOnce(upstreamOk([{ id: 'c4' }]))

    const response = await withOrg(agent().post('/connections/recommended/userDepartment')).send({})

    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledTimes(2)
  })

  it('defaults to "igot" when the department lookup returns no rows', async () => {
    mockAxios.post
      .mockResolvedValueOnce(upstreamOk([]))
      .mockResolvedValueOnce(upstreamOk([{ id: 'c4' }]))

    const response = await withOrg(agent().post('/connections/recommended/userDepartment')).send({})

    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ search: [expect.objectContaining({ values: ['igot'] })] }),
      expect.anything()
    )
  })

  it('rejects a request missing rootorg', async () => {
    const response = await agent().post('/connections/recommended/userDepartment').send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 when the department lookup fails', async () => {
    mockAxios.post.mockRejectedValueOnce(networkError())
    const response = await withOrg(agent().post('/connections/recommended/userDepartment')).send({})
    expect(response.status).toBe(500)
  })

  it('rejects a request when userId cannot be resolved', async () => {
    mockExtractUserIdFromRequest.mockReturnValueOnce('')
    const response = await withOrg(agent().post('/connections/recommended/userDepartment')).send({})
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('defaults to "igot" when the looked-up department_name is falsy', async () => {
    mockAxios.post
      .mockResolvedValueOnce(upstreamOk([{ department_name: '' }]))
      .mockResolvedValueOnce(upstreamOk([{ id: 'c4' }]))

    const response = await withOrg(agent().post('/connections/recommended/userDepartment')).send({})

    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ search: [expect.objectContaining({ values: ['igot'] })] }),
      expect.anything()
    )
  })

  it('forwards the upstream status and body when the recommendation call itself fails', async () => {
    mockAxios.post
      .mockResolvedValueOnce(upstreamOk([{ department_name: 'Health' }]))
      .mockRejectedValueOnce(upstreamError(400, { error: 'bad request' }))

    const response = await withOrg(agent().post('/connections/recommended/userDepartment')).send({})

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad request' })
  })

  // Known, documented divergence — see docs/DUPLICATE-CODE-CLEANUP.md L3-17.
  // Like /connections/recommended, this route omits Authorization and
  // x-authenticated-user-token from both outbound calls. Asserting current
  // behavior as-is; not a bug fix.
  it('omits Authorization and x-authenticated-user-token from both outbound requests (documented divergence, L3-17)', async () => {
    mockAxios.post
      .mockResolvedValueOnce(upstreamOk([{ department_name: 'Health' }]))
      .mockResolvedValueOnce(upstreamOk([{ id: 'c4' }]))

    const response = await withOrg(agent().post('/connections/recommended/userDepartment')).send({})

    expect(response.status).toBe(200)
    for (const call of mockAxios.post.mock.calls) {
      const config = call[2]
      expect(config.headers).not.toHaveProperty('Authorization')
      expect(config.headers).not.toHaveProperty('x-authenticated-user-token')
    }
  })
})
