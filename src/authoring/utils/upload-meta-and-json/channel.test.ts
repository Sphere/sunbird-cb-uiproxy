jest.mock('../S3/upload', () => ({
  uploadToS3: jest.fn(),
}))

import { uploadToS3 } from '../S3/upload'
import { uploadChannelData } from './channel'

const mockUploadToS3 = uploadToS3 as jest.Mock

beforeEach(() => {
  mockUploadToS3.mockReset()
})

/**
 * @description Verifies uploadChannelData delegates to uploadToS3 with the
 * request's data/path and the fixed 'channel.json' filename.
 */
describe('uploadChannelData', () => {
  it('should upload the given data/path with the channel.json filename', async () => {
    mockUploadToS3.mockResolvedValue({ artifactUrl: 'a', downloadUrl: 'd', error: null })

    const result = await uploadChannelData({
      data: { name: 'Channel One' },
      path: 'content/type/id',
    } as any)

    expect(mockUploadToS3).toHaveBeenCalledWith({ name: 'Channel One' }, 'content/type/id', 'channel.json')
    expect(result).toEqual({ artifactUrl: 'a', downloadUrl: 'd', error: null })
  })
})
