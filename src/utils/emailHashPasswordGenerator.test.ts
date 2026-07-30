// A REAL cipher is supplied here. The production defaults in env.ts are the
// placeholder string 'abc', which is not a valid cipher name, so the real
// encryptData would throw at runtime with the default configuration.
jest.mock('./env', () => ({
  CONSTANTS: {
    AES_ENCRYPTION_METHOD: 'aes-256-cbc',
    AES_ENCRYPTION_SECRET: 'test-secret',
    AES_SECRET_IV: 'test-iv',
    AES_SECRET_KEY: 'test-key',
  },
}))

import { encryptData } from './emailHashPasswordGenerator'

describe('encryptData', () => {
  it('returns a non-empty base64 string', () => {
    const encrypted = encryptData('9876543210')
    expect(typeof encrypted).toBe('string')
    expect(encrypted.length).toBeGreaterThan(0)
    // base64 alphabet only
    expect(/^[A-Za-z0-9+/]+=*$/.test(encrypted)).toBe(true)
  })

  it('is deterministic for the same input (fixed key and IV)', () => {
    expect(encryptData('9876543210')).toBe(encryptData('9876543210'))
  })

  it('produces different output for different input', () => {
    expect(encryptData('9876543210')).not.toBe(encryptData('1234567890'))
  })

  it('handles an empty string', () => {
    expect(typeof encryptData('')).toBe('string')
  })

  it('handles a long input', () => {
    expect(encryptData('x'.repeat(500)).length).toBeGreaterThan(0)
  })
})
