/**
 * PHASE 2 — user/details.ts. Four routes plus one exported helper
 * (`wTokenApiMock`, used by admin/userRegistration.ts) that uses the legacy
 * `request` library's callback style, not axios. `GET /` delegates to real
 * helpers from sibling files (`getRoles`/`getUserStatus` from portal-v3.ts,
 * `getProfileStatus` from profile-registry.ts) — mocked as modules here
 * rather than exercised for real, since they're independently tested
 * elsewhere. `wTokenApiMock` also calls `getUserByEmail`/
 * `createDiscussionHubUser` (discussionHub/users.ts, writeApi.ts) — both
 * documented elsewhere (docs/PROD-VERIFICATION.md sections N/O) as broken
 * (`return async () => {...}` never invoked); mocked directly here so this
 * file's own tests aren't coupled to that separate, already-documented bug.
 *
 * Real bug found (documented in docs/PROD-VERIFICATION.md, NOT reproduced
 * live): `GET /detailV2`'s catch block does `res.status(500).send(err.response.data)`
 * with NO guard — a network-level rejection (no `.response`) throws
 * `TypeError: Cannot read properties of undefined (reading 'data')` INSIDE
 * the catch block itself, an unhandled rejection with no response ever sent.
 */

jest.mock('axios')
jest.mock('request')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../portal-v3', () => ({
  getRoles: jest.fn(async () => ['PUBLIC']),
  getUserStatus: jest.fn(async () => true),
}))
jest.mock('./profile-registry', () => ({
  getProfileStatus: jest.fn(async () => true),
}))
jest.mock('../discussionHub/users', () => ({
  getUserByEmail: jest.fn(),
}))
jest.mock('../discussionHub/writeApi', () => ({
  createDiscussionHubUser: jest.fn(),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    DEFAULT_ORG: 'igot',
    DEFAULT_ROOT_ORG: 'igot',
    DISCUSSION_HUB_DEFAULT_PASSWORD: 'nbb-pass',
    USER_PROFILE_API_BASE: 'https://profile.test',
  },
}))

import axios from 'axios'
import request from 'request'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { getUserByEmail } from '../discussionHub/users'
import { createDiscussionHubUser } from '../discussionHub/writeApi'
import { getRoles, getUserStatus } from '../portal-v3'
import { getProfileStatus } from './profile-registry'
import { detailsApi, wTokenApiMock } from './details'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockRequestPost = request.post as unknown as jest.Mock
const mockGetRoles = getRoles as jest.Mock
const mockGetUserStatus = getUserStatus as jest.Mock
const mockGetProfileStatus = getProfileStatus as jest.Mock
const mockGetUserByEmail = getUserByEmail as jest.Mock
const mockCreateDiscussionHubUser = createDiscussionHubUser as jest.Mock

const agent = () => mountRouter(detailsApi)

beforeEach(() => {
  mockAxios.post.mockReset()
  mockRequestPost.mockReset()
  mockGetRoles.mockReset().mockResolvedValue(['PUBLIC'])
  mockGetUserStatus.mockReset().mockResolvedValue(true)
  mockGetProfileStatus.mockReset().mockResolvedValue(true)
  mockGetUserByEmail.mockReset()
  mockCreateDiscussionHubUser.mockReset()
})

describe('GET /', () => {
  it('aggregates roles, profile status, and active status', async () => {
    const response = await agent().get('/').set('org', 'o1').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      group: [],
      isActive: true,
      profileDetailsStatus: true,
      roles: ['PUBLIC'],
      tncStatus: true,
    })
  })

  it('rejects a request missing org/rootOrg', async () => {
    const response = await agent().get('/')
    expect(response.status).toBe(400)
  })

  it('returns 500 when an upstream helper throws', async () => {
    mockGetRoles.mockRejectedValue(new Error('boom'))
    const response = await agent().get('/').set('org', 'o1').set('rootOrg', 'r1')
    expect(response.status).toBe(500)
  })
})

describe('POST /managerDetails', () => {
  it('forwards manager details', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ manager: 'm1' }))
    const response = await agent().post('/managerDetails').set('rootOrg', 'r1').send({})
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/managerDetails').send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/managerDetails').set('rootOrg', 'r1').send({})
    expect(response.status).toBe(500)
  })
})

describe('POST /detailV1', () => {
  it('forwards a lookup by email', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ result: { response: [] } }))
    const response = await agent().post('/detailV1').set('rootOrg', 'r1').send({ email: 'a@b.com' })
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/detailV1').send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/detailV1').set('rootOrg', 'r1').send({})
    expect(response.status).toBe(500)
  })
})

describe('GET /detailV2', () => {
  it('forwards a lookup by the current user', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ result: { response: [] } }))
    const response = await agent().get('/detailV2').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/detailV2')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure that carries a response body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(502, { error: 'upstream down' }))
    const response = await agent().get('/detailV2').set('rootOrg', 'r1')
    expect(response.status).toBe(500)
  })

  // NOTE: a network-level failure (no err.response) is a documented hang bug
  // here — the catch block itself throws on `err.response.data`. Not
  // reproduced live. See docs/PROD-VERIFICATION.md.
})

describe('wTokenApiMock', () => {
  const req = {
    body: { department: 'IT' },
    header: () => undefined,
  }

  it('resolves the wtoken body when the user already exists in DiscussionHub', async () => {
    mockRequestPost.mockImplementation((_url, _options, callback) => {
      callback(null, {}, { user: { email: 'a@b.com', first_name: 'A', last_name: 'B', wid: 'w1' } })
    })
    mockGetUserByEmail.mockResolvedValue({ id: 'nbb-1' })
    const result = await wTokenApiMock(req, 'kc-token')
    expect(result).toEqual({ user: { email: 'a@b.com', first_name: 'A', last_name: 'B', wid: 'w1' } })
    expect(mockCreateDiscussionHubUser).not.toHaveBeenCalled()
  })

  it('resolves the wtoken body directly when there is no user in the response body', async () => {
    mockRequestPost.mockImplementation((_url, _options, callback) => {
      callback(null, {}, {})
    })
    const result = await wTokenApiMock(req, 'kc-token')
    expect(result).toEqual({})
  })

  it('rejects when the request library reports an error', async () => {
    mockRequestPost.mockImplementation((_url, _options, callback) => {
      callback(new Error('connect ECONNREFUSED'), {}, {})
    })
    await expect(wTokenApiMock(req, 'kc-token')).rejects.toThrow('connect ECONNREFUSED')
  })

  it('creates a DiscussionHub user when a 404 shows the user is missing, resolving even if creation fails', async () => {
    mockRequestPost.mockImplementation((_url, _options, callback) => {
      callback(null, {}, { user: { email: 'a@b.com', first_name: 'A', last_name: 'B', wid: 'w1' } })
    })
    mockGetUserByEmail.mockRejectedValue({ response: { status: 404 } })
    mockCreateDiscussionHubUser.mockRejectedValue(new Error('create failed'))
    const result = await wTokenApiMock(req, 'kc-token')
    expect(result).toEqual({ user: { email: 'a@b.com', first_name: 'A', last_name: 'B', wid: 'w1' } })
    expect(mockCreateDiscussionHubUser).toHaveBeenCalledWith({
      email: 'a@b.com',
      fullname: 'A B',
      password: 'nbb-pass',
      username: 'w1',
    })
  })

  // Covers the outer try/catch of wTokenApiMock (details.ts lines 176-179):
  // a request object with no `body` throws synchronously when the code
  // reads `req.body.department`, which is caught inside the same
  // try/catch and rejects the promise (with `reject()`, no argument) —
  // no double-send, no crash. Safe to test live.
  it('rejects when building the request options throws synchronously', async () => {
    const bodylessReq = { header: () => undefined }
    await expect(wTokenApiMock(bodylessReq, 'kc-token')).rejects.toBeUndefined()
  })
})
