import { randomBytes } from 'crypto'

/**
 * Uniformly-distributed random integer in [0, max), from a CSPRNG.
 *
 * Drop-in replacement for Math.floor(Math.random() * max) — identical range,
 * identical distribution — but sourced from crypto.randomBytes.
 *
 * crypto.secureRandomInt() would be the obvious choice, but it is not present in the
 * @types/node version this project pins (12.x), so using it fails compilation.
 * randomBytes has been available since forever and needs no dependency change.
 *
 * Rejection sampling: taking `value % max` directly would bias results towards
 * the low end whenever max does not divide 2^32 evenly. Discarding values at or
 * above the largest exact multiple of max removes that bias. The loop retries
 * with probability < 2^-32 per iteration for the small maxima used here, so it
 * is effectively single-pass.
 */
export function secureRandomInt(max: number): number {
  if (max <= 1) {
    return 0
  }
  const maxUint32 = 0x100000000
  const limit = Math.floor(maxUint32 / max) * max
  let value = 0
  do {
    value = randomBytes(4).readUInt32BE(0)
  } while (value >= limit)
  return value % max
}

/**
 * Generates a password for newly-provisioned accounts.
 *
 * Randomness comes from a CSPRNG, not Math.random. V8 implements Math.random
 * with xorshift128+, whose internal state can be recovered from a small number
 * of observed outputs — which would let an attacker predict passwords generated
 * for other users. These are real account credentials across the SSO sign-up
 * flows, so a CSPRNG is required.
 *
 * The algorithm, charset handling and output length are deliberately unchanged;
 * only the source of randomness differs.
 */
export function generateRandomPassword(length, options) {
  const optionsChars = {
    digits: '1234567890',
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    symbols: '@$!%&',
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  }
  const chars = []
  for (const key in options) {
    if (
      options.hasOwnProperty(key) &&
      options[key] &&
      optionsChars.hasOwnProperty(key)
    ) {
      chars.push(optionsChars[key])
    }
  }

  if (!chars.length) return ''

  let password = ''
  // tslint:disable-next-line: no-any
  for (const [index] of chars.entries()) {
    password += chars[index].charAt(secureRandomInt(chars[index].length))
  }

  if (length > chars.length) {
    length = length - chars.length
    for (let i = 0; i < length; i++) {
      const index = secureRandomInt(chars.length)
      password += chars[index].charAt(secureRandomInt(chars[index].length))
    }
  }

  return password
}
