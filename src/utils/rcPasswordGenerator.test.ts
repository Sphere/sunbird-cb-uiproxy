// encryptData is mocked: it depends on AES_* env vars that default to 'abc',
// which is not a valid cipher, so the real implementation throws. Mocking keeps
// these tests about the password-policy logic rather than about crypto config.
jest.mock('./emailHashPasswordGenerator', () => ({
  encryptData: jest.fn(),
}))

import { encryptData } from './emailHashPasswordGenerator'
import {
  generateFallbackPassword,
  getRCPassword,
  isSunbirdPasswordValid,
} from './rcPasswordGenerator'

const mockEncryptData = encryptData as jest.Mock

describe('isSunbirdPasswordValid', () => {
  it('accepts a password meeting every rule', () => {
    expect(isSunbirdPasswordValid('Abcdef1@')).toBe(true)
  })

  it.each([
    ['too short', 'Ab1@efg'],
    ['no uppercase', 'abcdef1@'],
    ['no lowercase', 'ABCDEF1@'],
    ['no digit', 'Abcdefg@'],
    ['no special character', 'Abcdefg1'],
  ])('rejects a password with %s', (_label, password) => {
    expect(isSunbirdPasswordValid(password)).toBe(false)
  })

  it('accepts each permitted special character', () => {
    for (const special of ['@', '#', '$', '%', '^', '&', '*', '!', '~', '?', '.', '_', '+', '-']) {
      expect(isSunbirdPasswordValid(`Abcdefg1${special}`)).toBe(true)
    }
  })

  it('rejects an empty password', () => {
    expect(isSunbirdPasswordValid('')).toBe(false)
  })
})

describe('generateFallbackPassword', () => {
  it('uses the first three letters of the first name and last four phone digits', () => {
    expect(generateFallbackPassword('Prince', '9876543210')).toBe('Pri@3210Ab')
  })

  it('strips non-letters from the first name', () => {
    expect(generateFallbackPassword('P1r2i3nce', '9876543210')).toBe('Pri@3210Ab')
  })

  it('falls back to "User" when the name has no letters', () => {
    expect(generateFallbackPassword('12345', '9876543210')).toBe('User@3210Ab')
  })

  it('falls back to "User" for an empty name', () => {
    expect(generateFallbackPassword('', '9876543210')).toBe('User@3210Ab')
  })

  it('uses a short name as-is', () => {
    expect(generateFallbackPassword('Al', '9876543210')).toBe('Al@3210Ab')
  })

  it('always produces a policy-compliant password', () => {
    for (const [name, phone] of [
      ['Prince', '9876543210'],
      ['12345', '1234567890'],
      ['', '5555555555'],
      ['Al', '1111111111'],
    ]) {
      expect(isSunbirdPasswordValid(generateFallbackPassword(name, phone))).toBe(true)
    }
  })
})

describe('getRCPassword', () => {
  it('uses the encrypted password when it satisfies the policy', () => {
    mockEncryptData.mockReturnValue('Valid1@abc')
    expect(getRCPassword({ firstName: 'Prince', phone: '9876543210' })).toBe('Valid1@abc')
    expect(mockEncryptData).toHaveBeenCalledWith('9876543210')
  })

  it('falls back when the encrypted password fails the policy', () => {
    mockEncryptData.mockReturnValue('short')
    expect(getRCPassword({ firstName: 'Prince', phone: '9876543210' })).toBe('Pri@3210Ab')
  })

  it('always returns a compliant password regardless of what encryptData yields', () => {
    for (const encrypted of ['', 'short', 'nouppercase1@', 'NOLOWERCASE1@', 'Valid1@abc']) {
      mockEncryptData.mockReturnValue(encrypted)
      const password = getRCPassword({ firstName: 'Prince', phone: '9876543210' })
      expect(isSunbirdPasswordValid(password)).toBe(true)
    }
  })
})
