/**
 * src/authoring/utils/upload-meta-and-json/class-diagram.ts is NOT an
 * Express-route file — it exports one plain async function,
 * `uploadClassdiagramData`, which fans out to two `uploadToS3` calls (a
 * "with key" file that keeps class type/access/belongsTo and relations
 * intact, and a "without key" file with those fields stripped) and combines
 * their results. `removeKeyFromClassDiagram` is a private (unexported)
 * helper exercised indirectly through `uploadClassdiagramData` by
 * inspecting the second `uploadToS3` call's arguments.
 *
 * class-diagram.ts itself imports no CONSTANTS/logger — only `uploadToS3`
 * from `../S3/upload`, which is mocked wholesale below (same pattern as
 * assessment.test.ts) so its own axios/CONSTANTS internals never run. No
 * jest.mock('express') or mountRouter needed, per the plain-function style
 * in assessment.test.ts / index.test.ts in this same directory.
 *
 * No try/catch, res.send, or Router involved anywhere in this file, so none
 * of the documented hang/crash/bypass patterns (A-F) apply here — every
 * branch below is safe to exercise live.
 */

import { IUploadS3Request } from '../../models/response/custom-s3-upload'
import { IClassDiagram } from '../../models/class-diagram'
import { uploadClassdiagramData } from './class-diagram'

const mockUploadToS3 = jest.fn()
jest.mock('../S3/upload', () => ({
  uploadToS3: (...args: unknown[]) => mockUploadToS3(...args),
}))

/**
 * @description Verifies uploadClassdiagramData uploads an untouched
 * "with key" file and a stripped "without key" file (class
 * type/access/belongsTo cleared, relations emptied) via two uploadToS3
 * calls, and that it surfaces the correct error/artifact result depending
 * on which upload(s) fail.
 */
describe('uploadClassdiagramData', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const buildClassDiagram = (): IClassDiagram => ({
    options: {
      classes: [
        { access: 'public', belongsTo: 'ModuleA', name: 'Animal', type: 'abstract' },
        { access: 'private', belongsTo: 'ModuleB', name: 'Dog', type: 'concrete' },
      ],
      relations: [{ relation: 'inherits', source: 'Dog', target: 'Animal' }],
    },
    problemStatement: 'Model an animal hierarchy',
    timeLimit: 120,
  })

  const buildRequest = (): IUploadS3Request<IClassDiagram> => ({
    categoryType: 'class-diagram',
    data: buildClassDiagram(),
    identfier: 'do_123',
    mimeType: 'application/class-diagram',
    path: 'class-diagram/do_123',
  })

  // uploadToS3 is invoked twice per uploadClassdiagramData call: once for
  // the (untouched) key file and once for the stripped file. Resolve based
  // on the fileName argument so ordering assumptions aren't needed.
  const mockUploadToS3Impl = (
    keyResult: { artifactUrl: string | null; downloadUrl: string | null; error: {} | null },
    withoutKeyResult: { artifactUrl: string | null; downloadUrl: string | null; error: {} | null }
  ) => {
    mockUploadToS3.mockImplementation((_data: unknown, _path: string, fileName: string) => {
      if (fileName === 'class-diagram-key.json') {
        return Promise.resolve(keyResult)
      }
      return Promise.resolve(withoutKeyResult)
    })
  }

  it('should return the without-key report when both uploads succeed', async () => {
    mockUploadToS3Impl(
      { artifactUrl: 'http://cdn/key', downloadUrl: 'http://cdn/key/dl', error: null },
      { artifactUrl: 'http://cdn/without-key', downloadUrl: 'http://cdn/without-key/dl', error: null }
    )
    const request = buildRequest()

    const result = await uploadClassdiagramData(request)

    expect(result).toEqual({
      artifactUrl: 'http://cdn/without-key',
      downloadUrl: 'http://cdn/without-key/dl',
      error: null,
    })
    expect(mockUploadToS3).toHaveBeenCalledTimes(2)
  })

  it('should call uploadToS3 for the key file with the original, unmodified data', async () => {
    mockUploadToS3Impl(
      { artifactUrl: 'a', downloadUrl: 'b', error: null },
      { artifactUrl: 'c', downloadUrl: 'd', error: null }
    )
    const request = buildRequest()

    await uploadClassdiagramData(request)

    const keyCall = mockUploadToS3.mock.calls.find((call) => call[2] === 'class-diagram-key.json')
    expect(keyCall).toBeDefined()
    expect(keyCall[0]).toEqual(request.data)
    expect(keyCall[1]).toBe(request.path)
    // Original request data must be untouched by removeKeyFromClassDiagram.
    expect(request.data.options.classes[0].belongsTo).toBe('ModuleA')
    expect(request.data.options.classes[0].type).toBe('abstract')
    expect(request.data.options.classes[0].access).toBe('public')
    expect(request.data.options.relations).toEqual([{ relation: 'inherits', source: 'Dog', target: 'Animal' }])
  })

  it('should strip belongsTo/type/access from every class and clear relations for the without-key file', async () => {
    mockUploadToS3Impl(
      { artifactUrl: 'a', downloadUrl: 'b', error: null },
      { artifactUrl: 'c', downloadUrl: 'd', error: null }
    )
    const request = buildRequest()

    await uploadClassdiagramData(request)

    const withoutKeyCall = mockUploadToS3.mock.calls.find((call) => call[2] === 'class-diagram.json')
    expect(withoutKeyCall).toBeDefined()
    const processed = withoutKeyCall[0] as IClassDiagram

    expect(processed.options.classes).toEqual([
      { access: '', belongsTo: '', name: 'Animal', type: '' },
      { access: '', belongsTo: '', name: 'Dog', type: '' },
    ])
    expect(processed.options.relations).toEqual([])
    expect(withoutKeyCall[1]).toBe(request.path)
  })

  it('should return a null-artifact error object when the key upload fails', async () => {
    mockUploadToS3Impl(
      { artifactUrl: null, downloadUrl: null, error: 'key upload failed' },
      { artifactUrl: 'http://cdn/without-key', downloadUrl: 'http://cdn/without-key/dl', error: null }
    )

    const result = await uploadClassdiagramData(buildRequest())

    expect(result).toEqual({
      artifactUrl: null,
      downloadUrl: null,
      error: 'key upload failed',
    })
  })

  it('should return a null-artifact error object when the without-key upload fails', async () => {
    mockUploadToS3Impl(
      { artifactUrl: 'http://cdn/key', downloadUrl: 'http://cdn/key/dl', error: null },
      { artifactUrl: null, downloadUrl: null, error: 'without-key upload failed' }
    )

    const result = await uploadClassdiagramData(buildRequest())

    expect(result).toEqual({
      artifactUrl: null,
      downloadUrl: null,
      error: 'without-key upload failed',
    })
  })

  it('should prefer the key error when both uploads fail', async () => {
    mockUploadToS3Impl(
      { artifactUrl: null, downloadUrl: null, error: 'key failed' },
      { artifactUrl: null, downloadUrl: null, error: 'without-key failed' }
    )

    const result = await uploadClassdiagramData(buildRequest())

    expect(result.error).toBe('key failed')
  })
})
