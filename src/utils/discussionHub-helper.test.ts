jest.mock('../protectedApi_v8/discussionHub/users', () => ({
  getUserByUsername: jest.fn(),
}))
jest.mock('./logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('./env', () => ({
  CONSTANTS: {
    DISCUSSION_HUB_WRITE_API_KEY: 'write-key-123',
    DISCUSSION_HUB_WRITE_API_UID: '42',
  },
}))

import { getUserByUsername } from '../protectedApi_v8/discussionHub/users'
import {
  getUserSlug,
  getUserUID,
  getWriteApiAdminUID,
  getWriteApiToken,
} from './discussionHub-helper'

const mockGetUserByUsername = getUserByUsername as jest.Mock

describe('getWriteApiToken', () => {
  it('returns the configured key with a Bearer prefix', () => {
    expect(getWriteApiToken()).toBe('Bearer write-key-123')
  })
})

describe('getWriteApiAdminUID', () => {
  it('coerces the configured uid to a number', () => {
    expect(getWriteApiAdminUID()).toBe(42)
    expect(typeof getWriteApiAdminUID()).toBe('number')
  })
})

describe('getUserUID', () => {
  beforeEach(() => mockGetUserByUsername.mockReset())

  it('resolves the uid when the user exists', async () => {
    mockGetUserByUsername.mockResolvedValue({ uid: 7, userslug: 'prince' })
    await expect(getUserUID('wid-1')).resolves.toBe(7)
    expect(mockGetUserByUsername).toHaveBeenCalledWith('wid-1')
  })

  it('rejects when the lookup fails', async () => {
    mockGetUserByUsername.mockRejectedValue(new Error('nope'))
    await expect(getUserUID('wid-1')).rejects.toThrow('User not found')
  })

  it('resolves undefined when the user has no uid', async () => {
    mockGetUserByUsername.mockResolvedValue({ userslug: 'prince' })
    await expect(getUserUID('wid-1')).resolves.toBeUndefined()
  })

  it('resolves undefined when the lookup returns nothing', async () => {
    mockGetUserByUsername.mockResolvedValue(undefined)
    await expect(getUserUID('wid-1')).resolves.toBeUndefined()
  })
})

describe('getUserSlug', () => {
  beforeEach(() => mockGetUserByUsername.mockReset())

  it('resolves the userslug when the user exists', async () => {
    mockGetUserByUsername.mockResolvedValue({ uid: 7, userslug: 'prince' })
    await expect(getUserSlug('wid-1')).resolves.toBe('prince')
  })

  it('rejects when the lookup fails', async () => {
    mockGetUserByUsername.mockRejectedValue(new Error('nope'))
    await expect(getUserSlug('wid-1')).rejects.toThrow('User not found')
  })

  it('resolves undefined when the user has no userslug', async () => {
    mockGetUserByUsername.mockResolvedValue({ uid: 7 })
    await expect(getUserSlug('wid-1')).resolves.toBeUndefined()
  })
})
