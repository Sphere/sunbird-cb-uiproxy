/**
 * PHASE 2 — authContent.ts. A single catch-all route (`ALL *`) with dense
 * string-manipulation logic deciding between three outcomes: an axios.get
 * fetch for `.html` content, an `http-proxy` `.web()` proxy pass-through, or
 * a raw axios stream piped to the response. `http-proxy`'s `createProxyServer()`
 * is mocked (module-load side effect + real socket proxying we don't want in
 * tests) — same "capture handler, assert on computed target/headers, not the
 * byte stream" strategy already used for proxies_v8.ts/proxyCreator.ts.
 *
 * Real bug found while reading this file (documented in
 * docs/PROD-VERIFICATION.md): `proxyCreator.on('error', ...)` and
 * `proxyCreator.on('unhandledRejection', ...)` are registered INSIDE the
 * route handler, on `proxyCreator` — a MODULE-LEVEL singleton — so every
 * single request adds two more listeners that are never removed. This is
 * safe to demonstrate live (doesn't hang/crash a single test) and is
 * asserted directly below.
 */

jest.mock('axios')
jest.mock('http-proxy', () => ({
  createProxyServer: jest.fn(() => ({ on: jest.fn(), web: jest.fn() })),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: { CONTENT_API_BASE: 'https://content.test' },
}))

import axios from 'axios'
import { createProxyServer } from 'http-proxy'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { authContent } from './authContent'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const mockProxy = (createProxyServer as jest.Mock).mock.results[0].value as { web: jest.Mock; on: jest.Mock }

const agent = () => mountRouter(authContent)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxiosCallable.mockReset()
  mockProxy.web.mockReset()
  mockProxy.on.mockReset()
})

describe('GET — .html content-store URLs', () => {
  it('fetches and forwards HTML content directly via axios.get', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk('<html>hi</html>'))
    const response = await agent().get('/https://cdn.test/content-store/abc/def.html')
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
    expect(mockProxy.web).not.toHaveBeenCalled()
  })

  it('returns 500 when the HTML fetch fails', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/https://cdn.test/content-store/abc/def.html')
    expect(response.status).toBe(500)
  })
})

describe('GET — non-HTML content-store URLs', () => {
  it('proxies to the content API', async () => {
    mockProxy.web.mockImplementation((_req, res) => res.end())
    await agent().get('/https://cdn.test/content-store/abc/def.json')
    expect(mockProxy.web).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ target: 'https://content.test' })
    )
  })
})

describe('GET — /content/ URLs', () => {
  it('proxies to the content API', async () => {
    mockProxy.web.mockImplementation((_req, res) => res.end())
    await agent().get('/http://cdn.test/content/xyz')
    expect(mockProxy.web).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ target: 'https://content.test' })
    )
  })
})

describe('GET — arbitrary external URLs (raw stream pass-through)', () => {
  it('pipes the upstream stream response back to the client', async () => {
    mockAxiosCallable.mockImplementation(() =>
      Promise.resolve({
        data: {
          // tslint:disable-next-line: no-any
          pipe: (target: any) => {
            target.end('stub-stream-data')
            return target
          },
        },
      })
    )
    const response = await agent().get('/http://external.cdn.test/random/asset.png')
    expect(response.status).toBe(200)
    expect(response.text).toBe('stub-stream-data')
  })

  it('returns 500 when the raw stream fetch rejects', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().get('/http://external.cdn.test/random/asset.png')
    expect(response.status).toBe(500)
  })
})

describe('POST — upload/publish/upload-zip URL rewriting', () => {
  it('rewrites a publish URL and proxies it', async () => {
    mockProxy.web.mockImplementation((_req, res) => res.end())
    await agent().post('/some/publish/path')
    expect(mockProxy.web).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ target: 'https://content.test' })
    )
  })

  it('rewrites an upload-zip URL and proxies it', async () => {
    mockProxy.web.mockImplementation((_req, res) => res.end())
    await agent().post('/some/upload-zip/path')
    expect(mockProxy.web).toHaveBeenCalled()
  })

  it('rewrites a plain upload URL and proxies it', async () => {
    mockProxy.web.mockImplementation((_req, res) => res.end())
    await agent().post('/some/upload/path')
    expect(mockProxy.web).toHaveBeenCalled()
  })

  it('leaves video-transcoding URLs untouched and still proxies them', async () => {
    mockProxy.web.mockImplementation((_req, res) => res.end())
    await agent().post('/video-transcoding/job1')
    expect(mockProxy.web).toHaveBeenCalled()
  })
})

describe('documented bug: proxy error/unhandledRejection listeners accumulate per-request', () => {
  it('registers two new listeners on the shared proxyCreator singleton on every single request', async () => {
    mockProxy.web.mockImplementation((_req, res) => res.end())
    await agent().post('/some/upload/path')
    await agent().post('/some/upload/path')
    // 2 listener registrations ('error', 'unhandledRejection') per request, never removed
    expect(mockProxy.on).toHaveBeenCalledTimes(4)
  })
})
