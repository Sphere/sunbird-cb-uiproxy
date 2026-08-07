/**
 * Structural regression guard for API_LIST — the security authorization
 * table consumed by apiWhiteList.ts. Most routes reference one of a small
 * set of shared preset rule objects (see the JSDoc in whitelistApis.ts)
 * instead of repeating an inline `{ checksNeeded, ROLE_CHECK }` literal.
 *
 * These tests do not re-assert per-route access decisions (apiWhiteList.test.ts
 * already covers that behavior). They exist to catch the two failure modes a
 * preset-reference typo or a broken extraction could silently introduce:
 * an entry pointing at something that isn't a valid rule shape, or the
 * route count changing because an entry was dropped.
 */

import { API_LIST } from './whitelistApis'

describe('API_LIST.URL structure', () => {
  const entries = Object.entries(API_LIST.URL)

  it('has not gained or lost routes', () => {
    expect(entries.length).toBe(306)
  })

  it('gives every route a valid checksNeeded/ROLE_CHECK shape', () => {
    for (const [, rule] of entries) {
      const { checksNeeded, ROLE_CHECK } = rule as { checksNeeded: unknown[]; ROLE_CHECK: unknown[] }
      expect(Array.isArray(checksNeeded)).toBe(true)
      expect(Array.isArray(ROLE_CHECK)).toBe(true)
      expect(ROLE_CHECK.length).toBeGreaterThan(0)
      // Every element of both arrays must be a non-empty string — catches a
      // typo'd/undefined ROLE.* or CHECK.* reference silently becoming
      // `undefined` in the array.
      for (const value of [...checksNeeded, ...ROLE_CHECK]) {
        expect(typeof value).toBe('string')
        expect((value as string).length).toBeGreaterThan(0)
      }
    }
  })

  it('shares one preset object reference across routes with the same rule, instead of duplicating it', () => {
    const seenObjects = new Set(Object.values(API_LIST.URL))
    // 306 routes resolving to far fewer than 306 distinct rule objects is the
    // actual property this whole dedup effort establishes — if this ever
    // climbs back up near 306, presets were reverted to inline literals.
    expect(seenObjects.size).toBeLessThan(20)
  })
})
