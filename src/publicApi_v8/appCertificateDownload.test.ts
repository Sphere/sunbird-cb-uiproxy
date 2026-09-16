/**
 * PHASE 2 — appCertificateDownload.ts. One route, structurally identical to
 * publicCertifcateFlinkv2.ts's certificate-rendering logic (same width/
 * height-from-SVG parsing, same node-html-to-image call, same writeHead/end
 * pattern) but WITHOUT that file's secret-key mechanism at all — this route
 * has no auth/secret check whatsoever beyond "certificateId is present".
 * Noted for awareness alongside change AR in docs/PROD-VERIFICATION.md, not
 * necessarily a bug on its own (may be intentional — the certificateId
 * itself may function as an unguessable capability token by design; not
 * something a test can determine).
 *
 * Real bug found (documented in docs/PROD-VERIFICATION.md, NOT reproduced
 * live): `if (!certificateId) { res.status(400)... }` has no `return`,
 * falling through to a real axios call with `certificateId=undefined` in
 * the URL — same double-send cascade pattern as every other file in this
 * "certificate" family.
 */

jest.mock('axios')
jest.mock('node-html-to-image', () => jest.fn())
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    HTTPS_HOST: 'https://kc.test',
    SB_API_KEY: 'sb-api-key',
  },
}))

import axios from 'axios'
import nodeHtmlToImage from 'node-html-to-image'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { appCertificateDownload } from './appCertificateDownload'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockNodeHtmlToImage = nodeHtmlToImage as unknown as jest.Mock

const agent = () => mountRouter(appCertificateDownload)

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockNodeHtmlToImage.mockReset()
})

/**
 * @description Verifies GET /download renders and returns the certificate
 * image with the correct filename and dimensions when certificateId is
 * valid, and returns 500 on download failures or a non-OK responseCode.
 */
describe('GET /download (with a valid certificateId — the only path that responds exactly once)', () => {
  it('should render and return the certificate image', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({ responseCode: 'OK', result: { printUri: "data:image/svg+xml,<svg width='800' height='600'>...</svg>" } })
    )
    mockNodeHtmlToImage.mockResolvedValue(Buffer.from('fake-png-bytes'))

    const response = await agent().get('/download?certificateId=cert-1&certificateName=MyCert')

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('image/png')
    expect(response.headers['content-disposition']).toContain('MyCert.png')
  })

  it('should default the filename to "certificate" when certificateName is omitted', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({ responseCode: 'OK', result: { printUri: "data:image/svg+xml,<svg width='800' height='600'>...</svg>" } })
    )
    mockNodeHtmlToImage.mockResolvedValue(Buffer.from('fake-png-bytes'))

    const response = await agent().get('/download?certificateId=cert-1')
    expect(response.status).toBe(200)
    expect(response.headers['content-disposition']).toContain('certificate.png')
  })

  it('should fall back to default width/height when the printUri has no <svg width=\'...\'> marker', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({ responseCode: 'OK', result: { printUri: 'data:image/svg+xml,<svg>no-width-marker</svg>' } })
    )
    mockNodeHtmlToImage.mockResolvedValue(Buffer.from('fake-png-bytes'))

    const response = await agent().get('/download?certificateId=cert-1')
    expect(response.status).toBe(200)
    expect(mockNodeHtmlToImage).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.stringContaining('width:1400px') })
    )
  })

  it('should return 500 when the certificate download call fails', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().get('/download?certificateId=cert-1')
    expect(response.status).toBe(500)
  })

  it('should return 500 when the upstream reports a non-OK responseCode', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({ params: { errmsg: 'not found' }, responseCode: 'CLIENT_ERROR', result: { printUri: '' } })
    )
    const response = await agent().get('/download?certificateId=cert-1')
    expect(response.status).toBe(500)
  })

  // NOTE: a missing certificateId is a documented double-send bug — not
  // reproduced live. See docs/PROD-VERIFICATION.md.
})
