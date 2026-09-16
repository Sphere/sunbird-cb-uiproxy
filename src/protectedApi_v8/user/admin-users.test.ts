/**
 * admin-users.ts — a single route, POST /createuser, over one
 * `axios.request({...})` call.
 *
 * Execution order inside the try block matters: `JSON.parse(req.query.keycloak)`
 * runs BEFORE the `rootOrg` header check, so a missing/malformed `keycloak`
 * query param throws synchronously and is caught — regardless of whether
 * `rootOrg` is present — landing on the generic 500 fallback rather than the
 * 400 ERROR_NO_ORG_DATA branch. The `rootOrg` check itself has an explicit
 * `return` after its 400, so the real axios.request() below never runs when
 * it's missing. The catch block guards `err.response` with `&&` before
 * reading `.status`/`.data` (`(err && err.response && err.response.status) ||
 * 500`), so it never throws even when the rejection has no `response` at
 * all — safe to exercise every branch, including failure paths, live.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    USER_CREATE_API_BASE: 'https://user-create.test',
    USER_CREATE_PASSWORD: 'test-password',
    USER_CREATE_USERNAME: 'test-username',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { usersApi } from './admin-users'

const mockAxiosRequest = axios.request as jest.Mock
const agent = () => mountRouter(usersApi)
const withRootOrg = (req: ReturnType<typeof agent>) => req.set('rootOrg', 'r1')

beforeEach(() => {
  mockAxiosRequest.mockReset()
})

/**
 * @description Verifies the POST /createuser route creates a user via the
 * upstream axios.request() call, forwarding the keycloak/rootOrg params
 * correctly, rejects requests missing the rootOrg header or carrying a
 * malformed keycloak query param, and forwards the upstream status/body — or
 * falls back to a generic 500 — on failure.
 */
describe('POST /createuser', () => {
  it('should create a user and return the upstream response body on success', async () => {
    mockAxiosRequest.mockResolvedValue(upstreamOk({ userId: 'u1' }))

    const response = await withRootOrg(agent().post('/createuser'))
      .query({ keycloak: 'true' })
      .send({ firstName: 'Jane' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ userId: 'u1' })
  })

  it('should forward the keycloak, pidOnly and rootOrg params and auth credentials on the request', async () => {
    mockAxiosRequest.mockResolvedValue(upstreamOk({ userId: 'u1' }))

    await withRootOrg(agent().post('/createuser'))
      .query({ keycloak: 'true' })
      .send({ firstName: 'Jane' })

    expect(mockAxiosRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { password: 'test-password', username: 'test-username' },
        data: { firstName: 'Jane' },
        method: 'POST',
        params: { keycloakOnly: true, pidOnly: true, rootOrg: 'r1' },
        url: 'https://user-create.test/users',
      })
    )
  })

  it('should forward keycloakOnly as false when keycloak query param is false', async () => {
    mockAxiosRequest.mockResolvedValue(upstreamOk({ userId: 'u1' }))

    await withRootOrg(agent().post('/createuser'))
      .query({ keycloak: 'false' })
      .send({ firstName: 'Jane' })

    expect(mockAxiosRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { keycloakOnly: false, pidOnly: true, rootOrg: 'r1' },
      })
    )
  })

  it('should reject a request missing the rootOrg header', async () => {
    const response = await agent()
      .post('/createuser')
      .query({ keycloak: 'true' })
      .send({ firstName: 'Jane' })

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxiosRequest).not.toHaveBeenCalled()
  })

  it('should return 500 when the keycloak query param is missing, even with a rootOrg header', async () => {
    // JSON.parse(undefined) runs before the rootOrg check and throws
    // synchronously (ToString(undefined) is the literal string "undefined",
    // not valid JSON). The throw lands inside this route's try block, so it
    // is caught and answered with the generic 500 fallback rather than
    // hanging or crashing the process -- safe to exercise live.
    const response = await withRootOrg(agent().post('/createuser')).send({ firstName: 'Jane' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
    expect(mockAxiosRequest).not.toHaveBeenCalled()
  })

  it('should return 500 when the keycloak query param is not valid JSON', async () => {
    const response = await withRootOrg(agent().post('/createuser'))
      .query({ keycloak: 'not-json' })
      .send({ firstName: 'Jane' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
    expect(mockAxiosRequest).not.toHaveBeenCalled()
  })

  it('should forward the upstream status and body when the create call fails', async () => {
    mockAxiosRequest.mockRejectedValue(upstreamError(409, { error: 'user already exists' }))

    const response = await withRootOrg(agent().post('/createuser'))
      .query({ keycloak: 'true' })
      .send({ firstName: 'Jane' })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'user already exists' })
  })

  it('should return 500 with the generic body on a transport-level failure with no upstream response', async () => {
    mockAxiosRequest.mockRejectedValue(networkError())

    const response = await withRootOrg(agent().post('/createuser'))
      .query({ keycloak: 'true' })
      .send({ firstName: 'Jane' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
