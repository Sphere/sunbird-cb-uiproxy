import {
  extractAuthorizationFromRequest,
  extractUserEmailFromRequest,
  extractUserId,
  extractUserIdFromRequest,
  extractUserNameFromRequest,
  extractUserToken,
  extractUserTokenContent,
} from './requestExtract'

/** Builds an express-like request with header lookups and optional kauth. */
// tslint:disable-next-line: no-any
function mockReq(headers: Record<string, string> = {}, content: any = {}, session: any = {}): any {
  return {
    header: (name: string) => headers[name],
    kauth: content
      ? { grant: { access_token: { content, token: content.__token || 'tok-123' } } }
      : undefined,
    session,
  }
}

const CONTENT = {
  email: 'user@example.com',
  family_name: 'Kumar',
  given_name: 'Prince',
  name: 'Prince Kumar',
  preferred_username: 'prince',
  session_state: 'sess-abc',
  sub: 'realm:user:11111111-2222-3333',
}

describe('extractUserIdFromRequest', () => {
  it('prefers the wid header', () => {
    expect(extractUserIdFromRequest(mockReq({ wid: 'wid-1' }, CONTENT, { userId: 'sess-1' }))).toBe('wid-1')
  })

  it('falls back to the session userId', () => {
    expect(extractUserIdFromRequest(mockReq({}, CONTENT, { userId: 'sess-1' }))).toBe('sess-1')
  })
})

describe('extractUserId', () => {
  it('prefers the wid header', () => {
    expect(extractUserId(mockReq({ wid: 'wid-1' }, CONTENT))).toBe('wid-1')
  })

  it('takes the third colon-separated segment of sub', () => {
    expect(extractUserId(mockReq({}, CONTENT))).toBe('11111111-2222-3333')
  })
})

describe('extractUserNameFromRequest', () => {
  it('returns the name from the token content', () => {
    expect(extractUserNameFromRequest(mockReq({}, CONTENT))).toBe('Prince Kumar')
  })

  it('returns undefined when kauth is absent', () => {
    expect(extractUserNameFromRequest(mockReq({}, null))).toBeUndefined()
  })
})

describe('extractUserEmailFromRequest', () => {
  it('returns email when present', () => {
    expect(extractUserEmailFromRequest(mockReq({}, CONTENT))).toBe('user@example.com')
  })

  it('falls back to preferred_username when email is missing', () => {
    const { email, ...withoutEmail } = CONTENT
    expect(extractUserEmailFromRequest(mockReq({}, withoutEmail))).toBe('prince')
  })

  it('returns undefined when kauth is absent', () => {
    expect(extractUserEmailFromRequest(mockReq({}, null))).toBeUndefined()
  })
})

describe('extractUserTokenContent / extractUserToken', () => {
  it('returns the whole content object', () => {
    expect(extractUserTokenContent(mockReq({}, CONTENT))).toEqual(CONTENT)
  })

  it('returns the raw token', () => {
    expect(extractUserToken(mockReq({}, CONTENT))).toBe('tok-123')
  })

  it('returns undefined when kauth is absent', () => {
    expect(extractUserTokenContent(mockReq({}, null))).toBeUndefined()
    expect(extractUserToken(mockReq({}, null))).toBeUndefined()
  })
})

describe('extractAuthorizationFromRequest', () => {
  it('prefixes the token with Bearer', () => {
    expect(extractAuthorizationFromRequest(mockReq({}, CONTENT))).toBe('Bearer tok-123')
  })

  it('still returns a Bearer prefix when kauth is absent', () => {
    // Documents current behaviour: produces the string 'Bearer undefined'.
    expect(extractAuthorizationFromRequest(mockReq({}, null))).toBe('Bearer undefined')
  })
})

