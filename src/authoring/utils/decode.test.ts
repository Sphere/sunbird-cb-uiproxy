/**
 * decode.ts is NOT an Express-route file — it exports a single plain,
 * synchronous, standalone transform function `decoder` (no axios, no
 * res.send, no try/catch). So this test file calls the exported function
 * directly and asserts on return values / thrown errors, per the "plain
 * functions" style used in ./cdn-url-replacer.test.ts.
 *
 * `decoder` expects `data` to be a base64 string that, once base64-decoded
 * to raw bytes and reinterpreted as a UTF-16LE character stream (via a
 * `Uint16Array` view over the same underlying buffer), yields a valid JSON
 * string. To build fixtures, `toDecoderInput` below performs the inverse of
 * that pipeline: it takes a raw string, writes each character as a 2-byte
 * UTF-16LE code unit into a Buffer (mirroring how `decoder` reads pairs of
 * bytes back out via the Uint16Array view), then base64-encodes that
 * buffer. `encodeValue` layers `JSON.stringify` on top so callers can pass
 * plain JS values and get back valid `decoder` input.
 *
 * No hang/crash/security-bypass patterns apply here: there is no Router, no
 * res object, and no try/catch to route around — the only branch is
 * "JSON.parse succeeds" vs. "JSON.parse throws", and both are safe to
 * exercise live.
 */

import { decoder } from './decode'

/** Encodes a raw string as base64-of-UTF16LE-bytes, the inverse of decoder's internal pipeline. */
function toDecoderInput(raw: string): string {
  const buf = Buffer.alloc(raw.length * 2)
  for (let i = 0; i < raw.length; i += 1) {
    buf.writeUInt16LE(raw.charCodeAt(i), i * 2)
  }
  return buf.toString('base64')
}

/** Encodes an arbitrary JSON-serializable value into valid decoder() input. */
function encodeValue(value: unknown): string {
  return toDecoderInput(JSON.stringify(value))
}

/**
 * @description Verifies decoder correctly reverses the UTF-16LE/base64
 * encoding pipeline for a range of JSON value shapes, and propagates a
 * SyntaxError rather than swallowing it when the decoded bytes are not
 * valid JSON.
 */
describe('decoder', () => {
  /**
   * @description Verifies decoder returns the original value for various
   * JSON-serializable inputs once round-tripped through the encoding helper.
   */
  describe('when given a base64 string that decodes to valid JSON', () => {
    it('should decode a simple flat object', () => {
      const input = { a: 1, b: 'two' }
      expect(decoder(encodeValue(input))).toEqual(input)
    })

    it('should decode an array', () => {
      const input = [1, 2, 3, 'four']
      expect(decoder(encodeValue(input))).toEqual(input)
    })

    it('should decode a JSON string value', () => {
      const input = 'hello world'
      expect(decoder(encodeValue(input))).toEqual(input)
    })

    it('should decode a nested object with arrays and objects', () => {
      const input = {
        meta: { count: 2, tags: ['x', 'y'] },
        name: 'thumbnail',
        nested: { deeper: { value: true } },
      }
      expect(decoder(encodeValue(input))).toEqual(input)
    })

    it('should decode a numeric value', () => {
      expect(decoder(encodeValue(42))).toEqual(42)
    })

    it('should decode a boolean value', () => {
      expect(decoder(encodeValue(true))).toEqual(true)
    })

    it('should decode a null value', () => {
      expect(decoder(encodeValue(null))).toBeNull()
    })

    it('should decode an empty object', () => {
      expect(decoder(encodeValue({}))).toEqual({})
    })

    it('should decode a string containing unicode characters', () => {
      const input = { greeting: 'héllo wörld 😀' }
      expect(decoder(encodeValue(input))).toEqual(input)
    })
  })

  /**
   * @description Verifies decoder throws (rather than swallowing) a
   * SyntaxError when the base64-decoded, UTF-16-reinterpreted bytes do not
   * form valid JSON — the source has no try/catch, so the error must
   * propagate synchronously to the caller.
   */
  describe('when the decoded bytes are not valid JSON', () => {
    it('should throw a SyntaxError for a non-JSON plain string', () => {
      const invalidInput = toDecoderInput('not valid json')
      expect(() => decoder(invalidInput)).toThrow(SyntaxError)
    })

    it('should throw for an empty raw string', () => {
      const invalidInput = toDecoderInput('')
      expect(() => decoder(invalidInput)).toThrow()
    })

    it('should throw for a malformed/truncated JSON object', () => {
      const invalidInput = toDecoderInput('{"a":1,')
      expect(() => decoder(invalidInput)).toThrow(SyntaxError)
    })
  })
})
