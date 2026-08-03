/**
 * authIapBackend.ts is a bare `http-proxy` pass-through — `createProxyServer()`
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
    IAP_BACKEND_AUTH: 'https://iap-backend.test',
  },
}))

import { createProxyServer } from 'http-proxy'
import { authIapBackend } from './authIapBackend'
import { mountRouter } from '../test-support/mountRouter'

const mockProxy = (createProxyServer as jest.Mock).mock.results[0].value as { web: jest.Mock }

const agent = () => mountRouter(authIapBackend)

beforeEach(() => {
  mockProxy.web.mockReset()
  mockProxy.web.mockImplementation((_req, res) => res.end())
})

/**
 * @description Verifies every method/path under this router is forwarded to
 * proxyCreator.web with the /authIapApi prefix stripped from req.url,
 * changeOrigin set, and the configured IAP_BACKEND_AUTH target.
 */
describe('ALL *', () => {
  it('should strip the /authIapApi prefix and proxy the request with changeOrigin to IAP_BACKEND_AUTH', async () => {
    await agent().get('/authIapApi/some/path')

    expect(mockProxy.web).toHaveBeenCalledTimes(1)
    const [req, , options] = mockProxy.web.mock.calls[0]
    expect(req.url).toBe('/some/path')
    expect(options).toEqual({ changeOrigin: true, target: 'https://iap-backend.test' })
  })

  it('should proxy non-GET methods the same way', async () => {
    await agent().post('/authIapApi/create')

    expect(mockProxy.web).toHaveBeenCalledTimes(1)
    expect(mockProxy.web.mock.calls[0][0].url).toBe('/create')
  })
})
