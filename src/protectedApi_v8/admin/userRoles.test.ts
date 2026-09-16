/**
 * userRoles.ts — four routes, all using the callable `axios({...})` form
 * (not `.get()`/`.post()`), each fully wrapped in try/catch with the safe
 * `(err && err.response && err.response.status) || 500` fallback pattern.
 *
 * Read the whole file before writing these tests: every route sends exactly
 * one response on every code path (the one validation branch in
 * getRolesDescription has an explicit `return` after `res.status(400).send()`,
 * so there is no double-send / fallthrough risk), and every catch block
 * guards `err.response` before touching it, so no live test here can hang or
 * crash the process. No unsafe patterns found — see report.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    ROLES_API_BASE: 'https://roles.test',
    SB_EXT_API_BASE_4: 'https://sbext4.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { userRolesApi } from './userRoles'

const mockAxiosCallable = axios as unknown as jest.Mock

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

/**
 * @description Verifies GET /getRolesDescription/:lang requires a rootOrg
 * header (400 otherwise), forwards the upstream body/status on both success
 * and error, and falls back to a generic 500 on a bare transport failure.
 */
describe('GET /getRolesDescription/:lang', () => {
  it('should return 400 with ERROR_NO_ORG_DATA when rootOrg header is missing', async () => {
    const response = await mountRouter(userRolesApi).get('/getRolesDescription/en')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxiosCallable).not.toHaveBeenCalled()
  })

  it('should forward the upstream body on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ roles: ['ADMIN', 'CONTENT_CREATOR'] }))

    const response = await mountRouter(userRolesApi)
      .get('/getRolesDescription/en')
      .set('rootOrg', 'org1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ roles: ['ADMIN', 'CONTENT_CREATOR'] })
  })

  it('should forward an upstream error status and body', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(403, { error: 'forbidden' }))

    const response = await mountRouter(userRolesApi)
      .get('/getRolesDescription/en')
      .set('rootOrg', 'org1')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'forbidden' })
  })

  it('should fall back to 500 with the generic body on a transport failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await mountRouter(userRolesApi)
      .get('/getRolesDescription/en')
      .set('rootOrg', 'org1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies GET /allRoles forwards the upstream body/status on
 * success and error, defaults to an empty object when the upstream body is
 * falsy, and falls back to a generic 500 on a bare transport failure.
 */
describe('GET /allRoles', () => {
  it('should forward the upstream body on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ roles: ['ADMIN'] }))

    const response = await mountRouter(userRolesApi).get('/allRoles').set('rootOrg', 'org1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ roles: ['ADMIN'] })
  })

  it('should respond with an empty object when the upstream body is falsy', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk(null))

    const response = await mountRouter(userRolesApi).get('/allRoles').set('rootOrg', 'org1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({})
  })

  it('should forward an upstream error status and body', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(401, { error: 'unauthorized' }))

    const response = await mountRouter(userRolesApi).get('/allRoles').set('rootOrg', 'org1')

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'unauthorized' })
  })

  it('should fall back to 500 with the generic body on a transport failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await mountRouter(userRolesApi).get('/allRoles').set('rootOrg', 'org1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies GET /:id forwards the upstream body/status on
 * success and error, defaults to an empty object when the upstream body is
 * falsy, and falls back to a generic 500 on a bare transport failure.
 */
describe('GET /:id', () => {
  it('should forward the upstream body on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ roles: ['REVIEWER'] }))

    const response = await mountRouter(userRolesApi).get('/user-123').set('rootOrg', 'org1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ roles: ['REVIEWER'] })
  })

  it('should respond with an empty object when the upstream body is falsy', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk(null))

    const response = await mountRouter(userRolesApi).get('/user-123').set('rootOrg', 'org1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({})
  })

  it('should forward an upstream error status and body', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await mountRouter(userRolesApi).get('/user-123').set('rootOrg', 'org1')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('should fall back to 500 with the generic body on a transport failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await mountRouter(userRolesApi).get('/user-123').set('rootOrg', 'org1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

/**
 * @description Verifies PATCH / forwards the upstream body/status on
 * success and error, defaults to an empty object when the upstream body is
 * falsy, and falls back to a generic 500 on a bare transport failure.
 */
describe('PATCH /', () => {
  it('should forward the upstream body on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ updated: true }))

    const response = await mountRouter(userRolesApi)
      .patch('/')
      .set('rootOrg', 'org1')
      .send({ userId: 'user-123', roles: ['ADMIN'] })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ updated: true })
  })

  it('should respond with an empty object when the upstream body is falsy', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk(null))

    const response = await mountRouter(userRolesApi)
      .patch('/')
      .set('rootOrg', 'org1')
      .send({ userId: 'user-123', roles: ['ADMIN'] })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({})
  })

  it('should forward an upstream error status and body', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(409, { error: 'conflict' }))

    const response = await mountRouter(userRolesApi)
      .patch('/')
      .set('rootOrg', 'org1')
      .send({ userId: 'user-123', roles: ['ADMIN'] })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('should fall back to 500 with the generic body on a transport failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await mountRouter(userRolesApi)
      .patch('/')
      .set('rootOrg', 'org1')
      .send({ userId: 'user-123', roles: ['ADMIN'] })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
