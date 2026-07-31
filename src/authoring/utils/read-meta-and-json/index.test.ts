/**
 * read-meta-and-json/index.ts is NOT an Express-route file — it exports two
 * plain async functions, `readJSONData` and `extractWebModuleData`. There is
 * no Router, no res object, and no try/catch anywhere in the file, so this
 * test file calls the exported functions directly and asserts on resolved
 * return values, per the plain-function style used in
 * src/authoring/utils/upload-meta-and-json/assessment.test.ts and
 * src/authoring/utils/cdn-url-replacer.test.ts.
 *
 * Dependencies actually imported by index.ts:
 *   - `readFromS3` from '../S3/read'      (used directly by extractWebModuleData)
 *   - `extractChannelData` from './channel' (thin wrapper around readFromS3)
 * Both are mocked wholesale below so their own axios/CONSTANTS internals
 * never run.
 *
 * Safety review: no Router/res.send anywhere, so none of the documented
 * hang/crash/bypass patterns (A-F) apply. Every branch is a plain `return`
 * of a promise, so all branches (including a rejected readFromS3) are safe
 * to exercise live as long as the test itself awaits/asserts on the promise
 * (which it does below) rather than leaving it unhandled.
 */

const mockExtractChannelData = jest.fn()
jest.mock('./channel', () => ({
  extractChannelData: (...args: unknown[]) => mockExtractChannelData(...args),
}))

const mockReadFromS3 = jest.fn()
jest.mock('../S3/read', () => ({
  readFromS3: (...args: unknown[]) => mockReadFromS3(...args),
}))

import { IDownloadS3Request } from '../../models/response/custom-s3-download'
import { extractWebModuleData, readJSONData } from './index'

const buildRequest = (overrides: Partial<IDownloadS3Request> = {}): IDownloadS3Request => ({
  artifactUrl: 'https://cdn/some/artifact.json',
  categoryType: 'Content',
  identifier: 'do_123',
  mimeType: 'application/json',
  ...overrides,
})

/**
 * @description Verifies readJSONData routes each mimeType/categoryType
 * combination to the correct data source (extractChannelData with either
 * the original or -key.json url, or the real extractWebModuleData for
 * web-module), and resolves null for falsy or unrecognized inputs.
 */
describe('readJSONData', () => {
  it('should resolve null when artifactUrl is falsy (empty string)', async () => {
    const result = await readJSONData(buildRequest({ artifactUrl: '' }))

    expect(result).toBeNull()
    expect(mockExtractChannelData).not.toHaveBeenCalled()
  })

  it('should resolve null for an unrecognized mimeType', async () => {
    const result = await readJSONData(buildRequest({ mimeType: 'application/unknown' }))

    expect(result).toBeNull()
    expect(mockExtractChannelData).not.toHaveBeenCalled()
  })

  it('should delegate to extractChannelData with the original url for application/channel', async () => {
    mockExtractChannelData.mockResolvedValueOnce({ channel: 'data' })

    const result = await readJSONData(
      buildRequest({ artifactUrl: 'https://cdn/channel.json', mimeType: 'application/channel' })
    )

    expect(result).toEqual({ channel: 'data' })
    expect(mockExtractChannelData).toHaveBeenCalledWith('https://cdn/channel.json')
  })

  it('should use the original url for application/quiz when categoryType is Quiz', async () => {
    mockExtractChannelData.mockResolvedValueOnce({ quiz: 'data' })

    const result = await readJSONData(
      buildRequest({
        artifactUrl: 'https://cdn/quiz.json',
        categoryType: 'Quiz',
        mimeType: 'application/quiz',
      })
    )

    expect(result).toEqual({ quiz: 'data' })
    expect(mockExtractChannelData).toHaveBeenCalledWith('https://cdn/quiz.json')
  })

  it('should use the -key.json url for application/quiz when categoryType is not Quiz', async () => {
    mockExtractChannelData.mockResolvedValueOnce({ key: 'data' })

    const result = await readJSONData(
      buildRequest({
        artifactUrl: 'https://cdn/quiz.json',
        categoryType: 'Content',
        mimeType: 'application/quiz',
      })
    )

    expect(result).toEqual({ key: 'data' })
    expect(mockExtractChannelData).toHaveBeenCalledWith('https://cdn/quiz-key.json')
  })

  it('should use the -key.json url for application/class-diagram when categoryType is not Quiz', async () => {
    mockExtractChannelData.mockResolvedValueOnce({ diagram: 'data' })

    const result = await readJSONData(
      buildRequest({
        artifactUrl: 'https://cdn/diagram.json',
        categoryType: 'Content',
        mimeType: 'application/class-diagram',
      })
    )

    expect(result).toEqual({ diagram: 'data' })
    expect(mockExtractChannelData).toHaveBeenCalledWith('https://cdn/diagram-key.json')
  })

  it('should delegate to extractWebModuleData (real implementation) for application/web-module', async () => {
    mockReadFromS3.mockImplementation((url: string) => {
      if (url === 'https://cdn/module/manifest.json') {
        return Promise.resolve([{ title: 'Page1', URL: '/page1.json' }])
      }
      return Promise.resolve({ page: 1 })
    })

    const result = (await readJSONData(
      buildRequest({
        artifactUrl: 'https://cdn/module/manifest.json',
        mimeType: 'application/web-module',
      })
      // tslint:disable-next-line: no-any
    )) as any

    expect(result.pageJson).toEqual([{ title: 'Page1', URL: '/page1.json' }])
    expect(result.pages).toEqual([{ page: 1 }])
    expect(mockExtractChannelData).not.toHaveBeenCalled()
  })
})

/**
 * @description Verifies extractWebModuleData fetches the manifest then each
 * page's URL, correctly derives the pageUrlBase from the artifact url,
 * handles an empty manifest, and propagates a manifest-fetch rejection.
 */
describe('extractWebModuleData', () => {
  it('should fetch the manifest, then fetch each page with a URL and push null for pages without one', async () => {
    mockReadFromS3.mockImplementation((url: string) => {
      if (url === 'https://cdn/module/manifest.json') {
        return Promise.resolve([
          { title: 'Page1', URL: '/page1.json' },
          { title: 'Page2' },
          { title: 'Page3', URL: '/page3.json' },
        ])
      }
      if (url === 'https://cdn/module/page1.json') {
        return Promise.resolve({ content: 'page1-data' })
      }
      if (url === 'https://cdn/module/page3.json') {
        return Promise.resolve({ content: 'page3-data' })
      }
      throw new Error(`unexpected readFromS3 url: ${url}`)
    })

    const result = await extractWebModuleData('https://cdn/module/manifest.json')

    expect(mockReadFromS3).toHaveBeenCalledWith('https://cdn/module/manifest.json')
    expect(mockReadFromS3).toHaveBeenCalledWith('https://cdn/module/page1.json')
    expect(mockReadFromS3).toHaveBeenCalledWith('https://cdn/module/page3.json')
    expect(mockReadFromS3).not.toHaveBeenCalledWith('https://cdn/module/undefined')
    // tslint:disable-next-line: no-any
    expect((result as any).pageJson).toEqual([
      { title: 'Page1', URL: '/page1.json' },
      { title: 'Page2' },
      { title: 'Page3', URL: '/page3.json' },
    ])
    // Entries without a URL never call readFromS3, but still get an entry
    // pushed into `pages` (null) because the loop tests the truthiness of
    // the per-item Promise object itself, not its resolved value — the
    // Promise is always truthy, so every mapped entry is awaited and pushed.
    // tslint:disable-next-line: no-any
    expect((result as any).pages).toEqual([{ content: 'page1-data' }, null, { content: 'page3-data' }])
  })

  it('should derive pageUrlBase by stripping /manifest.json from the artifact url', async () => {
    mockReadFromS3.mockImplementation((url: string) => {
      if (url === 'https://cdn/base/nested/manifest.json') {
        return Promise.resolve([{ title: 'Only', URL: '/only.json' }])
      }
      return Promise.resolve({ found: url })
    })

    const result = await extractWebModuleData('https://cdn/base/nested/manifest.json')

    expect(mockReadFromS3).toHaveBeenCalledWith('https://cdn/base/nested/only.json')
    // tslint:disable-next-line: no-any
    expect((result as any).pages).toEqual([{ found: 'https://cdn/base/nested/only.json' }])
  })

  it('should resolve to an empty pages array when the manifest itself is empty', async () => {
    mockReadFromS3.mockResolvedValueOnce([])

    const result = await extractWebModuleData('https://cdn/empty/manifest.json')

    // tslint:disable-next-line: no-any
    expect((result as any).pageJson).toEqual([])
    // tslint:disable-next-line: no-any
    expect((result as any).pages).toEqual([])
  })

  it('should propagate a rejection from readFromS3 for the manifest fetch', async () => {
    mockReadFromS3.mockRejectedValueOnce(new Error('manifest fetch failed'))

    await expect(extractWebModuleData('https://cdn/broken/manifest.json')).rejects.toThrow(
      'manifest fetch failed'
    )
  })
})
