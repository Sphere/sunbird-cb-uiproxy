/**
 * uploadToS3.ts — a plain async helper (no Router, no res.send). It builds a
 * real `form-data` multipart body (the `form-data` package itself is not
 * mocked — it has no network/module-load side effects, only in-memory
 * buffering) and posts it via axios, fully wrapped in try/catch with a
 * guarded error fallback. No Pattern A-F hazards apply.
 */

jest.mock('axios')
jest.mock('../../../utils/env', () => ({
  CONSTANTS: {
    CONTENT_API_BASE: 'https://content.test',
  },
}))

import axios from 'axios'
import { uploadToS3 } from './upload'

const mockAxiosPost = axios.post as jest.Mock

beforeEach(() => {
  mockAxiosPost.mockReset()
})

/**
 * @description Verifies uploadToS3 posts a multipart form built from the
 * given data/path/fileName and maps the upstream response into the
 * artifactUrl/downloadUrl shape on success.
 */
describe('uploadToS3', () => {
  it('should return the artifact and download URLs on a successful upload', async () => {
    mockAxiosPost.mockResolvedValue({
      data: { artifactURL: 'https://cdn.test/a.json', downloadURL: 'https://cdn.test/d.json' },
    })

    const result = await uploadToS3({ foo: 'bar' }, 'content/type/id', 'meta.json')

    expect(result).toEqual({
      artifactUrl: 'https://cdn.test/a.json',
      downloadUrl: 'https://cdn.test/d.json',
      error: null,
    })
  })

  it('should URL-encode forward slashes in the path when building the upload URL', async () => {
    mockAxiosPost.mockResolvedValue({ data: { artifactURL: 'a', downloadURL: 'd' } })

    await uploadToS3({}, 'content/type/id', 'meta.json')

    expect(mockAxiosPost).toHaveBeenCalledWith(
      'https://content.test/contentv3/upload/content%2Ftype%2Fid',
      expect.anything(),
      expect.objectContaining({ headers: expect.any(Object) })
    )
  })

  /**
   * @description Verifies uploadToS3's own try/catch converts any upstream
   * failure into a resolved value with an error field set, rather than
   * throwing or leaving artifactUrl/downloadUrl populated.
   */
  describe('on upstream failure', () => {
    it('should return the upstream error body when the upload call fails with a response', async () => {
      mockAxiosPost.mockRejectedValue({
        response: { data: { message: 'upload rejected' } },
      })

      const result = await uploadToS3({}, 'content/type/id', 'meta.json')

      expect(result).toEqual({
        artifactUrl: null,
        downloadUrl: null,
        error: { message: 'upload rejected' },
      })
    })

    it('should fall back to a generic error message on a transport-level failure', async () => {
      mockAxiosPost.mockRejectedValue(new Error('network down'))

      const result = await uploadToS3({}, 'content/type/id', 'meta.json')

      expect(result).toEqual({
        artifactUrl: null,
        downloadUrl: null,
        error: 'Failed due to unkown reason',
      })
    })
  })
})
