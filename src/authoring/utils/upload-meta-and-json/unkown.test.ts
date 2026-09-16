jest.mock('../S3/upload', () => ({
  uploadToS3: jest.fn(),
}))

import { uploadToS3 } from '../S3/upload'
import { uploadUnKownData } from './unkown'

const mockUploadToS3 = uploadToS3 as jest.Mock

beforeEach(() => {
  mockUploadToS3.mockReset()
})

/**
 * @description Verifies uploadUnKownData delegates to uploadToS3 using the
 * request's own name when present, and falls back to 'unkown' when it isn't.
 */
describe('uploadUnKownData', () => {
  it('should upload using the request name when provided', async () => {
    mockUploadToS3.mockResolvedValue({ artifactUrl: 'a', downloadUrl: 'd', error: null })

    await uploadUnKownData({
      data: { foo: 'bar' },
      name: 'custom.json',
      path: 'content/type/id',
    } as any)

    expect(mockUploadToS3).toHaveBeenCalledWith({ foo: 'bar' }, 'content/type/id', 'custom.json')
  })

  it("should fall back to 'unkown' as the filename when no name is provided", async () => {
    mockUploadToS3.mockResolvedValue({ artifactUrl: 'a', downloadUrl: 'd', error: null })

    await uploadUnKownData({ data: { foo: 'bar' }, path: 'content/type/id' } as any)

    expect(mockUploadToS3).toHaveBeenCalledWith({ foo: 'bar' }, 'content/type/id', 'unkown')
  })
})
