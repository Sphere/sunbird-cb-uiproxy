/**
 * network-hub.ts — a single route, POST /users.
 *
 * extractUserIdFromRequest(req) is called BEFORE the try/catch (unlike the
 * sibling files where the equivalent call sits inside try), so its real
 * implementation (which reads req.session.userId when no `wid` header is
 * present) is mocked wholesale here rather than exercised live — mountRouter()
 * installs no session by default, and a real call would throw outside any
 * try/catch, which the safety rule treats as a hang/crash hazard.
 *
 * The handler validates the `rootOrg` header first (400 + return, no
 * fall-through), builds a request body with defaults for department,
 * intervalInDays, limit, offset and type, then calls axios.post() directly
 * (not the callable axios({...}) form). Its catch block mirrors the
 * catalog.ts/network.ts shape but forwards the raw `err` object (not a
 * generic message) when the failure carries no upstream response.
 */

jest.mock('axios')
jest.mock('../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    USER_PROFILE_API_BASE: 'https://profile.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { networkHubApi } from './network-hub'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(networkHubApi)
const withOrg = (req: ReturnType<typeof agent>) => req.set('rootOrg', 'org1')

beforeEach(() => {
  mockAxios.post.mockReset()
})

/**
 * @description Verifies that POST /users requires the rootOrg header (400 +
 * ERROR_NO_ORG_DATA, no upstream call made), builds the outgoing request
 * body with defaults for omitted fields (falling back to caller-supplied
 * values when present), forwards the upstream response on success, and maps
 * upstream/transport failures from axios.post to the appropriate error
 * status and body.
 */
describe('POST /users', () => {
  it('should reject a request with no rootOrg header', async () => {
    const response = await agent().post('/users').send({})

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('should forward the upstream status and body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ users: [{ id: 'u1' }] }))

    const response = await withOrg(agent().post('/users')).send({})

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ users: [{ id: 'u1' }] })
  })

  it('should default department, intervalInDays, limit, offset and type when omitted from the body', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    await withOrg(agent().post('/users')).send({})

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://profile.test/public/v8/networkHub/users',
      {
        department: '',
        intervalInDays: 7,
        limit: 20,
        offset: 0,
        type: 'latestUsers',
        userId: 'user-1',
      },
      expect.objectContaining({ headers: { rootOrg: 'org1' } })
    )
  })

  it('should use caller-supplied department, intervalInDays, limit, offset and type when provided', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    await withOrg(agent().post('/users')).send({
      department: 'engineering',
      intervalInDays: 30,
      limit: 5,
      offset: 10,
      type: 'topUsers',
    })

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://profile.test/public/v8/networkHub/users',
      {
        department: 'engineering',
        intervalInDays: 30,
        limit: 5,
        offset: 10,
        type: 'topUsers',
        userId: 'user-1',
      },
      expect.objectContaining({ headers: { rootOrg: 'org1' } })
    )
  })

  it('should forward an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))

    const response = await withOrg(agent().post('/users')).send({})

    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('should fall back to 500 with the raw error when the failure carries no upstream response', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await withOrg(agent().post('/users')).send({})

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ isAxiosError: true })
  })
})
