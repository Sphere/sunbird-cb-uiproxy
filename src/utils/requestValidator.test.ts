import { requestValidator } from './requestValidator'

/** Minimal express-like res double capturing status/json. */
function mockRes() {
  const res = {
    body: undefined as unknown,
    statusCode: undefined as number | undefined,
    // tslint:disable-next-line: no-any
    json(payload: any) {
      this.body = payload
      return this
    },
    status(code: number) {
      this.statusCode = code
      return this
    },
  }
  return res
}

describe('requestValidator', () => {
  it('returns false when every required param is present', () => {
    const res = mockRes()
    expect(requestValidator(['a', 'b'], { a: 1, b: 'x' }, res)).toBe(false)
    expect(res.statusCode).toBeUndefined()
  })

  it('returns false when nothing is required', () => {
    expect(requestValidator([], {}, mockRes())).toBe(false)
  })

  it.each([
    ['missing key', {}],
    ['null', { a: null }],
    ['undefined', { a: undefined }],
    ['empty string', { a: '' }],
    ['empty array', { a: [] }],
  ])('responds 400 when %s', (_label, body) => {
    const res = mockRes()
    requestValidator(['a'], body, res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'Missing parameters: a', type: 'Failed' })
  })

  it('lists every invalid property in the message', () => {
    const res = mockRes()
    requestValidator(['a', 'b', 'c'], { a: 1, b: '', c: null }, res)
    expect(res.body).toEqual({ error: 'Missing parameters: b, c', type: 'Failed' })
  })

  // Documents deliberate loose-equality behaviour: `value == ''` means 0 and
  // false are treated as missing, while a non-empty array is accepted.
  it('treats 0 and false as missing (loose == comparison)', () => {
    const res = mockRes()
    requestValidator(['a', 'b'], { a: 0, b: false }, res)
    expect(res.statusCode).toBe(400)
  })

  it('accepts a non-empty array', () => {
    expect(requestValidator(['a'], { a: [1] }, mockRes())).toBe(false)
  })
})
