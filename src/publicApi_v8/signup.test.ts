/**
 * signup.ts — a Cassandra + Keycloak-backed signup flow, callback-shaped
 * (not axios-shaped) unlike customSignup.ts. Both routes are riddled with
 * missing-`return` fall-throughs after a `res.send(...)`, and several of
 * those fall-throughs are UNREACHABLE from the outer route-level try/catch
 * because they run inside a plain callback (`checkUniqueKey(id, async (err,
 * resp) => {...})`) whose returned promise is never awaited or `.catch()`-ed
 * by anyone. A rejection thrown in there becomes an unhandled promise
 * rejection at the process level, not a caught 500.
 *
 * Real defects found while reading this file, NOT reproduced live here
 * (each is a candidate for docs/PROD-VERIFICATION.md, added by the requester
 * rather than this test file):
 *
 *  - [URGENT] Route `POST /create/:uniqueId`, lines 70-74 + 112-114: when
 *    `checkUUIDMaster` rejects (e.g. an invalid/expired signup code — a very
 *    common real input), the `.catch` handler sends a response but does not
 *    return/rethrow, so `result` is `undefined` and the `else` branch at line
 *    113 sends a SECOND response. That second `res.send` throws
 *    (`ERR_HTTP_HEADERS_SENT`) directly in the try block, is caught by the
 *    route's own `catch (err)`, which then attempts a THIRD send — which
 *    also throws, this time with nothing left to catch it. That becomes an
 *    unhandled promise rejection at the process level (Node's default
 *    `--unhandled-rejections=throw` crashes the process on this). Triggered
 *    by the single most ordinary bad input this endpoint can receive.
 *
 *  - [URGENT] Route `POST /`, lines 36-42: `createKeycloakUser(req).catch(
 *    (error) => { if (error.response.status === 409) { res.status(400)
 *    .send(...) } res.status(400).send('1003...') })`. Two problems: (a)
 *    `error.response` is accessed with no guard — a plain network-level
 *    rejection (no `.response`) throws a TypeError synchronously inside this
 *    handler; (b) even for a proper 409, there's no `return` after the first
 *    send, so the final `res.status(400).send('1003...')` ALWAYS also runs,
 *    a guaranteed double-send whenever createKeycloakUser rejects with 409.
 *    Both cases matter more than usual here because this whole handler lives
 *    inside `checkUniqueKey(signupReq.uniqueId, async (err, resp) => {...})`
 *    (line 27) — an async callback whose returned promise `checkUniqueKey`
 *    never awaits or attaches a `.catch` to, and which sits entirely outside
 *    the route's own `try` (lines 16/61). Any throw/rejection produced
 *    inside it — from either (a) or (b) — becomes an unhandled promise
 *    rejection, not a caught 500.
 *
 *  - Route `POST /`, lines 46-52 (same unreachable-callback problem as
 *    above): if `UpdateKeycloakUserPassword` rejects, its `.catch` sends a
 *    400, but execution unconditionally falls through to `res.json(
 *    createKeycloak || {})` right after — a guaranteed double-send, again
 *    inside the un-awaited `checkUniqueKey` callback, so again invisible to
 *    the outer `catch`.
 *
 *  - Route `POST /`, lines 32-34: `if (!resp.active) { res.status(400)
 *    .send(...) }` has no `return`, so execution falls through and calls
 *    `createKeycloakUser(req)` for real anyway. Depending on what that call
 *    does, this can compound into either of the two bugs above. The test
 *    below for this branch only stays safe because it deliberately mocks
 *    createKeycloakUser to resolve with no `.id`, which short-circuits the
 *    `if (createKeycloak && createKeycloak.id)` guard on line 43 and avoids
 *    a second send — that is a property of the test's mock, not of the
 *    production code, where createKeycloakUser will almost always either
 *    resolve with an id or reject, hitting one of the double-send bugs
 *    above.
 */

jest.mock('../protectedApi_v8/admin/userRegistration', () => ({
  createUser: jest.fn(),
  performNewUserSteps: jest.fn(),
}))
jest.mock('../utils/keycloak-user-creation', () => ({
  checkUUIDMaster: jest.fn(),
  checkUniqueKey: jest.fn(),
  createKeycloakUser: jest.fn(),
  UpdateKeycloakUserPassword: jest.fn(),
  updateUniqueKey: jest.fn(),
  updateUUIDMaster: jest.fn(),
}))
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))

import { createUser, performNewUserSteps } from '../protectedApi_v8/admin/userRegistration'
import { upstreamError } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import {
  checkUUIDMaster,
  checkUniqueKey,
  createKeycloakUser,
  UpdateKeycloakUserPassword,
  updateUniqueKey,
  updateUUIDMaster,
} from '../utils/keycloak-user-creation'
import { getMaskedEmail, getMaskedString, signup } from './signup'

const mockCheckUniqueKey = checkUniqueKey as jest.Mock
const mockCheckUUIDMaster = checkUUIDMaster as jest.Mock
const mockCreateKeycloakUser = createKeycloakUser as jest.Mock
const mockUpdateKeycloakUserPassword = UpdateKeycloakUserPassword as jest.Mock
const mockUpdateUniqueKey = updateUniqueKey as jest.Mock
const mockUpdateUUIDMaster = updateUUIDMaster as jest.Mock
const mockCreateUser = createUser as jest.Mock
const mockPerformNewUserSteps = performNewUserSteps as jest.Mock

const agent = () => mountRouter(signup)

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getMaskedEmail / getMaskedString', () => {
  it('masks the local part, domain and TLD, keeping the last char of each', () => {
    expect(getMaskedEmail('john@example.com')).toBe('j**n@e*****e.c*m')
  })

  it('returns an empty string for a falsy email', () => {
    expect(getMaskedEmail('')).toBe('')
  })

  it('returns an empty string for a falsy value', () => {
    expect(getMaskedString('')).toBe('')
  })

  it('leaves a single character unmasked (nothing before the last char)', () => {
    expect(getMaskedString('a')).toBe('a')
  })
})

describe('POST / (signup)', () => {
  const body = { code: 'ABC123', email: 'new@user.com', fname: 'New', lname: 'User' }

  it('registers the user end to end on the happy path', async () => {
    mockCheckUniqueKey.mockImplementation((_uniqueId, cb) => cb(null, { active: true }))
    mockCreateKeycloakUser.mockResolvedValue({ id: 'kc-1' })
    mockUpdateUniqueKey.mockImplementation((_uniqueId, cb) => cb(null, { updated: true }))
    mockUpdateKeycloakUserPassword.mockResolvedValue({ ok: true })

    const response = await agent().post('/').send(body)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'kc-1' })
  })

  it('returns 400 when the unique code lookup errors', async () => {
    mockCheckUniqueKey.mockImplementation((_uniqueId, cb) => cb(new Error('not found'), null))

    const response = await agent().post('/').send(body)

    expect(response.status).toBe(400)
    expect(response.text).toContain('1001: Wrong Code')
  })

  // Safe because createKeycloakUser is mocked to resolve with no `.id`, which
  // short-circuits before the code reaches the (separately dangerous)
  // fall-through described in the file header — see the header comment.
  it('returns 400 when the code has already been used', async () => {
    mockCheckUniqueKey.mockImplementation((_uniqueId, cb) => cb(null, { active: false }))
    mockCreateKeycloakUser.mockResolvedValue(undefined)

    const response = await agent().post('/').send(body)

    expect(response.status).toBe(400)
    expect(response.text).toContain('1002: Code')
    expect(response.text).toContain('already is used')
  })

  it('returns 400 when Keycloak user creation fails with a non-409 error', async () => {
    mockCheckUniqueKey.mockImplementation((_uniqueId, cb) => cb(null, { active: true }))
    mockCreateKeycloakUser.mockRejectedValue(upstreamError(500, { error: 'boom' }))

    const response = await agent().post('/').send(body)

    expect(response.status).toBe(400)
    expect(response.text).toContain('1003: User could not be create in Keycloack')
  })

  // NOTE: createKeycloakUser rejecting with a 409 (email already registered)
  // and createKeycloakUser rejecting with an error that has no `.response`
  // are NOT tested live — both are documented as real bugs in the file
  // header above (guaranteed double-send / unguarded property access inside
  // an un-awaited callback that the route's own try/catch cannot see).

  it('returns 400 when marking the unique code inactive fails', async () => {
    mockCheckUniqueKey.mockImplementation((_uniqueId, cb) => cb(null, { active: true }))
    mockCreateKeycloakUser.mockResolvedValue({ id: 'kc-2' })
    mockUpdateUniqueKey.mockImplementation((_uniqueId, cb) => cb(new Error('cassandra down'), null))

    const response = await agent().post('/').send(body)

    expect(response.status).toBe(400)
    expect(response.text).toContain('1004: active satus of code')
  })

  // NOTE: UpdateKeycloakUserPassword rejecting is NOT tested live — the
  // handler unconditionally calls res.json(...) right after its .catch sends
  // a 400, a guaranteed double-send with no way to avoid it via mocking (see
  // file header).

  // These two cover the route's own try/catch (lines 61-65), reached here by
  // making checkUniqueKey itself throw synchronously when called — a plain
  // synchronous throw inside the try block, safely caught by the handler's
  // own catch with a single response. This is distinct from the detached
  // async-callback bugs documented above, which the outer catch can't see.
  it('returns the upstream status/data when checkUniqueKey throws synchronously', async () => {
    mockCheckUniqueKey.mockImplementation(() => {
      throw upstreamError(403, { error: 'boom' })
    })

    const response = await agent().post('/').send(body)

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'boom' })
  })

  it('falls back to 500 when checkUniqueKey throws synchronously with no .response', async () => {
    mockCheckUniqueKey.mockImplementation(() => {
      throw new Error('boom')
    })

    const response = await agent().post('/').send(body)

    expect(response.status).toBe(500)
    expect(response.body).toEqual({})
  })
})

describe('POST /create/:uniqueId', () => {
  it('returns the masked email and success message on the happy path', async () => {
    mockCheckUUIDMaster.mockResolvedValue({
      active: true,
      email: 'john@example.com',
      firstname: 'John',
      lastname: 'Doe',
    })
    mockCreateUser.mockResolvedValue('kc-user-1')
    mockPerformNewUserSteps.mockResolvedValue(undefined)
    mockUpdateUUIDMaster.mockResolvedValue({ updated: true })

    const response = await agent().post('/create/CODE1').send()

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      email: getMaskedEmail('john@example.com'),
      msg: '1005: User with this email successfully registered',
    })
  })

  it('appends the error to the message when performNewUserSteps fails', async () => {
    mockCheckUUIDMaster.mockResolvedValue({
      active: true,
      email: 'john@example.com',
      firstname: 'John',
      lastname: 'Doe',
    })
    mockCreateUser.mockResolvedValue('kc-user-1')
    mockPerformNewUserSteps.mockRejectedValue(new Error('post-steps failed'))
    mockUpdateUUIDMaster.mockResolvedValue({ updated: true })

    const response = await agent().post('/create/CODE1').send()

    expect(response.status).toBe(200)
    expect(response.body.msg).toBe(
      '1002: User with this email successfully registered. Error: post-steps failed'
    )
  })

  it('reports the user as already existing when Keycloak creation 409s', async () => {
    mockCheckUUIDMaster.mockResolvedValue({
      active: true,
      email: 'john@example.com',
      firstname: 'John',
      lastname: 'Doe',
    })
    mockCreateUser.mockRejectedValue(upstreamError(409, {}))

    const response = await agent().post('/create/CODE1').send()

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ msg: '1004: User with email already exists' })
  })

  it('reports a generic creation failure for a non-409 Keycloak error', async () => {
    mockCheckUUIDMaster.mockResolvedValue({
      active: true,
      email: 'john@example.com',
      firstname: 'John',
      lastname: 'Doe',
    })
    mockCreateUser.mockRejectedValue(upstreamError(500, {}))

    const response = await agent().post('/create/CODE1').send()

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ msg: 'User with email could not be created in Keycloak' })
  })

  it('reports the code as already used when the master record is inactive', async () => {
    mockCheckUUIDMaster.mockResolvedValue({
      active: false,
      email: 'john@example.com',
      firstname: 'John',
      lastname: 'Doe',
    })

    const response = await agent().post('/create/CODE1').send()

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      email: getMaskedEmail('john@example.com'),
      msg: '1003: Code is already used !!',
    })
  })

  it('surfaces a 500 (via the outer catch) when updateUUIDMaster rejects after a successful registration', async () => {
    mockCheckUUIDMaster.mockResolvedValue({
      active: true,
      email: 'john@example.com',
      firstname: 'John',
      lastname: 'Doe',
    })
    mockCreateUser.mockResolvedValue('kc-user-1')
    mockPerformNewUserSteps.mockResolvedValue(undefined)
    mockUpdateUUIDMaster.mockRejectedValue(new Error('cassandra down'))

    const response = await agent().post('/create/CODE1').send()

    // updateUUIDMaster has no local .catch, so its rejection propagates
    // straight up through the route's own try/catch (it is NOT inside a
    // detached callback like the bugs above) — a single, safe response.
    expect(response.status).toBe(500)
    expect(response.body).toEqual({})
  })

  // NOTE: checkUUIDMaster rejecting (the "invalid/expired code" case) is NOT
  // tested live — it is the URGENT double-send-cascading-to-a-process-crash
  // bug documented in the file header above.

  // Safe variant of the "no result" path: checkUUIDMaster RESOLVES (does not
  // reject) with a falsy value, so the .catch handler never runs at all and
  // only the `else` branch (line 113) sends a response — a single, safe send.
  it('returns 400 when checkUUIDMaster resolves with no result', async () => {
    mockCheckUUIDMaster.mockResolvedValue(undefined)

    const response = await agent().post('/create/CODE1').send()

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      msg: 'Could not process the request, please try again after some time!!',
    })
  })
})
