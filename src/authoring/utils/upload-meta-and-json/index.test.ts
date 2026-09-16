/**
 * src/authoring/utils/upload-meta-and-json/index.ts is NOT an Express-route
 * file — it exports one plain function, `uploadJSONData`, which is a pure
 * dispatcher: it inspects `content.mimeType` (and, for the quiz mimeType,
 * `content.categoryType` too) and delegates to exactly one of five sibling
 * upload helpers, falling back to `uploadUnKownData` when nothing matches.
 *
 * index.ts itself imports no CONSTANTS/logger and has no try/catch, res.send,
 * or Router involved, so none of the documented hang/crash/bypass patterns
 * (A-F) apply here — every branch is safe to exercise live. All five sibling
 * modules are mocked wholesale (same style as assessment.test.ts mocking
 * '../S3/upload') so their own internals never run and each call can be
 * asserted on in isolation.
 */

import { IUploadS3Request } from '../../models/response/custom-s3-upload'
import { uploadAssessmentData } from './assessment'
import { uploadChannelData } from './channel'
import { uploadClassdiagramData } from './class-diagram'
import { uploadJSONData } from './index'
import { uploadQuizData } from './quiz'
import { uploadUnKownData } from './unkown'
import { uploadWebModuleData } from './web-module'

jest.mock('./channel', () => ({
  uploadChannelData: jest.fn(),
}))
jest.mock('./quiz', () => ({
  uploadQuizData: jest.fn(),
}))
jest.mock('./assessment', () => ({
  uploadAssessmentData: jest.fn(),
}))
jest.mock('./web-module', () => ({
  uploadWebModuleData: jest.fn(),
}))
jest.mock('./class-diagram', () => ({
  uploadClassdiagramData: jest.fn(),
}))
jest.mock('./unkown', () => ({
  uploadUnKownData: jest.fn(),
}))

const mockUploadChannelData = uploadChannelData as jest.Mock
const mockUploadQuizData = uploadQuizData as jest.Mock
const mockUploadAssessmentData = uploadAssessmentData as jest.Mock
const mockUploadWebModuleData = uploadWebModuleData as jest.Mock
const mockUploadClassdiagramData = uploadClassdiagramData as jest.Mock
const mockUploadUnKownData = uploadUnKownData as jest.Mock

const buildRequest = (mimeType: string, categoryType: string = 'irrelevant'): IUploadS3Request<{}> => ({
  categoryType,
  data: {},
  identfier: 'do_123',
  mimeType,
  path: 'some/path',
})

/**
 * @description Verifies uploadJSONData routes each mimeType/categoryType
 * combination to exactly one sibling upload helper, resolves with that
 * helper's result, and falls back to uploadUnKownData for anything
 * unrecognized.
 */
describe('uploadJSONData', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should delegate to uploadChannelData when mimeType is application/channel', async () => {
    const expected = { artifactUrl: 'channel-url', downloadUrl: 'dl', error: null }
    mockUploadChannelData.mockResolvedValue(expected)
    const request = buildRequest('application/channel')

    const result = await uploadJSONData(request)

    expect(mockUploadChannelData).toHaveBeenCalledWith(request)
    expect(mockUploadChannelData).toHaveBeenCalledTimes(1)
    expect(mockUploadQuizData).not.toHaveBeenCalled()
    expect(mockUploadAssessmentData).not.toHaveBeenCalled()
    expect(mockUploadWebModuleData).not.toHaveBeenCalled()
    expect(mockUploadClassdiagramData).not.toHaveBeenCalled()
    expect(mockUploadUnKownData).not.toHaveBeenCalled()
    expect(result).toBe(expected)
  })

  it('should delegate to uploadQuizData when mimeType is application/quiz and categoryType is Quiz', async () => {
    const expected = { artifactUrl: 'quiz-url', downloadUrl: 'dl', error: null }
    mockUploadQuizData.mockResolvedValue(expected)
    const request = buildRequest('application/quiz', 'Quiz')

    const result = await uploadJSONData(request)

    expect(mockUploadQuizData).toHaveBeenCalledWith(request)
    expect(mockUploadQuizData).toHaveBeenCalledTimes(1)
    expect(mockUploadAssessmentData).not.toHaveBeenCalled()
    expect(mockUploadUnKownData).not.toHaveBeenCalled()
    expect(result).toBe(expected)
  })

  it('should delegate to uploadAssessmentData when mimeType is application/quiz and categoryType is Assessment', async () => {
    const expected = { artifactUrl: 'assessment-url', downloadUrl: 'dl', error: null }
    mockUploadAssessmentData.mockResolvedValue(expected)
    const request = buildRequest('application/quiz', 'Assessment')

    const result = await uploadJSONData(request)

    expect(mockUploadAssessmentData).toHaveBeenCalledWith(request)
    expect(mockUploadAssessmentData).toHaveBeenCalledTimes(1)
    expect(mockUploadQuizData).not.toHaveBeenCalled()
    expect(mockUploadUnKownData).not.toHaveBeenCalled()
    expect(result).toBe(expected)
  })

  it('should fall back to uploadUnKownData when mimeType is application/quiz but categoryType matches neither Quiz nor Assessment', async () => {
    const expected = { artifactUrl: null, downloadUrl: null, error: 'unknown' }
    mockUploadUnKownData.mockResolvedValue(expected)
    const request = buildRequest('application/quiz', 'SomethingElse')

    const result = await uploadJSONData(request)

    expect(mockUploadUnKownData).toHaveBeenCalledWith(request)
    expect(mockUploadUnKownData).toHaveBeenCalledTimes(1)
    expect(mockUploadQuizData).not.toHaveBeenCalled()
    expect(mockUploadAssessmentData).not.toHaveBeenCalled()
    expect(result).toBe(expected)
  })

  it('should delegate to uploadWebModuleData when mimeType is application/web-module', async () => {
    const expected = { artifactUrl: 'web-module-url', downloadUrl: 'dl', error: null }
    mockUploadWebModuleData.mockResolvedValue(expected)
    const request = buildRequest('application/web-module')

    const result = await uploadJSONData(request)

    expect(mockUploadWebModuleData).toHaveBeenCalledWith(request)
    expect(mockUploadWebModuleData).toHaveBeenCalledTimes(1)
    expect(mockUploadUnKownData).not.toHaveBeenCalled()
    expect(result).toBe(expected)
  })

  it('should delegate to uploadClassdiagramData when mimeType is application/class-diagram', async () => {
    const expected = { artifactUrl: 'class-diagram-url', downloadUrl: 'dl', error: null }
    mockUploadClassdiagramData.mockResolvedValue(expected)
    const request = buildRequest('application/class-diagram')

    const result = await uploadJSONData(request)

    expect(mockUploadClassdiagramData).toHaveBeenCalledWith(request)
    expect(mockUploadClassdiagramData).toHaveBeenCalledTimes(1)
    expect(mockUploadUnKownData).not.toHaveBeenCalled()
    expect(result).toBe(expected)
  })

  it('should fall back to uploadUnKownData when mimeType matches none of the recognized types', async () => {
    const expected = { artifactUrl: null, downloadUrl: null, error: 'unrecognized' }
    mockUploadUnKownData.mockResolvedValue(expected)
    const request = buildRequest('application/octet-stream')

    const result = await uploadJSONData(request)

    expect(mockUploadUnKownData).toHaveBeenCalledWith(request)
    expect(mockUploadUnKownData).toHaveBeenCalledTimes(1)
    expect(mockUploadChannelData).not.toHaveBeenCalled()
    expect(mockUploadQuizData).not.toHaveBeenCalled()
    expect(mockUploadAssessmentData).not.toHaveBeenCalled()
    expect(mockUploadWebModuleData).not.toHaveBeenCalled()
    expect(mockUploadClassdiagramData).not.toHaveBeenCalled()
    expect(result).toBe(expected)
  })
})
