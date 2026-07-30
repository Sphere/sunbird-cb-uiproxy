/**
 * PHASE 1 — connections.ts (161 uncovered). Pure axios-proxy shape, gated by
 * a `rootorg` header and a resolvable userId.
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
    NETWORK_HUB_SERVICE_BACKEND: 'https://hub.test',
    SB_API_KEY: 'sb-api-key',
    USER_PROFILE_API_BASE: 'https://profile.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { connectionsApi } from './connections'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(connectionsApi)
const withOrg = (req: ReturnType<typeof agent>) => req.set('rootorg', 'r1')

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

describe('GET /connections/requested', () => {
  it('forwards the requested connections', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'c1' }]))
    const response = await withOrg(agent().get('/connections/requested'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'c1' }])
  })

  it('rejects a request missing the rootorg header', async () => {
    const response = await agent().get('/connections/requested')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/connections/requested'))
    expect(response.status).toBe(500)
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
})

describe('GET /connections/established', () => {
  it('forwards established connections', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'c1' }]))
    const response = await withOrg(agent().get('/connections/established'))
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/connections/established'))
    expect(response.status).toBe(500)
  })
})

describe('GET /connections/established/:id', () => {
  it('forwards a single established connection', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'c1' }))
    const response = await withOrg(agent().get('/connections/established/c1'))
    expect(response.status).toBe(200)
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
    const response = await withOrg(agent().post('/add/connection')).send(body)
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootorg', async () => {
    const response = await agent().post('/add/connection').send(body)
    expect(response.status).toBe(400)
  })

  it('rejects a request missing required body fields', async () => {
    const response = await withOrg(agent().post('/add/connection')).send({})
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/add/connection')).send(body)
    expect(response.status).toBe(500)
  })
})

describe('POST /update/connection', () => {
  it('updates the connection', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await withOrg(agent().post('/update/connection')).send({
      status: 'accepted',
      userDepartmentFrom: 'd1',
      userDepartmentTo: 'd2',
      userIdTo: 'u2',
      userNameFrom: 'A',
      userNameTo: 'B',
    })
    expect(response.status).toBe(200)
  })

  it('rejects a request missing required body fields', async () => {
    const response = await withOrg(agent().post('/update/connection')).send({})
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })
})

describe('POST /connections/recommended', () => {
  it('forwards recommended connections', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([{ id: 'c3' }]))
    const response = await withOrg(agent().post('/connections/recommended')).send({})
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/connections/recommended')).send({})
    expect(response.status).toBe(500)
  })
})

describe('POST /connections/recommended/userDepartment', () => {
  it('forwards recommended department connections', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ department: 'd1' }))
    mockAxios.post.mockResolvedValue(upstreamOk([{ id: 'c4' }]))
    const response = await withOrg(agent().post('/connections/recommended/userDepartment')).send({})
    expect(response.status).toBe(200)
  })
})
