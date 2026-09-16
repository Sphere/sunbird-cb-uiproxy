/**
 * src/authoring/utils/upload-meta-and-json/web-module.ts is NOT an
 * Express-route file — it exports one plain async function,
 * `uploadWebModuleData`, which fans out to one `uploadToS3` call per item in
 * `data.data` (an array of { name, content } web-module files), appending
 * `/assets` to the upload path for files whose name ends in `.html`, and
 * then folds all the per-item reports into a single IWebModuleUploadResponse
 * — copying artifactUrl/downloadUrl to the top level from whichever report's
 * artifactUrl ends in "json" (last one wins if several do), collecting every
 * report into subResult, and leaving `error` untouched at its initial `null`
 * regardless of any individual report's error.
 *
 * web-module.ts itself imports no CONSTANTS/logger — only `uploadToS3` from
 * `../S3/upload`, which is mocked wholesale below (same pattern as
 * assessment.test.ts / class-diagram.test.ts in this same directory) so its
 * own axios/CONSTANTS internals never run. No jest.mock('express') or
 * mountRouter needed, per the plain-function style used by those siblings.
 *
 * No try/catch, res.send, or Router involved anywhere in this file, so none
 * of the documented hang/crash/bypass patterns (A-F) apply here — every
 * branch below is safe to exercise live, including the rejected-promise
 * case (it simply propagates as a rejected promise to the caller, there is
 * no response object to double-send or leave hanging).
 */

import { IUploadS3Request, IWebModuleRequest } from '../../models/response/custom-s3-upload'
import { uploadWebModuleData } from './web-module'

const mockUploadToS3 = jest.fn()
jest.mock('../S3/upload', () => ({
  uploadToS3: (...args: unknown[]) => mockUploadToS3(...args),
}))

/**
 * @description Verifies uploadWebModuleData calls uploadToS3 once per
 * web-module item (appending /assets to the path only for .html files),
 * aggregates each report into subResult in order, promotes the
 * artifactUrl/downloadUrl of whichever report's artifactUrl ends in "json"
 * to the top level (last match wins), leaves error permanently null, and
 * handles the empty-array and rejected-upload cases correctly.
 */
describe('uploadWebModuleData', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const buildRequest = (items: IWebModuleRequest[]): IUploadS3Request<IWebModuleRequest[]> => ({
    categoryType: 'web-module',
    data: items,
    identfier: 'do_123',
    mimeType: 'application/web-module',
    path: 'web-module/do_123',
  })

  it('should call uploadToS3 once per item, appending /assets to the path only for .html files', async () => {
    mockUploadToS3.mockImplementation((_content: unknown, _path: string, name: string) =>
      Promise.resolve({ artifactUrl: `http://cdn/${name}`, downloadUrl: `http://cdn/${name}/dl`, error: null })
    )
    const request = buildRequest([
      { content: '<div>hi</div>', name: 'index.html' },
      { content: { foo: 'bar' }, name: 'meta.json' },
    ])

    await uploadWebModuleData(request)

    expect(mockUploadToS3).toHaveBeenCalledTimes(2)
    expect(mockUploadToS3).toHaveBeenCalledWith('<div>hi</div>', 'web-module/do_123/assets', 'index.html')
    expect(mockUploadToS3).toHaveBeenCalledWith({ foo: 'bar' }, 'web-module/do_123', 'meta.json')
  })

  it('should include every item report in subResult, in original order', async () => {
    mockUploadToS3.mockImplementation((_content: unknown, _path: string, name: string) =>
      Promise.resolve({ artifactUrl: `http://cdn/${name}`, downloadUrl: `http://cdn/${name}/dl`, error: null })
    )
    const request = buildRequest([
      { content: 'a', name: 'first.js' },
      { content: 'b', name: 'second.css' },
      { content: 'c', name: 'third.html' },
    ])

    const result = await uploadWebModuleData(request)

    expect(result.subResult).toEqual([
      { name: 'first.js', artifactUrl: 'http://cdn/first.js', downloadUrl: 'http://cdn/first.js/dl', error: null },
      { name: 'second.css', artifactUrl: 'http://cdn/second.css', downloadUrl: 'http://cdn/second.css/dl', error: null },
      { name: 'third.html', artifactUrl: 'http://cdn/third.html', downloadUrl: 'http://cdn/third.html/dl', error: null },
    ])
  })

  it('should promote artifactUrl/downloadUrl to the top level from the report whose artifactUrl ends in json', async () => {
    mockUploadToS3.mockImplementation((_content: unknown, _path: string, name: string) => {
      if (name === 'meta.json') {
        return Promise.resolve({ artifactUrl: 'http://cdn/meta.json', downloadUrl: 'http://cdn/meta.json/dl', error: null })
      }
      return Promise.resolve({ artifactUrl: 'http://cdn/index.html', downloadUrl: 'http://cdn/index.html/dl', error: null })
    })
    const request = buildRequest([
      { content: '<div>hi</div>', name: 'index.html' },
      { content: { foo: 'bar' }, name: 'meta.json' },
    ])

    const result = await uploadWebModuleData(request)

    expect(result.artifactUrl).toBe('http://cdn/meta.json')
    expect(result.downloadUrl).toBe('http://cdn/meta.json/dl')
  })

  it('should leave artifactUrl and downloadUrl null when no report artifactUrl ends in json', async () => {
    mockUploadToS3.mockImplementation((_content: unknown, _path: string, name: string) =>
      Promise.resolve({ artifactUrl: `http://cdn/${name}`, downloadUrl: `http://cdn/${name}/dl`, error: null })
    )
    const request = buildRequest([
      { content: '<div>hi</div>', name: 'index.html' },
      { content: 'body{}', name: 'style.css' },
    ])

    const result = await uploadWebModuleData(request)

    expect(result.artifactUrl).toBeNull()
    expect(result.downloadUrl).toBeNull()
  })

  it('should keep the last json-ending report win when multiple reports end in json', async () => {
    mockUploadToS3.mockImplementation((_content: unknown, _path: string, name: string) =>
      Promise.resolve({ artifactUrl: `http://cdn/${name}`, downloadUrl: `http://cdn/${name}/dl`, error: null })
    )
    const request = buildRequest([
      { content: 'a', name: 'first.json' },
      { content: 'b', name: 'second.json' },
    ])

    const result = await uploadWebModuleData(request)

    expect(result.artifactUrl).toBe('http://cdn/second.json')
    expect(result.downloadUrl).toBe('http://cdn/second.json/dl')
  })

  it('should always return error null at the top level even when individual reports carry an error', async () => {
    mockUploadToS3.mockImplementation((_content: unknown, _path: string, name: string) =>
      Promise.resolve({ artifactUrl: null, downloadUrl: null, error: `upload of ${name} failed` })
    )
    const request = buildRequest([{ content: 'a', name: 'broken.js' }])

    const result = await uploadWebModuleData(request)

    // Documents current behavior: uploadWebModuleData never copies a
    // report's `error` field up to the top level, so callers relying on
    // result.error to detect a failed sub-upload will miss it. Not a
    // crash/hang, but recorded here as the observed real behavior.
    expect(result.error).toBeNull()
    expect(result.subResult[0].error).toBe('upload of broken.js failed')
  })

  it('should return null fields and an empty subResult for an empty data array', async () => {
    const request = buildRequest([])

    const result = await uploadWebModuleData(request)

    expect(result).toEqual({
      artifactUrl: null,
      downloadUrl: null,
      error: null,
      subResult: [],
    })
    expect(mockUploadToS3).not.toHaveBeenCalled()
  })

  it('should propagate a rejection when uploadToS3 rejects', async () => {
    mockUploadToS3.mockRejectedValue(new Error('network down'))
    const request = buildRequest([{ content: 'a', name: 'index.html' }])

    await expect(uploadWebModuleData(request)).rejects.toThrow('network down')
  })
})
