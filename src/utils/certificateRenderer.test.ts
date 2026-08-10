/**
 * fetchAndRenderCertificate — shared certificate fetch+render tail behind
 * appCertificateDownload.ts and publicCertifcateFlinkv2.ts (CHANGE 29).
 * Exercised directly against a bare mock Response, independent of either
 * call site's own test file.
 */

jest.mock('axios')
jest.mock('node-html-to-image', () => jest.fn())
jest.mock('./logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('./env', () => ({
  CONSTANTS: {
    HTTPS_HOST: 'https://kc.test',
    SB_API_KEY: 'sb-api-key',
  },
}))

import axios from 'axios'
import nodeHtmlToImage from 'node-html-to-image'
import { fetchAndRenderCertificate } from './certificateRenderer'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockNodeHtmlToImage = nodeHtmlToImage as unknown as jest.Mock

function mockResponse() {
  return {
    end: jest.fn(),
    writeHead: jest.fn(),
  } as unknown as import('express').Response
}

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockNodeHtmlToImage.mockReset()
})

/**
 * @description Verifies a successful upstream fetch renders the image and
 * writes it to the response with the given certificateName in the filename.
 */
it('renders and streams the image when the upstream responseCode is OK', async () => {
  mockAxiosCallable.mockResolvedValue({
    data: {
      responseCode: 'OK',
      result: { printUri: "data:image/svg+xml,<svg width='800' height='600'>...</svg>" },
    },
  })
  mockNodeHtmlToImage.mockResolvedValue(Buffer.from('fake-png-bytes'))
  const res = mockResponse()

  await fetchAndRenderCertificate(res, 'cert-1', 'MyCert')

  expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
    'Content-Disposition': expect.stringContaining('MyCert.png'),
  }))
  expect(res.end).toHaveBeenCalledWith(Buffer.from('fake-png-bytes'), 'binary')
})

/**
 * @description Verifies a non-OK responseCode throws using the upstream's
 * own params.errmsg/params.err, rather than writing a response itself —
 * callers are responsible for catching and responding.
 */
it('throws using the upstream error message when responseCode is not OK', async () => {
  mockAxiosCallable.mockResolvedValue({
    data: {
      params: { errmsg: 'not found' },
      responseCode: 'CLIENT_ERROR',
      result: { printUri: '' },
    },
  })
  mockNodeHtmlToImage.mockResolvedValue(Buffer.from(''))
  const res = mockResponse()

  await expect(fetchAndRenderCertificate(res, 'cert-1', 'MyCert')).rejects.toThrow('not found')
  expect(res.writeHead).not.toHaveBeenCalled()
})

/**
 * @description Concurrency: this helper is shared between two live routes
 * (appCertificateDownload.ts, publicCertifcateFlinkv2.ts) that can each
 * receive requests for different certificates at the same time. Fires 2
 * concurrent calls for different certificateId/certificateName pairs, with
 * axios routing its response by the requested certificate id, and confirms
 * each call's OWN response object gets its OWN certificate's image and
 * filename — never the other call's.
 */
it('concurrent calls for different certificates never cross-write to the wrong response', async () => {
  mockAxiosCallable.mockImplementation((config) => {
    const id = config.url.split('/').pop()
    const printUriById = {
      'cert-a': "data:image/svg+xml,<svg width='100' height='100'>A</svg>",
      'cert-b': "data:image/svg+xml,<svg width='200' height='200'>B</svg>",
    }
    return Promise.resolve({
      data: { responseCode: 'OK', result: { printUri: printUriById[id] } },
    })
  })
  mockNodeHtmlToImage.mockImplementation((opts) =>
    Promise.resolve(Buffer.from(opts.html.includes('>A</svg>') ? 'image-a' : 'image-b'))
  )
  const resA = mockResponse()
  const resB = mockResponse()

  await Promise.all([
    fetchAndRenderCertificate(resA, 'cert-a', 'CertificateA'),
    fetchAndRenderCertificate(resB, 'cert-b', 'CertificateB'),
  ])

  expect(resA.writeHead).toHaveBeenCalledWith(
    200,
    expect.objectContaining({ 'Content-Disposition': expect.stringContaining('CertificateA.png') })
  )
  expect(resA.end).toHaveBeenCalledWith(Buffer.from('image-a'), 'binary')
  expect(resB.writeHead).toHaveBeenCalledWith(
    200,
    expect.objectContaining({ 'Content-Disposition': expect.stringContaining('CertificateB.png') })
  )
  expect(resB.end).toHaveBeenCalledWith(Buffer.from('image-b'), 'binary')
})
