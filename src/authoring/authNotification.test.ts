/**
 * authNotification.ts is a bare `http-proxy` pass-through — `createProxyServer()`
 * runs at import time (module-load side effect, mocked below, same pattern
 * proven in authContent.test.ts). `mockProxy.web` must call `res.end()`
 * itself since the real http-proxy internals normally write to the response
 * directly; leaving it a no-op jest.fn() hangs every request until Jest's
 * test timeout.
 */

jest.mock('http-proxy', () => ({
  createProxyServer: jest.fn(() => ({ on: jest.fn(), web: jest.fn() })),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    NOTIFICATIONS_API_BASE: 'https://notifications.test',
  },
}))

import { createProxyServer } from 'http-proxy'
import { authNotification } from './authNotification'
import { mountRouter } from '../test-support/mountRouter'

const mockProxy = (createProxyServer as jest.Mock).mock.results[0].value as { web: jest.Mock }
// Captured immediately at module-load time, before jest.config.js's global
// `clearMocks: true` wipes call history ahead of the first test.
const proxyServerConstructorArgs = (createProxyServer as jest.Mock).mock.calls[0][0]

const agent = () => mountRouter(authNotification)

beforeEach(() => {
  mockProxy.web.mockReset()
  mockProxy.web.mockImplementation((_req, res) => res.end())
})

/**
 * @description Verifies every method/path under this router is forwarded to
 * proxyCreator.web with the /authNotificationApi prefix stripped from
 * req.url and the configured NOTIFICATIONS_API_BASE target. Also verifies
 * the proxy server itself was constructed with a 10s timeout option.
 */
describe('ALL *', () => {
  it('should construct the proxy server with a 10s timeout', () => {
    expect(proxyServerConstructorArgs).toEqual({ timeout: 10000 })
  })

  it('should strip the /authNotificationApi prefix and proxy the request to NOTIFICATIONS_API_BASE', async () => {
    await agent().get('/authNotificationApi/some/path')

    expect(mockProxy.web).toHaveBeenCalledTimes(1)
    const [req, , options] = mockProxy.web.mock.calls[0]
    expect(req.url).toBe('/some/path')
    expect(options).toEqual({ target: 'https://notifications.test' })
  })

  it('should proxy non-GET methods the same way', async () => {
    await agent().post('/authNotificationApi/create')

    expect(mockProxy.web).toHaveBeenCalledTimes(1)
    expect(mockProxy.web.mock.calls[0][0].url).toBe('/create')
  })
})
