import {
  getDateRangeString,
  getEmailLocalPart,
  getStringifiedQueryParams,
  validateInputWithRegex,
} from './helpers'

describe('getStringifiedQueryParams', () => {
  it('joins key=value pairs with &', () => {
    expect(getStringifiedQueryParams({ a: '1', b: 2 })).toBe('a=1&b=2')
  })

  it('drops falsy values', () => {
    // The filter is on the value being truthy, so 0 and '' are dropped too.
    expect(getStringifiedQueryParams({ a: '1', b: undefined, c: '', d: 0 })).toBe('a=1')
  })

  it('returns an empty string for an empty object', () => {
    expect(getStringifiedQueryParams({})).toBe('')
  })
})

describe('getEmailLocalPart', () => {
  it('returns the part before @', () => {
    expect(getEmailLocalPart('prince@example.com')).toBe('prince')
  })

  it('returns the input unchanged when there is no @', () => {
    expect(getEmailLocalPart('notanemail')).toBe('notanemail')
  })

  it('returns an empty string when @ is first', () => {
    expect(getEmailLocalPart('@example.com')).toBe('')
  })

  it('handles an empty string', () => {
    expect(getEmailLocalPart('')).toBe('')
  })

  it('falls back to returning the input unchanged when indexOf throws', () => {
    // Passing a non-string bypasses the type annotation at runtime and makes
    // `.indexOf` throw, exercising the catch branch.
    // tslint:disable-next-line: no-any
    expect(getEmailLocalPart(null as any)).toBeNull()
  })
})

describe('getDateRangeString', () => {
  // NOTE: this function uses date-fns v1 format tokens ('DD', 'YYYY', 'D')
  // against date-fns v2, which rejects them. Every call therefore throws
  // internally and is swallowed by the catch, returning ''. These tests pin
  // the ACTUAL behaviour rather than the apparently-intended behaviour.
  // See docs/PROD-VERIFICATION.md.
  it('returns an empty string for identical dates (v1 tokens rejected by v2)', () => {
    expect(getDateRangeString('2024-01-01', '2024-01-01')).toBe('')
  })

  it('returns an empty string for a range spanning years', () => {
    expect(getDateRangeString('2023-01-01', '2024-01-01')).toBe('')
  })

  it('returns an empty string for a range spanning months', () => {
    expect(getDateRangeString('2024-01-01', '2024-02-01')).toBe('')
  })

  it('returns an empty string for a range within one month', () => {
    expect(getDateRangeString('2024-01-01', '2024-01-15')).toBe('')
  })

  it('returns an empty string for invalid input', () => {
    expect(getDateRangeString('nonsense', 'alsononsense')).toBe('')
  })
})

describe('validateInputWithRegex', () => {
  // The implementation is `new Promise(() => {...})` with no resolve/reject, so
  // the returned promise NEVER settles. Asserting that directly (rather than
  // awaiting it, which would hang the suite until timeout).
  it('returns a promise that never settles', async () => {
    const settled = jest.fn()
    validateInputWithRegex('abc', /abc/).then(settled).catch(settled)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(settled).not.toHaveBeenCalled()
  })

  it('still never settles when input is falsy (the early "return false" is inside the executor, not resolve)', async () => {
    const settled = jest.fn()
    validateInputWithRegex('', /abc/).then(settled).catch(settled)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(settled).not.toHaveBeenCalled()
  })
})
