/**
 * read.ts — a plain async helper (no Router, no res.send). It re-encodes the
 * incoming URL's path segments, GETs the resulting content URL via axios, and
 * tries to JSON.parse the response body, falling back to the raw body if
 * parsing fails. The axios.get call itself is not wrapped in try/catch, but
 * since this is a plain function (not an Express handler), a rejected axios
 * call simply propagates as a rejected promise -- no hang/crash risk, so it
 * is safe to exercise live with `.rejects`. No Pattern A/B/D/F hazards apply.
 */

jest.mock('axios')
jest.mock('../../../utils/env', () => ({
  CONSTANTS: {
    CONTENT_API_BASE: 'https://content.test',
  },
}))

import axios from 'axios'
import { readFromS3 } from './read'

const mockAxiosGet = axios.get as jest.Mock

beforeEach(() => {
  mockAxiosGet.mockReset()
})

/**
 * @description Verifies readFromS3 builds the download URL by dropping the
 * first four path segments and re-joining the remainder with '%2F', then
 * requests it via axios.get using the shared axiosRequestConfig.
 */
describe('readFromS3', () => {
  it('should request the content URL built from the trailing path segments', async () => {
    mockAxiosGet.mockResolvedValue({ data: '{}' })

    await readFromS3('a/b/c/d/e/f')

    expect(mockAxiosGet).toHaveBeenCalledWith(
      'https://content.test/contentv3/download/e%2Ff',
      expect.any(Object)
    )
  })

  /**
   * @description Verifies the JSON.parse success path: when the upstream
   * response body is a valid JSON string, readFromS3 returns the parsed
   * object rather than the raw string.
   */
  describe('when the response body is valid JSON', () => {
    it('should return the parsed object', async () => {
      mockAxiosGet.mockResolvedValue({ data: '{"foo":"bar"}' })

      const result = await readFromS3('a/b/c/d/e/f')

      expect(result).toEqual({ foo: 'bar' })
    })
  })

  /**
   * @description Verifies the JSON.parse fallback path: when the upstream
   * response body is not valid JSON (e.g. already an object, or plain
   * text), readFromS3 catches the parse error and returns the raw body
   * unchanged instead of throwing.
   */
  describe('when the response body is not valid JSON', () => {
    it('should return the raw response data unchanged', async () => {
      const rawData = { already: 'an object' }
      mockAxiosGet.mockResolvedValue({ data: rawData })

      const result = await readFromS3('a/b/c/d/e/f')

      expect(result).toBe(rawData)
    })

    it('should return the raw string when it is plain text rather than JSON', async () => {
      mockAxiosGet.mockResolvedValue({ data: 'not json' })

      const result = await readFromS3('a/b/c/d/e/f')

      expect(result).toBe('not json')
    })
  })

  /**
   * @description Verifies that a failed upstream request propagates as a
   * rejected promise, since axios.get here is not wrapped in try/catch.
   * Safe to exercise live because this is a plain function, not a route
   * handler with a response to send.
   */
  describe('on upstream failure', () => {
    it('should reject when the axios call fails', async () => {
      mockAxiosGet.mockRejectedValue(new Error('network down'))

      await expect(readFromS3('a/b/c/d/e/f')).rejects.toThrow('network down')
    })
  })
})
