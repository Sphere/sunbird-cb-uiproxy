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
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { networkConnectionApi } from './network'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(networkConnectionApi)
const withOrg = (req: ReturnType<typeof agent>) => req.set('rootorg', 'r1')

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
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

  it('rejects a request missing rootorg', async () => {
    const response = await agent().get('/connections/established')
    expect(response.status).toBe(400)
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

  it('rejects a request missing rootorg', async () => {
    const response = await agent().get('/connections/established/c1')
    expect(response.status).toBe(400)
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

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/add/connection')).send({ connectionId: 'c1' })
    expect(response.status).toBe(500)
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
})
