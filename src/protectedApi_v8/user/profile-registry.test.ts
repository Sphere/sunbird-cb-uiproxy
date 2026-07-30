/**
 * PHASE 1 — user/profile-registry.ts (179 uncovered).
 *
 * Standard axios-proxy shapes, plus three endpoints that read local JSON via
 * fs.readFile (callback style) rather than calling upstream. Scope: covers
 * all of these; /createUserRegistryV2/:userId (a near-duplicate of
 * /createUserRegistry further down the file) was not reached in this pass.
 */

jest.mock('axios')
jest.mock('fs', () => ({ readFile: jest.fn() }))
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: { NETWORK_HUB_SERVICE_BACKEND: 'https://hub.test' },
}))

import axios from 'axios'
import fs from 'fs'
import { networkError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { profileRegistryApi } from './profile-registry'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockReadFile = fs.readFile as unknown as jest.Mock
const agent = () => mountRouter(profileRegistryApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
  mockReadFile.mockReset()
})

describe('POST /createUserRegistry', () => {
  it('creates a new registry when none exists', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ result: { UserProfile: [] } }))
    mockAxios.post.mockResolvedValue(upstreamOk({ id: 'reg-1' }))

    const response = await agent().post('/createUserRegistry').send({ name: 'x' })

    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/v1/user/create/profile'),
      expect.anything(),
      expect.anything()
    )
  })

  it('updates the existing registry when one is found', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({ result: { UserProfile: [{ osid: 'existing' }] } })
    )
    mockAxios.post.mockResolvedValue(upstreamOk({ updated: true }))

    const response = await agent().post('/createUserRegistry').send({ name: 'x' })

    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/v1/user/update/profile'),
      expect.anything(),
      expect.anything()
    )
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().post('/createUserRegistry').send({})
    expect(response.status).toBe(500)
  })
})

describe('POST /updateUserRegistry', () => {
  it('updates the registry', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent().post('/updateUserRegistry').send({ name: 'x' })
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/updateUserRegistry').send({})
    expect(response.status).toBe(500)
  })
})

describe('POST /updateUserWorkflowRegistry', () => {
  it('updates the workflow registry', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent().post('/updateUserWorkflowRegistry').send({})
    expect(response.status).toBe(200)
  })
})

describe('GET /getUserRegistry/:osid', () => {
  it('returns the registry for the given osid', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ osid: 'os-1' }))
    const response = await agent().get('/getUserRegistry/os-1')
    expect(response.status).toBe(200)
  })
})

describe('GET /getUserRegistryById', () => {
  it("returns the current user's registry", async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ userId: 'user-1' }))
    const response = await agent().get('/getUserRegistryById')
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/getUserRegistryById')
    expect(response.status).toBe(500)
  })
})

describe('POST /searchUserRegistry', () => {
  it('searches the registry', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([{ userId: 'user-1' }]))
    const response = await agent().post('/searchUserRegistry').send({ query: 'x' })
    expect(response.status).toBe(200)
  })
})

describe('GET /getUserRegistryByUser/:id', () => {
  it('uses the provided id', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ userId: 'explicit-id' }))
    const response = await agent().get('/getUserRegistryByUser/explicit-id')
    expect(response.status).toBe(200)
  })
})

describe('GET /getMasterNationalities', () => {
  it('returns nationalities from the static file', async () => {
    mockReadFile.mockImplementation((_path, cb) =>
      cb(null, JSON.stringify(['IN', 'US']))
    )
    const response = await agent().get('/getMasterNationalities')
    expect(response.status).toBe(200)
    expect(response.body).toEqual(['IN', 'US'])
  })
})

describe('GET /getMasterLanguages', () => {
  it('returns languages mapped to { name } objects', async () => {
    mockReadFile.mockImplementation((_path, cb) =>
      cb(null, JSON.stringify({ languages: ['English', 'Hindi'] }))
    )
    const response = await agent().get('/getMasterLanguages')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ languages: [{ name: 'English' }, { name: 'Hindi' }] })
  })
})

describe('GET /getProfilePageMeta', () => {
  it('returns the profile page meta from the static file', async () => {
    mockReadFile.mockImplementation((_path, cb) =>
      cb(null, JSON.stringify({ sections: ['personal'] }))
    )
    const response = await agent().get('/getProfilePageMeta')
    expect(response.status).toBe(200)
  })
})
