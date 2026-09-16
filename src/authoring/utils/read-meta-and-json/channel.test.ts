jest.mock('../S3/read', () => ({
  readFromS3: jest.fn(),
}))

import { readFromS3 } from '../S3/read'
import { extractChannelData } from './channel'

const mockReadFromS3 = readFromS3 as jest.Mock

beforeEach(() => {
  mockReadFromS3.mockReset()
})

/**
 * @description Verifies extractChannelData delegates to readFromS3 with the
 * given URL and returns/propagates its result.
 */
describe('extractChannelData', () => {
  it('should resolve with the data readFromS3 resolves with', async () => {
    mockReadFromS3.mockResolvedValue({ channel: 'c1' })

    const result = await extractChannelData('https://s3.test/channel.json')

    expect(mockReadFromS3).toHaveBeenCalledWith('https://s3.test/channel.json')
    expect(result).toEqual({ channel: 'c1' })
  })

  it('should propagate a rejection from readFromS3', async () => {
    mockReadFromS3.mockRejectedValue(new Error('s3 unavailable'))

    await expect(extractChannelData('https://s3.test/channel.json')).rejects.toThrow(
      's3 unavailable'
    )
  })
})
