/**
 * PHASE 1 — user/profile-details.ts (275 uncovered).
 *
 * Scope: the simple axios-proxy endpoints. Deliberately OUT of scope for this
 * pass: /createUser (~127 lines), /completeUserInfo, /v2/updateUser,
 * /createUserV2WithRegistry, /createUserV2WithoutRegistry — each is a large
 * multi-step Cassandra + multi-upstream-call flow, not a one-line axios mock;
 * scheduled for Phase 2 with the file's other Cassandra-dependent endpoints.
 *
 * encryptData is mocked because the real module reads AES config from env
 * AT IMPORT TIME and throws if it is absent — same landmine as elsewhere in
 * this codebase, not something this file's own endpoints depend on.
 */

jest.mock('axios')
jest.mock('fs', () => ({ ...jest.requireActual('fs'), readFileSync: jest.fn() }))
jest.mock('cassandra-driver', () => ({ Client: jest.fn(() => ({ execute: jest.fn() })) }))
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/emailHashPasswordGenerator', () => ({ encryptData: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    DECRYPTION_API_BASE: 'https://decrypt.test',
    KONG_API_BASE: 'https://kong.test',
    LEARNER_SERVICE_API_BASE: 'https://learner.test',
    NETWORK_HUB_SERVICE_BACKEND: 'https://hub.test',
    SUNBIRD_PROXY_API_BASE: 'https://sunbird.test',
    TELEMETRY_SB_BASE: 'https://telemetry.test',
    TIMEOUT: '10000',
    USER_PROFILE_API_BASE: 'https://profile.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { profileDeatailsApi } from './profile-details'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(profileDeatailsApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

describe('POST /createUserRegistry', () => {
  it('forwards the created registry', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ id: 'reg-1' }))
    const response = await agent().post('/createUserRegistry').send({ name: 'x' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'reg-1' })
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/createUserRegistry').send({})
    expect(response.status).toBe(500)
  })
})

describe('GET /getUserRegistry', () => {
  it('forwards the registry for the current user', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ userId: 'user-1' }))
    const response = await agent().get('/getUserRegistry')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ userId: 'user-1' })
  })
})

describe('GET /getUserRegistryById/:id', () => {
  it('uses the provided id', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ userId: 'explicit-id' }))
    const response = await agent().get('/getUserRegistryById/explicit-id')
    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      { userId: 'explicit-id' },
      expect.anything()
    )
  })
})

describe('GET /userProfileStatus', () => {
  it('rejects a request missing org/rootOrg headers', async () => {
    const response = await agent().get('/userProfileStatus')
    expect(response.status).toBe(400)
  })

  it('forwards the profile status', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ status: true }))
    const response = await agent()
      .get('/userProfileStatus')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
    expect(response.status).toBe(200)
  })
})

describe('POST /setUserProfileStatus', () => {
  it('forwards the update', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent().post('/setUserProfileStatus').send({ status: true })
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/setUserProfileStatus').send({})
    expect(response.status).toBe(500)
  })
})

describe('GET /getMasterLanguages', () => {
  it('forwards the language list', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk(['en', 'hi']))
    const response = await agent().get('/getMasterLanguages')
    expect(response.status).toBe(200)
    expect(response.body).toEqual(['en', 'hi'])
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/getMasterLanguages')
    expect(response.status).toBe(500)
  })
})

describe('GET /getMasterNationalities', () => {
  it('forwards the nationality list', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk(['IN']))
    const response = await agent().get('/getMasterNationalities')
    expect(response.status).toBe(200)
  })
})

describe('GET /getProfilePageMeta', () => {
  it('forwards the page meta', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ sections: [] }))
    const response = await agent().get('/getProfilePageMeta')
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/getProfilePageMeta')
    expect(response.status).toBe(500)
  })
})
