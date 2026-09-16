jest.mock('request', () => ({ get: jest.fn() }))
jest.mock('./logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('./env', () => ({
  CONSTANTS: {
    SB_API_KEY: 'api-key',
    SUNBIRD_PROXY_API_BASE: 'https://sunbird.test',
    X_Channel_Id: 'channel-1',
  },
}))

import request from 'request'
import { PERMISSION_HELPER } from './permissionHelper'

const mockRequestGet = (request as unknown as { get: jest.Mock }).get

/** Session double whose save() invokes its callback with the given error. */
// tslint:disable-next-line: no-any
function mockSession(saveError: any = null): any {
  return {
    // tslint:disable-next-line: no-any
    save: jest.fn((cb: any) => cb(saveError)),
  }
}

const userBody = JSON.stringify({
  result: {
    response: {
      id: 'user-id-1',
      organisations: [{ orgId: 'org-1' }],
      rootOrgId: 'root-1',
      userName: 'prince',
    },
  },
})

describe('PERMISSION_HELPER.setRolesData', () => {
  it('populates the session from the response body', () => {
    const session = mockSession()
    const reqObj = { session }
    PERMISSION_HELPER.setRolesData(reqObj, jest.fn(), userBody)

    expect(session.userId).toBe('user-id-1')
    expect(session.userName).toBe('prince')
    expect(session.orgs).toEqual([{ orgId: 'org-1' }])
    expect(session.rootOrgId).toBe('root-1')
  })

  it('falls back to userId when id is absent', () => {
    const session = mockSession()
    const body = JSON.stringify({
      result: { response: { userId: 'fallback-id', userName: 'p' } },
    })
    PERMISSION_HELPER.setRolesData({ session }, jest.fn(), body)
    expect(session.userId).toBe('fallback-id')
  })

  it('always includes the PUBLIC role', () => {
    const session = mockSession()
    PERMISSION_HELPER.setRolesData({ session }, jest.fn(), userBody)
    expect(session.userRoles).toContain('PUBLIC')
  })

  it('does not duplicate PUBLIC across calls', () => {
    const session = mockSession()
    PERMISSION_HELPER.setRolesData({ session }, jest.fn(), userBody)
    const occurrences = session.userRoles.filter((r: string) => r === 'PUBLIC').length
    expect(occurrences).toBe(1)
  })

  it('invokes the callback with the parsed user data on success', () => {
    const callback = jest.fn()
    PERMISSION_HELPER.setRolesData({ session: mockSession() }, callback, userBody)
    expect(callback).toHaveBeenCalledWith(null, JSON.parse(userBody))
  })

  it('invokes the callback with the error when session.save fails', () => {
    const callback = jest.fn()
    const failure = new Error('save failed')
    PERMISSION_HELPER.setRolesData({ session: mockSession(failure) }, callback, userBody)
    expect(callback).toHaveBeenCalledWith(failure, null)
  })

  it('does nothing when there is no session', () => {
    const callback = jest.fn()
    PERMISSION_HELPER.setRolesData({}, callback, userBody)
    expect(callback).not.toHaveBeenCalled()
  })
})

describe('PERMISSION_HELPER.getCurrentUserRoles', () => {
  beforeEach(() => mockRequestGet.mockReset())

  // tslint:disable-next-line: no-any
  const authedReq = (session: any) => ({
    kauth: { grant: { access_token: { token: 'tok-1' } } },
    session,
  })

  it('calls the sunbird read endpoint with the auth headers', () => {
    const session = mockSession()
    session.userId = 'user-id-1'
    PERMISSION_HELPER.getCurrentUserRoles(authedReq(session), jest.fn())

    const options = mockRequestGet.mock.calls[0][0]
    expect(options.url).toBe('https://sunbird.test/user/v2/read/user-id-1')
    expect(options.headers.Authorization).toBe('api-key')
    expect(options.headers['X-Channel-Id']).toBe('channel-1')
    expect(options.headers['x-authenticated-user-token']).toBe('tok-1')
    expect(options.headers['x-authenticated-userid']).toBe('user-id-1')
  })

  it('feeds a successful body into setRolesData', () => {
    const session = mockSession()
    session.userId = 'user-id-1'
    const callback = jest.fn()
    PERMISSION_HELPER.getCurrentUserRoles(authedReq(session), callback)

    // invoke the request callback as the http client would
    mockRequestGet.mock.calls[0][1](null, {}, userBody)
    expect(session.userName).toBe('prince')
    expect(callback).toHaveBeenCalledWith(null, JSON.parse(userBody))
  })

  it('does nothing when the response has no body', () => {
    const session = mockSession()
    session.userId = 'user-id-1'
    const callback = jest.fn()
    PERMISSION_HELPER.getCurrentUserRoles(authedReq(session), callback)

    mockRequestGet.mock.calls[0][1](new Error('net'), {}, undefined)
    expect(callback).not.toHaveBeenCalled()
  })
})
