/**
 * Unit tests for generateRandomPassword.
 *
 * Pure function, no network and no live environment — safe to run anywhere,
 * unlike the suites under test/integration/.
 *
 *   npm run test:unit
 *
 * These lock in the behaviour that must NOT change after moving the password
 * generator off Math.random and onto a CSPRNG: same length, same charset, same
 * handling of empty options. The final test is the security regression guard.
 */

import { generateRandomPassword } from './randomPasswordGenerator'

const ALL_OPTIONS = {
  digits: true,
  lowercase: true,
  symbols: true,
  uppercase: true,
}

const DIGITS = '1234567890'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const SYMBOLS = '@$!%&'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const FULL_CHARSET = DIGITS + LOWER + SYMBOLS + UPPER

describe('generateRandomPassword', () => {
  it.each([8, 12, 16, 24])('returns a password of length %i', (length) => {
    // 8 is the length every caller in publicApi_v8 uses.
    expect(generateRandomPassword(length, ALL_OPTIONS)).toHaveLength(length)
  })

  it('only ever emits characters from the selected charsets', () => {
    for (let i = 0; i < 500; i++) {
      const password: string = generateRandomPassword(8, ALL_OPTIONS)
      for (const char of password) {
        expect(FULL_CHARSET).toContain(char)
      }
    }
  })

  it('includes at least one character from every requested charset', () => {
    for (let i = 0; i < 200; i++) {
      const password: string = generateRandomPassword(8, ALL_OPTIONS)
      expect([...password].some((c) => DIGITS.includes(c))).toBe(true)
      expect([...password].some((c) => LOWER.includes(c))).toBe(true)
      expect([...password].some((c) => SYMBOLS.includes(c))).toBe(true)
      expect([...password].some((c) => UPPER.includes(c))).toBe(true)
    }
  })

  it('honours a subset of charsets', () => {
    for (let i = 0; i < 200; i++) {
      const password: string = generateRandomPassword(10, { digits: true })
      expect(password).toHaveLength(10)
      expect(/^[0-9]+$/.test(password)).toBe(true)
    }
  })

  it('returns an empty string when no charset is selected', () => {
    expect(generateRandomPassword(8, {})).toBe('')
    expect(generateRandomPassword(8, { digits: false })).toBe('')
  })

  it('ignores unknown option keys', () => {
    expect(generateRandomPassword(8, { notARealCharset: true })).toBe('')
  })

  it('produces distinct passwords across many calls', () => {
    const generated = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      generated.add(generateRandomPassword(8, ALL_OPTIONS))
    }
    // Collisions among 8-char passwords over this charset are astronomically
    // unlikely, so anything below 999 means the generator is not random.
    expect(generated.size).toBeGreaterThan(998)
  })

  it('SECURITY: does not depend on Math.random', () => {
    // Regression guard. If someone reverts the generator to Math.random, this
    // stub makes every generated password identical and the test fails.
    // A CSPRNG ignores Math.random entirely, so output stays varied.
    const realMathRandom = Math.random
    try {
      Math.random = () => 0.5
      const generated = new Set<string>()
      for (let i = 0; i < 200; i++) {
        generated.add(generateRandomPassword(8, ALL_OPTIONS))
      }
      expect(generated.size).toBeGreaterThan(190)
    } finally {
      Math.random = realMathRandom
    }
  })
})
