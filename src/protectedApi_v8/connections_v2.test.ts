/**
 * PHASE 1 — connections_v2.ts (172 uncovered).
 *
 * Line-for-line identical logic to connections.ts, just under /v2/*-prefixed
 * paths and a different export name — confirmed by diffing the two files
 * before writing this. Same test shape, ported directly.
 *
 * PHASE 2 — extended missing-rootorg / missing-userId / upstream-500 branch
 * coverage for every route (98.25% lines). Two lines remain uncovered by
 * design, not oversight:
 *  - Line 20: `getUserRegistryById` in apiEndpoints is defined but never
 *    called by any route in this file — dead code, nothing to invoke.
 *  - Lines 143-144: the `!userId` branch in GET /established/:id, where
 *    userId = req.params.id. Express's default path-to-regexp requires at
 *    least one character for a named param, so req.params.id can never be
 *    falsy for a route that matched — this branch is unreachable via real
 *    HTTP routing and cannot be exercised through the mounted router.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  // connections_v2.ts (unlike connections.ts) uses BOTH of these — they are
  // genuinely different functions, not a v1/v2 rename of the same one.
  extractUserId: jest.fn(() => 'user-1'),
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    KONG_API_BASE: 'https://kong.test',
    NETWORK_HUB_SERVICE_BACKEND: 'https://hub.test',
    SB_API_KEY: 'sb-api-key',
    USER_PROFILE_API_BASE: 'https://profile.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { extractUserId, extractUserIdFromRequest } from '../utils/requestExtract'
import { connectionsV2Api } from './connections_v2'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockExtractUserId = extractUserId as jest.Mock
const mockExtractUserIdFromRequest = extractUserIdFromRequest as jest.Mock
const agent = () => mountRouter(connectionsV2Api)
const withOrg = (req: ReturnType<typeof agent>) => req.set('rootorg', 'r1')

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

/**
 * @description CHANGE 33 regression: all 5 GET routes now funnel through
 * the shared fetchConnectionsList helper. This proves each route calls
 * its OWN distinct upstream endpoint, and that /v2/connections/suggests
 * specifically uses extractUserId (Keycloak claims), not
 * extractUserIdFromRequest (session) like its 4 siblings.
 */
describe('each GET route calls its own distinct endpoint (CHANGE 33)', () => {
  it('/v2/connections/requested calls the requested endpoint', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))
    await withOrg(agent().get('/v2/connections/requested'))
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://kong.test/connections/profile/fetch/requested',
      expect.anything()
    )
  })

  it('/v2/connections/requests/received calls the requests/received endpoint', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))
    await withOrg(agent().get('/v2/connections/requests/received'))
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://kong.test/connections/profile/fetch/requests/received',
      expect.anything()
    )
  })

  it('/v2/connections/established calls the established endpoint', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))
    await withOrg(agent().get('/v2/connections/established'))
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://kong.test/connections/profile/fetch/established',
      expect.anything()
    )
  })

  it('/v2/connections/established/:id calls the established endpoint with the path param as userId', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))
    await withOrg(agent().get('/v2/connections/established/user-99'))
    const callArgs = mockAxios.get.mock.calls[0]
    expect(callArgs[0]).toBe('https://kong.test/connections/profile/fetch/established')
    expect(callArgs[1].headers.userId).toBe('user-99')
  })

  it('/v2/connections/suggests calls the suggests endpoint using extractUserId, not extractUserIdFromRequest', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))
    mockExtractUserId.mockReturnValueOnce('keycloak-user')
    await withOrg(agent().get('/v2/connections/suggests'))
    const callArgs = mockAxios.get.mock.calls[0]
    expect(callArgs[0]).toBe('https://kong.test/connections/profile/find/suggests')
    expect(callArgs[1].headers.userId).toBe('keycloak-user')
    expect(mockExtractUserId).toHaveBeenCalled()
    expect(mockExtractUserIdFromRequest).not.toHaveBeenCalled()
  })
})

describe('GET /v2/connections/requested', () => {
  it('forwards the requested connections', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'c1' }]))
    const response = await withOrg(agent().get('/v2/connections/requested'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'c1' }])
  })

  it('rejects a request missing the rootorg header', async () => {
    const response = await agent().get('/v2/connections/requested')
    expect(response.status).toBe(400)
  })

  it('rejects a request when the user id cannot be resolved', async () => {
    mockExtractUserIdFromRequest.mockReturnValueOnce('')
    const response = await withOrg(agent().get('/v2/connections/requested'))
    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/v2/connections/requested'))
    expect(response.status).toBe(500)
  })
})

describe('GET /v2/connections/requests/received', () => {
  it('forwards received requests', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'c1' }]))
    const response = await withOrg(agent().get('/v2/connections/requests/received'))
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootorg', async () => {
    const response = await agent().get('/v2/connections/requests/received')
    expect(response.status).toBe(400)
  })

  it('rejects a request when the user id cannot be resolved', async () => {
    mockExtractUserIdFromRequest.mockReturnValueOnce('')
    const response = await withOrg(agent().get('/v2/connections/requests/received'))
    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/v2/connections/requests/received'))
    expect(response.status).toBe(500)
  })
})

describe('GET /connections/established', () => {
  it('forwards established connections', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'c1' }]))
    const response = await withOrg(agent().get('/v2/connections/established'))
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/v2/connections/established'))
    expect(response.status).toBe(500)
  })

  it('rejects a request missing the rootorg header', async () => {
    const response = await agent().get('/v2/connections/established')
    expect(response.status).toBe(400)
  })

  it('rejects a request when the user id cannot be resolved', async () => {
    mockExtractUserIdFromRequest.mockReturnValueOnce('')
    const response = await withOrg(agent().get('/v2/connections/established'))
    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })
})

describe('GET /connections/established/:id', () => {
  it('forwards a single established connection', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'c1' }))
    const response = await withOrg(agent().get('/v2/connections/established/c1'))
    expect(response.status).toBe(200)
  })

  it('rejects a request missing the rootorg header', async () => {
    const response = await agent().get('/v2/connections/established/c1')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/v2/connections/established/c1'))
    expect(response.status).toBe(500)
  })
})

describe('GET /v2/connections/suggests', () => {
  it('forwards suggested connections', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'c2' }]))
    const response = await withOrg(agent().get('/v2/connections/suggests'))
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootorg', async () => {
    const response = await agent().get('/v2/connections/suggests')
    expect(response.status).toBe(400)
  })

  it('rejects a request when the user id cannot be resolved', async () => {
    mockExtractUserId.mockReturnValueOnce('')
    const response = await withOrg(agent().get('/v2/connections/suggests'))
    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/v2/connections/suggests'))
    expect(response.status).toBe(500)
  })
})

describe('POST /add/connection', () => {
  const body = {
    userDepartmentFrom: 'd1',
    userDepartmentTo: 'd2',
    userIdTo: 'u2',
    userNameFrom: 'A',
    userNameTo: 'B',
  }

  it('adds the connection', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ added: true }))
    const response = await withOrg(agent().post('/v2/add/connection')).send(body)
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootorg', async () => {
    const response = await agent().post('/v2/add/connection').send(body)
    expect(response.status).toBe(400)
  })

  it('rejects a request missing required body fields', async () => {
    const response = await withOrg(agent().post('/v2/add/connection')).send({})
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/v2/add/connection')).send(body)
    expect(response.status).toBe(500)
  })
})

describe('POST /update/connection', () => {
  const body = {
    status: 'accepted',
    userDepartmentFrom: 'd1',
    userDepartmentTo: 'd2',
    userIdTo: 'u2',
    userNameFrom: 'A',
    userNameTo: 'B',
  }

  it('updates the connection', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await withOrg(agent().post('/v2/update/connection')).send(body)
    expect(response.status).toBe(200)
  })

  it('rejects a request missing required body fields', async () => {
    const response = await withOrg(agent().post('/v2/update/connection')).send({})
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('rejects a request missing the rootorg header', async () => {
    const response = await agent().post('/v2/update/connection').send(body)
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/v2/update/connection')).send(body)
    expect(response.status).toBe(500)
  })
})

describe('POST /connections/recommended', () => {
  it('forwards recommended connections', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([{ id: 'c3' }]))
    const response = await withOrg(agent().post('/v2/connections/recommended')).send({})
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/v2/connections/recommended')).send({})
    expect(response.status).toBe(500)
  })

  it('rejects a request missing the rootorg header', async () => {
    const response = await agent().post('/v2/connections/recommended').send({})
    expect(response.status).toBe(400)
  })

  it('rejects a request when the user id cannot be resolved', async () => {
    mockExtractUserId.mockReturnValueOnce('')
    const response = await withOrg(agent().post('/v2/connections/recommended')).send({})
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })
})

describe('POST /v2/connections/recommended/userDepartment', () => {
  it('looks up the department then forwards recommended connections', async () => {
    mockAxios.post
      .mockResolvedValueOnce(
        upstreamOk({
          result: { response: { content: [{ organisations: [{ orgName: 'Dept A' }] }] } },
        })
      )
      .mockResolvedValueOnce(upstreamOk([{ id: 'c4' }]))

    const response = await withOrg(agent().post('/v2/connections/recommended/userDepartment')).send({})

    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledTimes(2)
  })

  it('rejects when the department lookup returns no organisations', async () => {
    mockAxios.post.mockResolvedValueOnce(
      upstreamOk({ result: { response: { content: [{ organisations: [] }] } } })
    )
    const response = await withOrg(agent().post('/v2/connections/recommended/userDepartment')).send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 when the department lookup fails', async () => {
    mockAxios.post.mockRejectedValueOnce(networkError())
    const response = await withOrg(agent().post('/v2/connections/recommended/userDepartment')).send({})
    expect(response.status).toBe(500)
  })

  it('rejects a request missing the rootorg header', async () => {
    const response = await agent().post('/v2/connections/recommended/userDepartment').send({})
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('rejects a request when the user id cannot be resolved', async () => {
    mockExtractUserId.mockReturnValueOnce('')
    const response = await withOrg(agent().post('/v2/connections/recommended/userDepartment')).send({})
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })
})
