jest.mock('../S3/upload', () => ({
  uploadToS3: jest.fn(),
}))

import { uploadToS3 } from '../S3/upload'
import { uploadQuizData } from './quiz'

const mockUploadToS3 = uploadToS3 as jest.Mock

beforeEach(() => {
  mockUploadToS3.mockReset()
})

/**
 * @description Verifies uploadQuizData delegates to uploadToS3 with the
 * request's data/path and the fixed 'quiz.json' filename.
 */
describe('uploadQuizData', () => {
  it('should upload the given data/path with the quiz.json filename', async () => {
    mockUploadToS3.mockResolvedValue({ artifactUrl: 'a', downloadUrl: 'd', error: null })

    const result = await uploadQuizData({
      data: { questions: [] },
      path: 'content/type/id',
    } as any)

    expect(mockUploadToS3).toHaveBeenCalledWith({ questions: [] }, 'content/type/id', 'quiz.json')
    expect(result).toEqual({ artifactUrl: 'a', downloadUrl: 'd', error: null })
  })
})
