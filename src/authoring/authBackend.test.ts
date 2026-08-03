/**
 * authBackend.ts is a bare `http-proxy` pass-through — `createProxyServer()`
 * runs at import time (module-load side effect, mocked below, same pattern
 * proven in authContent.test.ts).
 */

jest.mock('http-proxy', () => ({
  createProxyServer: jest.fn(() => ({ on: jest.fn(), web: jest.fn() })),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    AUTHORING_BACKEND: 'https://authoring-backend.test',
  },
}))

import { createProxyServer } from 'http-proxy'
import { authBackend } from './authBackend'
import { mountRouter } from '../test-support/mountRouter'

const mockProxy = (createProxyServer as jest.Mock).mock.results[0].value as { web: jest.Mock }

const agent = () => mountRouter(authBackend)

beforeEach(() => {
  mockProxy.web.mockReset()
  mockProxy.web.mockImplementation((_req, res) => res.end())
})

/**
 * @description Verifies every method/path under this router is forwarded to
 * proxyCreator.web with the /authApi prefix stripped from req.url and the
 * configured AUTHORING_BACKEND target.
 */
describe('ALL *', () => {
  it('should strip the /authApi prefix and proxy the request to AUTHORING_BACKEND', async () => {
    await agent().get('/authApi/some/path')

    expect(mockProxy.web).toHaveBeenCalledTimes(1)
    const [req, , options] = mockProxy.web.mock.calls[0]
    expect(req.url).toBe('/some/path')
    expect(options).toEqual({ target: 'https://authoring-backend.test' })
  })

  it('should proxy non-GET methods the same way', async () => {
    await agent().post('/authApi/create')

    expect(mockProxy.web).toHaveBeenCalledTimes(1)
    expect(mockProxy.web.mock.calls[0][0].url).toBe('/create')
  })
})
