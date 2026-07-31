/**
 * PHASE 1 — discussionHub/notifications.ts. Single GET / route: a proxy to
 * /api/notifications, wrapped in one try/catch that also covers the
 * getUserUID() lookup and the getWriteApiToken() header build. Success path
 * is a single unconditional `res.send(response.data)`; failure path is the
 * standard `res.status(err.response.status || 500).send(err.response.data ||
 * {})` shape.
 *
 * Unlike the sibling files in this directory (users.ts, writeApi.ts), no
 * `return async () => {...}` never-invoked-closure bug was found here — the
 * handler body runs directly inside the route callback. No live-test-unsafe
 * patterns identified.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../authoring/utils/header', () => ({
  getRootOrg: jest.fn(() => 'root-org'),
}))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/discussionHub-helper', () => ({
  getUserUID: jest.fn(),
  getWriteApiToken: jest.fn(() => 'Bearer test-token'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    DISCUSSION_HUB_API_BASE: 'https://discussion.test',
  },
}))

import axios from 'axios'
import { getUserUID, getWriteApiToken } from '../../utils/discussionHub-helper'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { notificationsApi } from './notifications'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockGetUserUID = getUserUID as jest.Mock
const mockGetWriteApiToken = getWriteApiToken as jest.Mock
const agent = () => mountRouter(notificationsApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockGetUserUID.mockReset()
  mockGetWriteApiToken.mockReset()
  mockGetUserUID.mockResolvedValue('uid-1')
  mockGetWriteApiToken.mockReturnValue('Bearer test-token')
})

/**
 * @description Verifies the GET / route proxies to the notifications upstream
 * API, forwarding success/error responses and handling userUid lookup failures.
 */
describe('GET /', () => {
  it('should return 200 with the upstream body when the request succeeds', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ notifications: ['n1'] }))
    const response = await agent().get('/')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ notifications: ['n1'] })
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://discussion.test/api/notifications?_uid=uid-1',
      expect.objectContaining({ headers: { authorization: 'Bearer test-token' } })
    )
  })

  it('should forward the upstream status and body when the upstream request fails', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('should return 500 with an empty body on a network failure with no upstream response', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({})
  })

  it('should return 500 when the userUid lookup rejects', async () => {
    mockGetUserUID.mockRejectedValue(new Error('User not found'))
    const response = await agent().get('/')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({})
    expect(mockAxios.get).not.toHaveBeenCalled()
  })
})
