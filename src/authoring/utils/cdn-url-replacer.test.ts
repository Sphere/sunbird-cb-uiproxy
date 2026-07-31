/**
 * cdn-url-replacer.ts is NOT an Express-route file — it exports a single
 * plain, synchronous, recursive transform function `replaceCdnUrls` (no
 * axios, no res.send, no try/catch). So this test file calls the exported
 * function directly and asserts on return values, per the "plain functions"
 * style used in src/utils/keycloak-user-creation.test.ts and
 * src/service/goals.test.ts.
 *
 * The file imports `CONSTANTS` from '../../utils/env' and `logInfo` from
 * '../../utils/logger'. Both are mocked below (env with a mutable object so
 * S3_DOMAIN/CDN_DOMAIN can be changed per test to exercise every branch;
 * logger with a no-op jest.fn() since log output isn't under test).
 *
 * No hang/crash/security-bypass patterns apply here: there is no Router, no
 * res object, and no try/catch to route around — every code path is a plain
 * `return`, so all branches are safe to exercise live.
 */

jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    CDN_DOMAIN: '',
    S3_DOMAIN: '',
  },
}))
jest.mock('../../utils/logger', () => ({ logInfo: jest.fn() }))

import { CONSTANTS } from '../../utils/env'
import { replaceCdnUrls } from './cdn-url-replacer'

const mutableConstants = CONSTANTS as unknown as { S3_DOMAIN: string; CDN_DOMAIN: string }

/**
 * @description Verifies replaceCdnUrls leaves values untouched when domains
 * are missing/misconfigured, correctly substitutes S3 URLs with the CDN
 * domain across strings, arrays, and nested objects, and preserves
 * non-string/primitive values.
 */
describe('replaceCdnUrls', () => {
  afterEach(() => {
    mutableConstants.S3_DOMAIN = ''
    mutableConstants.CDN_DOMAIN = ''
  })

  /**
   * @description Verifies replaceCdnUrls returns the input unchanged when
   * either S3_DOMAIN or CDN_DOMAIN (or both) are not configured.
   */
  describe('when S3_DOMAIN or CDN_DOMAIN is not configured', () => {
    it('should return the object unchanged when both are missing', () => {
      const input = { url: 'https://mybucket.s3.us-east-1.amazonaws.com/file.png' }
      expect(replaceCdnUrls(input)).toBe(input)
    })

    it('should return the object unchanged when only S3_DOMAIN is set', () => {
      mutableConstants.S3_DOMAIN = 's3.example.com'
      const input = 'https://mybucket.s3.us-east-1.amazonaws.com/file.png'
      expect(replaceCdnUrls(input)).toBe(input)
    })

    it('should return the object unchanged when only CDN_DOMAIN is set', () => {
      mutableConstants.CDN_DOMAIN = 'https://cdn.example.com/'
      const input = 'https://mybucket.s3.us-east-1.amazonaws.com/file.png'
      expect(replaceCdnUrls(input)).toBe(input)
    })
  })

  /**
   * @description Verifies replaceCdnUrls performs the URL substitution
   * (generic S3 pattern, regional pattern, and literal-substring fallback)
   * once both S3_DOMAIN and CDN_DOMAIN are configured, including recursive
   * traversal of arrays/objects and safe handling of edge-case inputs.
   */
  describe('when both S3_DOMAIN and CDN_DOMAIN are configured', () => {
    beforeEach(() => {
      mutableConstants.S3_DOMAIN = 'sunbirdcontent.s3-ap-south-1.amazonaws.com'
      mutableConstants.CDN_DOMAIN = 'https://cdn.example.com/'
    })

    it('should replace a string matching the generic S3 pattern', () => {
      const input = 'https://mybucket.s3.us-east-1.amazonaws.com/path/to/file.png'
      expect(replaceCdnUrls(input)).toBe('https://cdn.example.com/path/to/file.png')
    })

    it('should replace a string matching the s3* multi-region pattern variant', () => {
      const input = 'https://another-bucket.s3-ap-south-1.amazonaws.com/img.jpg'
      expect(replaceCdnUrls(input)).toBe('https://cdn.example.com/img.jpg')
    })

    it('should use the fallback path for a configured S3_DOMAIN that the generic regex would not catch', () => {
      // The fallback does a literal substring replace of S3_DOMAIN with CDN_DOMAIN
      // (not a "swap the whole https://<domain>/ prefix" replace), so the
      // matched substring itself is what gets swapped in-place.
      mutableConstants.S3_DOMAIN = 'custom-s3-mirror.internal'
      const input = 'https://custom-s3-mirror.internal/bucket/file.txt'
      expect(replaceCdnUrls(input)).toBe('https://https://cdn.example.com//bucket/file.txt')
    })

    it('should escape regex special characters in S3_DOMAIN for the fallback match', () => {
      mutableConstants.S3_DOMAIN = 's3.internal+test.local'
      const input = 'prefix-https://s3.internal+test.local/x-suffix'
      expect(replaceCdnUrls(input)).toBe('prefix-https://https://cdn.example.com//x-suffix')
    })

    it('should return a string unchanged when it matches neither pattern', () => {
      const input = 'https://unrelated.example.com/file.png'
      expect(replaceCdnUrls(input)).toBe(input)
    })

    it('should recursively replace URLs inside array elements', () => {
      const input = [
        'https://mybucket.s3.us-east-1.amazonaws.com/one.png',
        'https://unrelated.example.com/two.png',
      ]
      expect(replaceCdnUrls(input)).toEqual([
        'https://cdn.example.com/one.png',
        'https://unrelated.example.com/two.png',
      ])
    })

    it('should recursively replace URLs inside nested object properties', () => {
      const input = {
        meta: {
          nested: ['https://mybucket.s3.us-east-1.amazonaws.com/a.png'],
        },
        name: 'thumbnail',
        url: 'https://mybucket.s3.us-east-1.amazonaws.com/thumb.png',
      }
      expect(replaceCdnUrls(input)).toEqual({
        meta: {
          nested: ['https://cdn.example.com/a.png'],
        },
        name: 'thumbnail',
        url: 'https://cdn.example.com/thumb.png',
      })
    })

    it('should only copy own enumerable properties, skipping inherited ones', () => {
      const proto = { inherited: 'https://mybucket.s3.us-east-1.amazonaws.com/should-not-appear.png' }
      const input = Object.create(proto)
      input.own = 'value'

      const result = replaceCdnUrls(input) as Record<string, unknown>
      expect(result).toEqual({ own: 'value' })
      expect(Object.prototype.hasOwnProperty.call(result, 'inherited')).toBe(false)
    })

    it('should return null unchanged', () => {
      expect(replaceCdnUrls(null)).toBeNull()
    })

    it('should return primitive non-string values unchanged', () => {
      expect(replaceCdnUrls(42)).toBe(42)
      expect(replaceCdnUrls(true)).toBe(true)
      expect(replaceCdnUrls(undefined)).toBeUndefined()
    })

    it('should handle an empty array', () => {
      expect(replaceCdnUrls([])).toEqual([])
    })

    it('should handle an empty object', () => {
      expect(replaceCdnUrls({})).toEqual({})
    })
  })
})
