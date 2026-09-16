/**
 * PHASE 1 — user/profile-registry.ts (179 uncovered).
 *
 * Standard axios-proxy shapes, plus three endpoints that read local JSON via
 * fs.readFile (callback style) rather than calling upstream.
 * /createUserRegistryV2/:userId shares its implementation with
 * /createUserRegistry via createOrUpdateUserRegistry(); both are covered
 * below.
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
import {
  degreesMeta,
  designationMeta,
  getProfileStatus,
  govtOrgMeta,
  industreisMeta,
  profileRegistryApi,
  statesMeta,
} from './profile-registry'

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

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/updateUserWorkflowRegistry').send({})
    expect(response.status).toBe(500)
  })
})

describe('GET /getUserRegistry/:osid', () => {
  it('returns the registry for the given osid', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ osid: 'os-1' }))
    const response = await agent().get('/getUserRegistry/os-1')
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().get('/getUserRegistry/os-1')
    expect(response.status).toBe(500)
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

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/searchUserRegistry').send({ query: 'x' })
    expect(response.status).toBe(500)
  })
})

describe('GET /getUserRegistryByUser/:id', () => {
  it('uses the provided id', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ userId: 'explicit-id' }))
    const response = await agent().get('/getUserRegistryByUser/explicit-id')
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/getUserRegistryByUser/explicit-id')
    expect(response.status).toBe(500)
  })

  // The `if (!userId) userId = extractUserIdFromRequest(req)` fallback (line
  // 186) is not covered here: Express's default param matcher for `:id`
  // never produces an empty-string match, so there is no HTTP request that
  // reaches this handler with a falsy `req.params.id`. Left uncovered rather
  // than forced.
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

  it('returns 500 when the static file contains invalid JSON', async () => {
    // fs.readFile's callback runs synchronously inside our mock, so
    // JSON.parse throwing here is caught by the handler's own try/catch
    // (single res.status(500).send, no double-send / hang risk).
    mockReadFile.mockImplementation((_path, cb) => cb(null, 'not-json'))
    const response = await agent().get('/getMasterNationalities')
    expect(response.status).toBe(500)
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

  it('returns 500 when the static file contains invalid JSON', async () => {
    mockReadFile.mockImplementation((_path, cb) => cb(null, 'not-json'))
    const response = await agent().get('/getMasterLanguages')
    expect(response.status).toBe(500)
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

  // The five `.catch(...)` handlers (govtOrgMeta/industreisMeta/degreesMeta/
  // designationMeta/statesMeta) and the outer catch are not reachable from
  // this route: each `xMeta()` call is an `async function` that just returns
  // an inner arrow function without invoking it or awaiting anything that
  // can reject, so `govtOrgMeta().catch(...)` etc. can never actually settle
  // to a rejection. Those functions' real bodies are covered directly below
  // instead (see `describe('govtOrgMeta', ...)` etc.).
})

describe('POST /createUserRegistryV2/:userId', () => {
  it('creates a new registry when none exists', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ result: { UserProfile: [] } }))
    mockAxios.post.mockResolvedValue(upstreamOk({ id: 'reg-1' }))

    const response = await agent()
      .post('/createUserRegistryV2/user-2')
      .send({ name: 'x' })

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

    const response = await agent()
      .post('/createUserRegistryV2/user-2')
      .send({ name: 'x' })

    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/v1/user/update/profile'),
      expect.anything(),
      expect.anything()
    )
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().post('/createUserRegistryV2/user-2').send({})
    expect(response.status).toBe(500)
  })
})

/**
 * govtOrgMeta / industreisMeta / degreesMeta / statesMeta / designationMeta
 * are exported directly, so their real bodies (unreachable through
 * /getProfilePageMeta, see comment above) are exercised here as plain unit
 * calls: `await xMeta()` returns an inner arrow function, which is then
 * invoked and awaited itself.
 *
 * Note: none of these inner arrow functions have a trailing return after
 * `await fs.readFile(...)` — the object built inside the readFile callback
 * is computed and then discarded. So every case here resolves `undefined`;
 * what differs per test is which branch of the callback (and its
 * surrounding try/catch) actually executes.
 */
describe('govtOrgMeta', () => {
  it('runs the success branch of the readFile callback', async () => {
    mockReadFile.mockImplementation((_path, cb) =>
      cb(null, JSON.stringify({ cadre: ['C1'], ministries: ['M1'], services: ['S1'] }))
    )
    const fn = await govtOrgMeta()
    await expect(fn()).resolves.toBeUndefined()
  })

  it('runs the error branch of the readFile callback', async () => {
    mockReadFile.mockImplementation((_path, cb) => cb(new Error('read fail'), null))
    const fn = await govtOrgMeta()
    await expect(fn()).resolves.toBeUndefined()
  })

  it('propagates a synchronous readFile throw', async () => {
    mockReadFile.mockImplementation(() => {
      throw new Error('boom')
    })
    const fn = await govtOrgMeta()
    await expect(fn()).rejects.toThrow('boom')
  })
})

describe('industreisMeta', () => {
  it('runs the success branch of the readFile callback', async () => {
    mockReadFile.mockImplementation((_path, cb) =>
      cb(null, JSON.stringify({ industries: ['IT'] }))
    )
    const fn = await industreisMeta()
    await expect(fn()).resolves.toBeUndefined()
  })

  it('runs the error branch of the readFile callback', async () => {
    mockReadFile.mockImplementation((_path, cb) => cb(new Error('read fail'), null))
    const fn = await industreisMeta()
    await expect(fn()).resolves.toBeUndefined()
  })

  it('propagates a synchronous readFile throw', async () => {
    mockReadFile.mockImplementation(() => {
      throw new Error('boom')
    })
    const fn = await industreisMeta()
    await expect(fn()).rejects.toThrow('boom')
  })
})

describe('degreesMeta', () => {
  it('runs the success branch of the readFile callback', async () => {
    mockReadFile.mockImplementation((_path, cb) =>
      cb(null, JSON.stringify({ graduations: ['B.Tech'], postGraduations: ['M.Tech'] }))
    )
    const fn = await degreesMeta()
    await expect(fn()).resolves.toBeUndefined()
  })

  it('runs the error branch of the readFile callback', async () => {
    mockReadFile.mockImplementation((_path, cb) => cb(new Error('read fail'), null))
    const fn = await degreesMeta()
    await expect(fn()).resolves.toBeUndefined()
  })

  it('propagates a synchronous readFile throw', async () => {
    mockReadFile.mockImplementation(() => {
      throw new Error('boom')
    })
    const fn = await degreesMeta()
    await expect(fn()).rejects.toThrow('boom')
  })
})

describe('statesMeta', () => {
  it('runs the success branch of the readFile callback', async () => {
    // statesMeta reads `obj.industries` (not `obj.states`) in the real code.
    mockReadFile.mockImplementation((_path, cb) =>
      cb(null, JSON.stringify({ industries: ['State1'] }))
    )
    const fn = await statesMeta()
    await expect(fn()).resolves.toBeUndefined()
  })

  it('runs the error branch of the readFile callback', async () => {
    mockReadFile.mockImplementation((_path, cb) => cb(new Error('read fail'), null))
    const fn = await statesMeta()
    await expect(fn()).resolves.toBeUndefined()
  })

  it('propagates a synchronous readFile throw', async () => {
    mockReadFile.mockImplementation(() => {
      throw new Error('boom')
    })
    const fn = await statesMeta()
    await expect(fn()).rejects.toThrow('boom')
  })
})

describe('designationMeta', () => {
  it('runs the success branch of the readFile callback', async () => {
    mockReadFile.mockImplementation((_path, cb) =>
      cb(null, JSON.stringify({ designations: ['Officer'], gradePay: ['GP1'] }))
    )
    const fn = await designationMeta()
    await expect(fn()).resolves.toBeUndefined()
  })

  it('runs the error branch of the readFile callback', async () => {
    mockReadFile.mockImplementation((_path, cb) => cb(new Error('read fail'), null))
    const fn = await designationMeta()
    await expect(fn()).resolves.toBeUndefined()
  })

  it('propagates a synchronous readFile throw', async () => {
    mockReadFile.mockImplementation(() => {
      throw new Error('boom')
    })
    const fn = await designationMeta()
    await expect(fn()).rejects.toThrow('boom')
  })
})

describe('getProfileStatus', () => {
  it('returns false when the upstream response has no UserProfile', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ result: {} }))
    await expect(getProfileStatus('user-1')).resolves.toBe(false)
  })

  it('returns false when UserProfile is empty', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ result: { UserProfile: [] } }))
    await expect(getProfileStatus('user-1')).resolves.toBe(false)
  })

  it('returns false when the returned profile belongs to a different user', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({ result: { UserProfile: [{ userId: 'someone-else' }] } })
    )
    await expect(getProfileStatus('user-1')).resolves.toBe(false)
  })

  it('returns false when personalDetails is entirely missing', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({ result: { UserProfile: [{ userId: 'user-1' }] } })
    )
    await expect(getProfileStatus('user-1')).resolves.toBe(false)
  })

  it('returns false when a required personalDetails field is missing', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({
        result: {
          UserProfile: [
            {
              personalDetails: { firstname: 'A' },
              userId: 'user-1',
            },
          ],
        },
      })
    )
    await expect(getProfileStatus('user-1')).resolves.toBe(false)
  })

  it('returns true when every required personalDetails field is present', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({
        result: {
          UserProfile: [
            {
              personalDetails: {
                category: 'gen',
                dob: '2000-01-01',
                domicileMedium: 'en',
                firstname: 'A',
                gender: 'f',
                maritalStatus: 'single',
                mobile: '123',
                nationality: 'IN',
                pincode: '110001',
                postalAddress: 'addr',
                primaryEmail: 'a@b.com',
                surname: 'B',
              },
              userId: 'user-1',
            },
          ],
        },
      })
    )
    await expect(getProfileStatus('user-1')).resolves.toBe(true)
  })

  it('returns false on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    await expect(getProfileStatus('user-1')).resolves.toBe(false)
  })
})
