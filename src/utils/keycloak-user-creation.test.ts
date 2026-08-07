/**
 * PHASE 2 — keycloak-user-creation.ts. Not Express routes — a set of plain
 * exported functions wrapping Cassandra (callback + Promise styles) and the
 * `keycloak-admin` client. Security-relevant: `getAuthToken` here was
 * already touched this session (the unreachable try/catch fix documented in
 * docs/PROD-VERIFICATION.md CHANGE 2) but had no direct test coverage until
 * now.
 *
 * `cassandra-driver`'s `Client` and `keycloak-admin`'s default-exported
 * class are both instantiated at call time / import time (module-load side
 * effects), mocked below. Note `Client` is constructed freshly INSIDE each
 * Cassandra function (not once at module load like other files in this
 * campaign) — the mock factory returns shared `execute`/`shutdown` jest.fn()s
 * so every `new Client()` call is controllable from one place.
 *
 * `getAuthToken`'s "neither err nor body is truthy" hang risk is already
 * documented pre-existing in this file (see "Pre-existing issues NOT
 * changed" #1 near the end of docs/PROD-VERIFICATION.md) — not reproduced
 * live here, consistent with that entry.
 */

const mockCassandraExecute = jest.fn()
const mockCassandraShutdown = jest.fn()
jest.mock('cassandra-driver', () => ({
  Client: jest.fn(() => ({ execute: mockCassandraExecute, shutdown: mockCassandraShutdown })),
}))
jest.mock('keycloak-admin', () =>
  jest.fn().mockImplementation(() => ({
    auth: jest.fn(),
    setConfig: jest.fn(),
    users: {
      create: jest.fn(),
      executeActionsEmail: jest.fn(),
      resetPassword: jest.fn(),
    },
  }))
)
jest.mock('request')
jest.mock('./logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('./env', () => ({
  CONSTANTS: {
    CASSANDRA_IP: '127.0.0.1,127.0.0.2',
    CASSANDRA_KEYSPACE: 'sunbird',
    HTTPS_HOST: 'https://kc.test',
    KC_NEW_USER_DEFAULT_PWD: 'default-pw',
    KEYCLOAK_ADMIN_PASSWORD: 'admin-pass',
    KEYCLOAK_ADMIN_USERNAME: 'admin',
    KEYCLOAK_REALM: 'test-realm',
    TIMEOUT: '10000',
  },
}))

import KcAdminClient from 'keycloak-admin'
import request from 'request'
import {
  checkUniqueKey,
  checkUUIDMaster,
  createKeycloakUser,
  getAuthToken,
  sendActionsEmail,
  UpdateKeycloakUserPassword,
  updateUniqueKey,
  updateUUIDMaster,
} from './keycloak-user-creation'

const mockRequestPost = request.post as unknown as jest.Mock
const mockKcAdmin = (KcAdminClient as unknown as jest.Mock).mock.results[0].value as {
  auth: jest.Mock
  setConfig: jest.Mock
  users: { create: jest.Mock; executeActionsEmail: jest.Mock; resetPassword: jest.Mock }
}

beforeEach(() => {
  mockCassandraExecute.mockReset()
  mockCassandraShutdown.mockReset()
  mockRequestPost.mockReset()
  mockKcAdmin.auth.mockReset().mockResolvedValue(undefined)
  mockKcAdmin.setConfig.mockReset()
  mockKcAdmin.users.create.mockReset()
  mockKcAdmin.users.executeActionsEmail.mockReset()
  mockKcAdmin.users.resetPassword.mockReset()
})

describe('checkUniqueKey', () => {
  it('invokes the callback with the matched row', () => {
    mockCassandraExecute.mockImplementation((_q, cb) => cb(null, { rows: [{ key: 'k1' }] }))
    const callback = jest.fn()
    checkUniqueKey('k1', callback)
    expect(callback).toHaveBeenCalledWith(null, { key: 'k1' })
    expect(mockCassandraShutdown).toHaveBeenCalled()
  })

  it('invokes the callback with an error when no rows are found', () => {
    mockCassandraExecute.mockImplementation((_q, cb) => cb(null, { rows: [] }))
    const callback = jest.fn()
    checkUniqueKey('missing', callback)
    expect(callback).toHaveBeenCalledWith(expect.any(Error), null)
  })
})

describe('checkUUIDMaster', () => {
  it('resolves the matched row', async () => {
    mockCassandraExecute.mockImplementation((_q, cb) => cb(null, { rows: [{ key: 'k1' }] }))
    await expect(checkUUIDMaster('k1')).resolves.toEqual({ key: 'k1' })
  })

  it('rejects with an Error when no rows are found', async () => {
    mockCassandraExecute.mockImplementation((_q, cb) => cb(null, { rows: [] }))
    await expect(checkUUIDMaster('missing')).rejects.toThrow('checkUUIDMaster: No records')
  })
})

describe('updateUniqueKey', () => {
  it('invokes the callback with the update result', () => {
    mockCassandraExecute.mockImplementation((_q, cb) => cb(null, { wasApplied: () => true }))
    const callback = jest.fn()
    updateUniqueKey('k1', callback)
    expect(callback).toHaveBeenCalledWith(null, { wasApplied: expect.any(Function) })
  })

  it('invokes the callback with an error when there is no result', () => {
    mockCassandraExecute.mockImplementation((_q, cb) => cb(null, null))
    const callback = jest.fn()
    updateUniqueKey('missing', callback)
    expect(callback).toHaveBeenCalledWith(expect.any(Error), null)
  })
})

describe('updateUUIDMaster', () => {
  it('resolves with the update result', async () => {
    mockCassandraExecute.mockImplementation((_q, cb) => cb(null, { wasApplied: () => true }))
    await expect(updateUUIDMaster('k1', 'a@b.com')).resolves.toBeDefined()
  })

  it('rejects when there is no result', async () => {
    mockCassandraExecute.mockImplementation((_q, cb) => cb(null, null))
    await expect(updateUUIDMaster('missing', 'a@b.com')).rejects.toThrow('No records')
  })
})

describe('createKeycloakUser', () => {
  const req = { body: { email: 'a@b.com', fname: 'A', lname: 'B' } }

  it('authenticates then creates the user', async () => {
    mockKcAdmin.users.create.mockResolvedValue({ id: 'kc-1' })
    await expect(createKeycloakUser(req)).resolves.toEqual({ id: 'kc-1' })
    expect(mockKcAdmin.auth).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'admin' })
    )
  })

  it('rejects when Keycloak auth fails', async () => {
    mockKcAdmin.auth.mockRejectedValue(new Error('auth failed'))
    await expect(createKeycloakUser(req)).rejects.toThrow('auth failed')
  })

  it('rejects when user creation fails', async () => {
    mockKcAdmin.users.create.mockRejectedValue(new Error('duplicate user'))
    await expect(createKeycloakUser(req)).rejects.toThrow('duplicate user')
  })
})

describe('getAuthToken', () => {
  it('resolves with the parsed token response', async () => {
    mockRequestPost.mockImplementation((_options, callback) => {
      callback(null, {}, JSON.stringify({ access_token: 'tok-1' }))
    })
    await expect(getAuthToken('a@b.com')).resolves.toEqual({ access_token: 'tok-1' })
  })

  it('rejects when the request library reports an error', async () => {
    mockRequestPost.mockImplementation((_options, callback) => {
      callback(new Error('connect ECONNREFUSED'), {}, null)
    })
    await expect(getAuthToken('a@b.com')).rejects.toThrow('connect ECONNREFUSED')
  })

  // NOTE: neither `err` nor `body` being truthy is a documented pre-existing
  // hang (getAuthToken never settles) — not reproduced live. See
  // "Pre-existing issues NOT changed" #1 in docs/PROD-VERIFICATION.md.
})

describe('UpdateKeycloakUserPassword', () => {
  it('resets the password', async () => {
    mockKcAdmin.users.resetPassword.mockResolvedValue({ status: 'ok' })
    await expect(UpdateKeycloakUserPassword('kc-1', false)).resolves.toEqual({ status: 'ok' })
    expect(mockKcAdmin.users.resetPassword).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'kc-1', credential: expect.objectContaining({ temporary: false }) })
    )
  })

  it('rejects when the reset call fails', async () => {
    mockKcAdmin.users.resetPassword.mockRejectedValue(new Error('reset failed'))
    await expect(UpdateKeycloakUserPassword('kc-1', true)).rejects.toThrow('reset failed')
  })
})

describe('sendActionsEmail', () => {
  it('authenticates then sends the verification email', async () => {
    mockKcAdmin.users.executeActionsEmail.mockResolvedValue({ status: 'sent' })
    await expect(sendActionsEmail('kc-1')).resolves.toEqual({ status: 'sent' })
  })

  it('rejects when Keycloak auth fails', async () => {
    mockKcAdmin.auth.mockRejectedValue(new Error('auth failed'))
    await expect(sendActionsEmail('kc-1')).rejects.toThrow('auth failed')
  })

  it('rejects when the email call fails', async () => {
    mockKcAdmin.users.executeActionsEmail.mockRejectedValue(new Error('mail failed'))
    await expect(sendActionsEmail('kc-1')).rejects.toThrow('mail failed')
  })
})
