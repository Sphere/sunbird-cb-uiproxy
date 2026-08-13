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
 *
 * PHASE 2 — picks up the routes Phase 1 deliberately left out: /createUser,
 * /completeUserInfo, /v2/updateUser, /createUserV2WithRegistry,
 * /createUserV2WithoutRegistry, /createUserWithoutInvitationEmail, and the
 * fs.readFile-based /migrateRegistry. The generic `axios({...})` call style
 * these routes use (rather than axios.get/post) is mocked via the default
 * export mock directly (`mockAxios.mockResolvedValueOnce(...)`), chained per
 * sequential upstream call — same pattern already used in rcEvents.test.ts
 * and history.test.ts. The fs mock gained a `readFile` (callback-style) stub
 * matching the established pattern in profile-registry.test.ts, since
 * /migrateRegistry is the only route in this file using fs.readFile.
 * The cassandra-driver mock now exposes a shared, resettable `mockCassandraExecute`
 * so /v2/updateUser's Cassandra insert can be driven to both succeed and fail
 * — no existing test in this file depended on the previous fixed shape.
 */

jest.mock('axios')
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFile: jest.fn(),
  readFileSync: jest.fn(),
}))
const mockCassandraExecute = jest.fn()
jest.mock('cassandra-driver', () => ({
  Client: jest.fn(() => ({ execute: mockCassandraExecute })),
}))
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
import fs from 'fs'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { profileDeatailsApi } from './profile-details'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockReadFile = fs.readFile as unknown as jest.Mock
const agent = () => mountRouter(profileDeatailsApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
  ;(mockAxios as unknown as jest.Mock).mockReset()
  mockReadFile.mockReset()
  mockCassandraExecute.mockReset()
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

  it('forwards the upstream status and body on an upstream HTTP error', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/getUserRegistry')
    expect(response.status).toBe(404)
  })

  it('returns 500 on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().get('/getUserRegistry')
    expect(response.status).toBe(500)
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

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().get('/getUserRegistryById/explicit-id')
    expect(response.status).toBe(500)
  })
})

describe('GET /userProfileStatus', () => {
  it('rejects a request missing org/rootOrg headers', async () => {
    const response = await agent().get('/userProfileStatus')
    expect(response.status).toBe(400)
  })

  it('rejects a request missing only the org header', async () => {
    const response = await agent().get('/userProfileStatus').set('rootOrg', 'r1')
    expect(response.status).toBe(400)
  })

  it('rejects a request missing only the rootOrg header', async () => {
    const response = await agent().get('/userProfileStatus').set('org', 'o1')
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

  it('forwards the upstream status and body on an upstream HTTP error', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(403, { error: 'forbidden' }))
    const response = await agent()
      .get('/userProfileStatus')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
    expect(response.status).toBe(403)
  })

  it('returns 500 on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent()
      .get('/userProfileStatus')
      .set('org', 'o1')
      .set('rootOrg', 'r1')
    expect(response.status).toBe(500)
  })
})

describe('POST /setUserProfileStatus', () => {
  it('forwards the update', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent().post('/setUserProfileStatus').send({ status: true })
    expect(response.status).toBe(200)
  })

  it('forwards the upstream status and body on an upstream HTTP error', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(422, { error: 'invalid' }))
    const response = await agent().post('/setUserProfileStatus').send({})
    expect(response.status).toBe(422)
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

  it('forwards an empty nationality list', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))
    const response = await agent().get('/getMasterNationalities')
    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/getMasterNationalities')
    expect(response.status).toBe(500)
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

describe('PATCH /updateUser', () => {
  const validBody = () => ({
    request: {
      profileDetails: {
        profileReq: {
          personalDetails: { regNurseRegMidwifeNumber: 'RN123' },
        },
      },
      userId: 'user-1',
    },
  })

  it('rejects a body that fails Joi validation (missing userId)', async () => {
    const response = await agent()
      .patch('/updateUser')
      .send({ request: { profileDetails: { profileReq: {} } } })
    expect(response.status).toBe(400)
    expect(response.body.result.errorSource).toBe('JOI')
    expect(mockAxios.patch).not.toHaveBeenCalled()
  })

  it('rejects a body that fails Joi validation (missing profileReq)', async () => {
    const response = await agent()
      .patch('/updateUser')
      .send({ request: { profileDetails: {}, userId: 'user-1' } })
    expect(response.status).toBe(400)
    expect(response.body.result.errorSource).toBe('JOI')
  })

  it('forwards the update and strips a top-level personalDetails block', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    const body = validBody()
    // tslint:disable-next-line: no-any
    ;(body.request.profileDetails as any).personalDetails = { firstname: 'x' }
    const response = await agent().patch('/updateUser').send(body)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ updated: true })
    const sentBody = mockAxios.patch.mock.calls[0][1] as typeof body
    expect(
      (sentBody.request.profileDetails as { personalDetails?: unknown }).personalDetails
    ).toBeUndefined()
  })

  it('defaults regNurseRegMidwifeNumber to [NA] when missing from profileReq.personalDetails', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    const body = validBody()
    delete body.request.profileDetails.profileReq.personalDetails.regNurseRegMidwifeNumber
    const response = await agent().patch('/updateUser').send(body)
    expect(response.status).toBe(200)
    const sentBody = mockAxios.patch.mock.calls[0][1] as typeof body
    expect(
      sentBody.request.profileDetails.profileReq.personalDetails.regNurseRegMidwifeNumber
    ).toBe('[NA]')
  })

  it('leaves an existing regNurseRegMidwifeNumber untouched', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent().patch('/updateUser').send(validBody())
    expect(response.status).toBe(200)
    const sentBody = mockAxios.patch.mock.calls[0][1] as ReturnType<typeof validBody>
    expect(
      sentBody.request.profileDetails.profileReq.personalDetails.regNurseRegMidwifeNumber
    ).toBe('RN123')
  })

  it('omits undefined, null and empty values from profileReq.personalDetails', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    const body = validBody()
    // tslint:disable-next-line: no-any
    const personalDetails = body.request.profileDetails.profileReq.personalDetails as any
    personalDetails.blankField = ''
    personalDetails.nullField = null
    personalDetails.undefinedField = undefined
    personalDetails.keptField = 'value'
    const response = await agent().patch('/updateUser').send(body)
    expect(response.status).toBe(200)
    const sentBody = mockAxios.patch.mock.calls[0][1] as typeof body
    // tslint:disable-next-line: no-any
    const sentPersonalDetails = sentBody.request.profileDetails.profileReq.personalDetails as any
    expect(sentPersonalDetails.blankField).toBeUndefined()
    expect(sentPersonalDetails.nullField).toBeUndefined()
    expect(sentPersonalDetails.undefinedField).toBeUndefined()
    expect(sentPersonalDetails.keptField).toBe('value')
  })

  it('sets profileReq.personalDetails to an empty object when it was absent', async () => {
    // Pre-existing behavior, asserted as-is (not a bug this test suite fixes):
    // _.omitBy(undefined, ...) returns {}, so the handler unconditionally
    // overwrites profileReq.personalDetails with {} even when the caller never
    // sent that key.
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent()
      .patch('/updateUser')
      .send({
        request: {
          profileDetails: { profileReq: {} },
          userId: 'user-1',
        },
      })
    expect(response.status).toBe(200)
    const sentBody = mockAxios.patch.mock.calls[0][1] as {
      request: { profileDetails: { profileReq: { personalDetails: unknown } } }
    }
    expect(sentBody.request.profileDetails.profileReq.personalDetails).toEqual({})
  })

  it('forwards the upstream status and body on an upstream HTTP error', async () => {
    mockAxios.patch.mockRejectedValue(upstreamError(422, { error: 'invalid' }))
    const response = await agent().patch('/updateUser').send(validBody())
    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'invalid' })
  })

  it('returns 500 with a generic error body on a network failure', async () => {
    mockAxios.patch.mockRejectedValue(networkError())
    const response = await agent().patch('/updateUser').send(validBody())
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

const mockGeneric = mockAxios as unknown as jest.Mock

describe('GET /migrateRegistry', () => {
  it('reads the widList from disk and forwards the migration request', async () => {
    mockReadFile.mockImplementation((_path, cb) =>
      cb(null, JSON.stringify({ widList: ['w1', 'w2'] }))
    )
    mockAxios.post.mockResolvedValue(upstreamOk({ migrated: true }))
    const response = await agent().get('/migrateRegistry')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ migrated: true })
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ userId: 'user-1', widList: ['w1', 'w2'] }),
      expect.anything()
    )
  })

  it('returns 500 when the file read fails', async () => {
    mockReadFile.mockImplementation((_path, cb) => cb(new Error('ENOENT'), null))
    const response = await agent().get('/migrateRegistry')
    expect(response.status).toBe(500)
  })

  it('returns 500 when fs.readFile throws synchronously', async () => {
    // Only the synchronous call to fs.readFile is inside the outer try/catch
    // — the callback body (including its own JSON.parse and axios call) runs
    // outside that try, so this is the only way to reach the outer catch.
    mockReadFile.mockImplementation(() => {
      throw new Error('boom')
    })
    const response = await agent().get('/migrateRegistry')
    expect(response.status).toBe(500)
  })
})

describe('POST /createUser', () => {
  const validBody = () => ({
    personalDetails: {
      channel: 'dept-1',
      email: 'New.User@Example.com',
      firstName: 'New',
      lastName: 'User',
    },
  })

  it('rejects a request with no channel in personalDetails', async () => {
    const response = await agent()
      .post('/createUser')
      .send({ personalDetails: { email: 'x@example.com' } })
    expect(response.status).toBe(400)
    expect(response.text).toBe('Channel param is missing in personalDetails. Use DeptName as Channel value.')
    expect(mockGeneric).not.toHaveBeenCalled()
  })

  it('returns 400 when a user with that email already exists', async () => {
    mockGeneric.mockResolvedValueOnce(
      upstreamOk({ result: { response: { count: 1 } } })
    )
    const response = await agent().post('/createUser').send(validBody())
    expect(response.status).toBe(400)
    expect(response.body.responseCode).toBe('USR_EMAIL_EXISTS')
  })

  it('returns 400 when Sunbird user creation fails with CLIENT_ERROR', async () => {
    mockGeneric
      .mockResolvedValueOnce(upstreamOk({ result: { response: { count: 0 } } })) // search
      .mockResolvedValueOnce(upstreamOk({ responseCode: 'CLIENT_ERROR' })) // create
    const response = await agent().post('/createUser').send(validBody())
    expect(response.status).toBe(400)
    expect(response.text).toBe('Not able to create User in SunBird')
  })

  it('returns 500 when the freshly created user cannot be read back', async () => {
    mockGeneric
      .mockResolvedValueOnce(upstreamOk({ result: { response: { count: 0 } } })) // search
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'sb-1' } })) // create
      .mockResolvedValueOnce(upstreamOk({ params: { status: 'FAILED' } })) // read
    const response = await agent().post('/createUser').send(validBody())
    expect(response.status).toBe(500)
    expect(response.text).toBe('Failed to read newly created user details.')
  })

  it('returns 400 when the profile update step fails with CLIENT_ERROR', async () => {
    mockGeneric
      .mockResolvedValueOnce(upstreamOk({ result: { response: { count: 0 } } })) // search
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'sb-1' } })) // create
      .mockResolvedValueOnce(upstreamOk({ params: { status: 'SUCCESS' } })) // read
      .mockResolvedValueOnce(upstreamOk({ responseCode: 'CLIENT_ERROR' })) // profile update
    const response = await agent().post('/createUser').send(validBody())
    expect(response.status).toBe(400)
    expect(response.text).toBe('Failed to update user profile data.')
  })

  it('creates the user end to end on the happy path', async () => {
    mockGeneric
      .mockResolvedValueOnce(upstreamOk({ result: { response: { count: 0 } } })) // search
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'sb-1' } })) // create
      .mockResolvedValueOnce(upstreamOk({ params: { status: 'SUCCESS' } })) // read
      .mockResolvedValueOnce(upstreamOk({ responseCode: 'OK' })) // profile update
    const response = await agent().post('/createUser').send(validBody())
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      email: 'New.User@Example.com',
      firstName: 'New',
      lastName: 'User',
      userId: 'sb-1',
    })
  })

  it('returns 500 on a network failure during the search step', async () => {
    mockGeneric.mockRejectedValueOnce(networkError())
    const response = await agent().post('/createUser').send(validBody())
    expect(response.status).toBe(500)
  })

  it('forwards the upstream status on an upstream HTTP error', async () => {
    mockGeneric.mockRejectedValueOnce(upstreamError(403, { error: 'forbidden' }))
    const response = await agent().post('/createUser').send(validBody())
    expect(response.status).toBe(403)
  })
})

describe('POST /completeUserInfo', () => {
  it('rejects a request with neither email nor phone', async () => {
    const response = await agent().post('/completeUserInfo').send({})
    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      msg: 'Either email or phone is required',
      status: 'error',
    })
    expect(mockGeneric).not.toHaveBeenCalled()
  })

  it('accepts a request with only an email', async () => {
    mockGeneric.mockResolvedValueOnce(upstreamOk({ found: true }))
    const response = await agent().post('/completeUserInfo').send({ email: 'a@b.com' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ found: true })
  })

  it('accepts a request with only a phone', async () => {
    mockGeneric.mockResolvedValueOnce(upstreamOk({ found: true }))
    const response = await agent().post('/completeUserInfo').send({ phone: '9999999999' })
    expect(response.status).toBe(200)
  })

  it('falls back to a 200 status when the upstream response has no status', async () => {
    mockGeneric.mockResolvedValueOnce({ data: { found: true }, status: undefined })
    const response = await agent().post('/completeUserInfo').send({ email: 'a@b.com' })
    expect(response.status).toBe(200)
  })

  it('returns the upstream error status and message on failure', async () => {
    mockGeneric.mockRejectedValueOnce(upstreamError(404, { error: 'not found' }))
    const response = await agent().post('/completeUserInfo').send({ email: 'a@b.com' })
    expect(response.status).toBe(404)
  })

  it('returns 500 with a generic message on a network failure with no error message', async () => {
    const err = networkError()
    // tslint:disable-next-line: no-any
    ;(err as any).message = ''
    mockGeneric.mockRejectedValueOnce(err)
    const response = await agent().post('/completeUserInfo').send({ email: 'a@b.com' })
    expect(response.status).toBe(500)
    expect(response.text).toBe('Something went wrong')
  })
})

describe('POST /v2/updateUser', () => {
  const validBody = () => ({
    request: {
      profileDetails: {
        profileLocation: 'delhi',
        profileReq: { firstname: 'A' },
      },
      userId: 'user-1',
    },
  })

  it('rejects a body that fails Joi validation (missing profileLocation)', async () => {
    const response = await agent()
      .post('/v2/updateUser')
      .send({ request: { profileDetails: { profileReq: {} }, userId: 'user-1' } })
    expect(response.status).toBe(400)
    expect(response.body.result.errorSource).toBe('JOI')
    expect(mockAxios.patch).not.toHaveBeenCalled()
  })

  it('updates the profile, sends telemetry and inserts into Cassandra on the happy path', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    mockAxios.post.mockResolvedValue(upstreamOk({}))
    mockCassandraExecute.mockResolvedValue({})
    const response = await agent().post('/v2/updateUser').send(validBody())
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ updated: true })
    const sentBody = mockAxios.patch.mock.calls[0][1] as {
      request: { profileDetails: { profileLocation?: unknown } }
    }
    expect(sentBody.request.profileDetails.profileLocation).toBeUndefined()
  })

  it('returns 500 when the Cassandra insert fails', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }))
    mockAxios.post.mockResolvedValue(upstreamOk({}))
    mockCassandraExecute.mockRejectedValue(new Error('cassandra down'))
    const response = await agent().post('/v2/updateUser').send(validBody())
    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      message: 'Error occurred while inserting user profile in Cassandra',
    })
  })

  it('returns 500 with a generic message when the profile update call fails', async () => {
    mockAxios.patch.mockRejectedValue(networkError())
    const response = await agent().post('/v2/updateUser').send(validBody())
    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      message: 'Error occurred while updating user profile',
    })
  })
})

describe('POST /createUserV2WithRegistry', () => {
  const validBody = () => ({
    personalDetails: {
      channel: 'dept-1',
      email: 'New.User@Example.com',
      firstName: 'New',
      lastName: 'User',
    },
  })

  it('rejects a request with no channel in personalDetails', async () => {
    const response = await agent()
      .post('/createUserV2WithRegistry')
      .send({ personalDetails: { email: 'x@example.com' } })
    expect(response.status).toBe(400)
    expect(response.text).toBe('Channel param is missing in personalDetails. Use DeptName as Channel value.')
  })

  it('returns 400 when a user with that email already exists', async () => {
    mockGeneric.mockResolvedValueOnce(upstreamOk({ result: { response: { count: 1 } } }))
    const response = await agent().post('/createUserV2WithRegistry').send(validBody())
    expect(response.status).toBe(400)
    expect(response.text).toBe('Email address already exist')
  })

  it('returns 400 when Sunbird user creation fails with CLIENT_ERROR', async () => {
    mockGeneric
      .mockResolvedValueOnce(upstreamOk({ result: { response: { count: 0 } } }))
      .mockResolvedValueOnce(upstreamOk({ responseCode: 'CLIENT_ERROR' }))
    const response = await agent().post('/createUserV2WithRegistry').send(validBody())
    expect(response.status).toBe(400)
    expect(response.text).toBe('Not able to create User in SunBird')
  })

  it('returns 500 when the freshly created user cannot be read back', async () => {
    mockGeneric
      .mockResolvedValueOnce(upstreamOk({ result: { response: { count: 0 } } }))
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'sb-1' } }))
      .mockResolvedValueOnce(upstreamOk({ params: { status: 'failed' } }))
    const response = await agent().post('/createUserV2WithRegistry').send(validBody())
    expect(response.status).toBe(500)
    expect(response.text).toBe('Failed to read newly created user details.')
  })

  it('returns 500 when the registry create call returns null', async () => {
    mockGeneric
      .mockResolvedValueOnce(upstreamOk({ result: { response: { count: 0 } } })) // search
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'sb-1' } })) // create
      .mockResolvedValueOnce(
        upstreamOk({ params: { status: 'success' }, result: { response: { userName: 'newuser' } } })
      ) // read
      .mockResolvedValueOnce({ data: null, status: 200 }) // registry create
    const response = await agent().post('/createUserV2WithRegistry').send(validBody())
    expect(response.status).toBe(500)
    expect(response.text).toBe('Not able to create User Registry in Opensaber')
  })

  it('creates the user and registry end to end on the happy path', async () => {
    mockGeneric
      .mockResolvedValueOnce(upstreamOk({ result: { response: { count: 0 } } })) // search
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'sb-1' } })) // create
      .mockResolvedValueOnce(
        upstreamOk({ params: { status: 'success' }, result: { response: { userName: 'newuser' } } })
      ) // read
      .mockResolvedValueOnce(upstreamOk({ osid: 'os-1' })) // registry create
    const response = await agent().post('/createUserV2WithRegistry').send(validBody())
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      email: 'New.User@Example.com',
      firstName: 'New',
      lastName: 'User',
      userId: 'sb-1',
    })
  })

  it('returns 500 on a network failure', async () => {
    mockGeneric.mockRejectedValueOnce(networkError())
    const response = await agent().post('/createUserV2WithRegistry').send(validBody())
    expect(response.status).toBe(500)
  })
})

describe('POST /createUserV2WithoutRegistry', () => {
  const validBody = () => ({
    personalDetails: {
      channel: 'dept-1',
      email: 'New.User@Example.com',
      firstName: 'New',
      lastName: 'User',
    },
  })

  it('rejects a request with no channel in personalDetails', async () => {
    const response = await agent()
      .post('/createUserV2WithoutRegistry')
      .send({ personalDetails: { email: 'x@example.com' } })
    expect(response.status).toBe(400)
  })

  it('returns 400 when a user with that email already exists', async () => {
    mockGeneric.mockResolvedValueOnce(upstreamOk({ result: { response: { count: 1 } } }))
    const response = await agent().post('/createUserV2WithoutRegistry').send(validBody())
    expect(response.status).toBe(400)
    expect(response.text).toBe('Email address already exist')
  })

  it('returns 400 when Sunbird user creation fails with CLIENT_ERROR', async () => {
    mockGeneric
      .mockResolvedValueOnce(upstreamOk({ result: { response: { count: 0 } } }))
      .mockResolvedValueOnce(upstreamOk({ responseCode: 'CLIENT_ERROR' }))
    const response = await agent().post('/createUserV2WithoutRegistry').send(validBody())
    expect(response.status).toBe(400)
  })

  it('returns 500 when the freshly created user cannot be read back', async () => {
    mockGeneric
      .mockResolvedValueOnce(upstreamOk({ result: { response: { count: 0 } } }))
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'sb-1' } }))
      .mockResolvedValueOnce(upstreamOk({ params: { status: 'failed' } }))
    const response = await agent().post('/createUserV2WithoutRegistry').send(validBody())
    expect(response.status).toBe(500)
  })

  it('creates the user end to end on the happy path (no registry step)', async () => {
    mockGeneric
      .mockResolvedValueOnce(upstreamOk({ result: { response: { count: 0 } } })) // search
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'sb-1' } })) // create
      .mockResolvedValueOnce(upstreamOk({ params: { status: 'success' } })) // read
    const response = await agent().post('/createUserV2WithoutRegistry').send(validBody())
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      email: 'New.User@Example.com',
      firstName: 'New',
      lastName: 'User',
      userId: 'sb-1',
    })
  })

  it('returns 500 on a network failure', async () => {
    mockGeneric.mockRejectedValueOnce(networkError())
    const response = await agent().post('/createUserV2WithoutRegistry').send(validBody())
    expect(response.status).toBe(500)
  })
})

describe('POST /createUserWithoutInvitationEmail', () => {
  const validBody = () => ({
    personalDetails: {
      channel: 'dept-1',
      email: 'New.User@Example.com',
      firstName: 'New',
      lastName: 'User',
    },
  })

  it('rejects a request with no channel in personalDetails', async () => {
    const response = await agent()
      .post('/createUserWithoutInvitationEmail')
      .send({ personalDetails: { email: 'x@example.com' } })
    expect(response.status).toBe(400)
  })

  it('returns 400 when a user with that email already exists', async () => {
    mockGeneric.mockResolvedValueOnce(upstreamOk({ result: { response: { count: 1 } } }))
    const response = await agent().post('/createUserWithoutInvitationEmail').send(validBody())
    expect(response.status).toBe(400)
    expect(response.text).toBe('Email address already exist')
  })

  it('returns 400 when Sunbird user creation fails with CLIENT_ERROR', async () => {
    mockGeneric
      .mockResolvedValueOnce(upstreamOk({ result: { response: { count: 0 } } }))
      .mockResolvedValueOnce(upstreamOk({ responseCode: 'CLIENT_ERROR' }))
    const response = await agent().post('/createUserWithoutInvitationEmail').send(validBody())
    expect(response.status).toBe(400)
  })

  it('returns 500 when the freshly created user cannot be read back', async () => {
    mockGeneric
      .mockResolvedValueOnce(upstreamOk({ result: { response: { count: 0 } } }))
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'sb-1' } }))
      .mockResolvedValueOnce(upstreamOk({ params: { status: 'failed' } }))
    const response = await agent().post('/createUserWithoutInvitationEmail').send(validBody())
    expect(response.status).toBe(500)
  })

  it('returns 500 when the registry create call returns null', async () => {
    mockGeneric
      .mockResolvedValueOnce(upstreamOk({ result: { response: { count: 0 } } })) // search
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'sb-1' } })) // create
      .mockResolvedValueOnce(
        upstreamOk({ params: { status: 'success' }, result: { response: { userName: 'newuser' } } })
      ) // read
      .mockResolvedValueOnce({ data: null, status: 200 }) // registry create
    const response = await agent().post('/createUserWithoutInvitationEmail').send(validBody())
    expect(response.status).toBe(500)
    expect(response.text).toBe('Not able to create User Registry in Opensaber')
  })

  it('creates the user and registry end to end on the happy path', async () => {
    mockGeneric
      .mockResolvedValueOnce(upstreamOk({ result: { response: { count: 0 } } })) // search
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'sb-1' } })) // create
      .mockResolvedValueOnce(
        upstreamOk({ params: { status: 'success' }, result: { response: { userName: 'newuser' } } })
      ) // read
      .mockResolvedValueOnce(upstreamOk({ osid: 'os-1' })) // registry create
    const response = await agent().post('/createUserWithoutInvitationEmail').send(validBody())
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      email: 'New.User@Example.com',
      firstName: 'New',
      lastName: 'User',
      userId: 'sb-1',
    })
  })

  it('returns 500 on a network failure', async () => {
    mockGeneric.mockRejectedValueOnce(networkError())
    const response = await agent().post('/createUserWithoutInvitationEmail').send(validBody())
    expect(response.status).toBe(500)
  })
})
