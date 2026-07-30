/**
 * PHASE 1 — auth-path coverage.
 *
 * Public signup/login flow: /signup, /generateOtp, /validateOtp,
 * /registerUserWithMobile, /auth, /authv2. All axios calls and the otp/
 * rolePermission/randomPasswordGenerator boundaries are mocked; the handlers
 * themselves run for real over HTTP via supertest.
 *
 * generateRandomPassword is mocked here even though it is the module I fixed
 * to use a CSPRNG — this file is about the signup/login handler logic, not
 * about re-verifying the password generator (covered by its own test file).
 */

jest.mock('axios')
jest.mock('jwt-decode')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/randomPasswordGenerator', () => ({
  generateRandomPassword: jest.fn(() => 'Gen3rat3d!'),
}))
jest.mock('./otp', () => ({ getOTP: jest.fn(), validateOTP: jest.fn() }))
jest.mock('./rolePermission', () => ({ getCurrentUserRoles: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    HTTPS_HOST: 'https://auth.test',
    KEYCLOAK_REDIRECT_URL: 'https://app.test/callback',
    KONG_API_BASE: 'https://kong.test',
    LEARNER_SERVICE_API_BASE: 'https://learner.test',
    MSG_91_AUTH_KEY_SSO: 'msg91-key',
    SB_API_KEY: 'sb-api-key',
    SUNBIRD_PROXY_API_BASE: 'https://sunbird.test',
    TIMEOUT: '10000',
  },
}))

import axios from 'axios'
import jwtDecode from 'jwt-decode'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { emailOrMobileLogin } from './emailOrMobileLoginSignIn'
import { getOTP, validateOTP } from './otp'
import { getCurrentUserRoles } from './rolePermission'

const mockAxios = axios as unknown as jest.Mock
const mockGetOTP = getOTP as jest.Mock
const mockValidateOTP = validateOTP as jest.Mock
const mockGetCurrentUserRoles = getCurrentUserRoles as jest.Mock
const mockJwtDecode = jwtDecode as jest.Mock

const agent = () => mountRouter(emailOrMobileLogin)

/** A working session double: save() and regenerate() invoke synchronously. */
function workingSession() {
  return {
    // tslint:disable-next-line: no-any
    regenerate: (cb: any) => cb(),
    // tslint:disable-next-line: no-any
    save: (cb: any) => cb(null),
  }
}

const userSearchResponse = (exists: boolean) =>
  upstreamOk({ responseCode: 'OK', result: { exists } })

const createUserResponse = (userId = 'user-uuid-1') =>
  upstreamOk({ responseCode: 'OK', result: { userId } })

beforeEach(() => mockAxios.mockReset())

describe('POST /signup', () => {
  it('creates a new user and reports success', async () => {
    mockAxios
      .mockResolvedValueOnce(userSearchResponse(false)) // fetchUserBymobileorEmail
      .mockResolvedValueOnce(createUserResponse()) // createuserWithmobileOrEmail
      .mockResolvedValueOnce(upstreamOk()) // updateRoles
    mockGetOTP.mockResolvedValue(upstreamOk({ result: { response: 'SUCCESS' } }))

    const response = await agent()
      .post('/signup')
      .send({ email: 'new@example.com', firstName: 'A', lastName: 'B' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ status: 'success', userUUId: 'user-uuid-1' })
  })

  it('rejects an existing email with 400', async () => {
    mockAxios.mockResolvedValueOnce(userSearchResponse(true))

    const response = await agent().post('/signup').send({ email: 'exists@example.com' })

    expect(response.status).toBe(400)
    expect(response.body.msg).toContain('already exists')
  })

  // A missing email is deliberately NOT tested by sending the request: the
  // handler sends 400 WITHOUT returning (no `return` after that res.status(400)
  // call), so it falls through and keeps processing with email=undefined. The
  // signup attempt then fails deeper in the flow and the outer catch calls
  // res.status(500).send() on an ALREADY-SENT response, throwing
  // ERR_HTTP_HEADERS_SENT synchronously inside the handler's own catch block —
  // ie. genuinely unhandled, not just logged. Reproducing it hangs the test
  // runner (same failure family as userRegistration.ts's ERR_HTTP_HEADERS_SENT
  // crash). Recorded in docs/PROD-VERIFICATION.md instead.

  it('returns 500 when the upstream search fails unexpectedly', async () => {
    // fetchUserBymobileorEmail swallows axios errors and returns undefined,
    // so isUserExist is falsy and creation is attempted; simulate a failure
    // deeper in the flow (getOTP throwing) to reach the outer catch instead.
    mockAxios.mockResolvedValueOnce(userSearchResponse(false)).mockResolvedValueOnce(
      createUserResponse()
    )
    mockGetOTP.mockRejectedValue(new Error('otp service down'))

    const response = await agent()
      .post('/signup')
      .send({ email: 'a@b.com', firstName: 'A' })

    expect(response.status).toBe(500)
  })
})

describe('POST /generateOtp', () => {
  it('rejects when neither phone nor email is supplied', async () => {
    const response = await agent().post('/generateOtp').send({})
    expect(response.status).toBe(400)
  })

  it("returns 400 when the user doesn't exist", async () => {
    mockAxios.mockResolvedValue(upstreamOk({ result: { response: { count: 0 } } }))

    const response = await agent().post('/generateOtp').send({ email: 'a@b.com' })

    expect(response.status).toBe(400)
    expect(response.body.msg).toMatch(/signup/i)
  })

  it('resends OTP by phone via msg91', async () => {
    mockAxios
      .mockResolvedValueOnce(
        upstreamOk({ result: { response: { count: 1, content: [{ id: 'u1' }] } } })
      )
      .mockResolvedValueOnce(upstreamOk({}))

    const response = await agent().post('/generateOtp').send({ mobileNumber: '9876543210' })

    expect(response.status).toBe(200)
    expect(response.body.userId).toBe('u1')
  })

  it('returns 500 when the msg91 phone resend fails', async () => {
    mockAxios
      .mockResolvedValueOnce(
        upstreamOk({ result: { response: { count: 1, content: [{ id: 'u1' }] } } })
      )
      .mockRejectedValueOnce(networkError())

    const response = await agent().post('/generateOtp').send({ mobileNumber: '9876543210' })

    expect(response.status).toBe(500)
  })

  it('resends OTP by email via the learner service', async () => {
    mockAxios.mockResolvedValueOnce(
      upstreamOk({ result: { response: { count: 1, content: [{ id: 'u1' }] } } })
    )
    mockGetOTP.mockResolvedValue(upstreamOk({}))

    const response = await agent().post('/generateOtp').send({ email: 'a@b.com' })

    expect(response.status).toBe(200)
  })

  it('returns 500 when the email OTP resend fails', async () => {
    mockAxios.mockResolvedValueOnce(
      upstreamOk({ result: { response: { count: 1, content: [{ id: 'u1' }] } } })
    )
    mockGetOTP.mockRejectedValue(new Error('down'))

    const response = await agent().post('/generateOtp').send({ email: 'a@b.com' })

    expect(response.status).toBe(500)
  })
})

describe('POST /validateOtp', () => {
  it('validates and reports success', async () => {
    mockValidateOTP.mockResolvedValue(upstreamOk({}))

    const response = await agent()
      .post('/validateOtp')
      .send({ email: 'a@b.com', otp: '1234', userUUId: 'u1' })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe(200)
  })

  // A missing otp is deliberately NOT tested by sending the request either:
  // validateRequestBody sends 400 WITHOUT returning, then calls next()
  // unconditionally, so the route handler runs anyway and its own `!validOtp`
  // branch calls res.status(400).send() on an already-sent response — throwing
  // ERR_HTTP_HEADERS_SENT, caught by the handler's try/catch, whose
  // res.status(500).send() then throws the SAME error again, unhandled this
  // time. Reproducing it hangs the test runner. Recorded in
  // docs/PROD-VERIFICATION.md instead.

  it('rejects when neither mobileNumber nor email is supplied', async () => {
    const response = await agent().post('/validateOtp').send({ otp: '1234' })
    expect(response.status).toBe(400)
    expect(response.body.msg).toMatch(/Mobile no\. or Email/)
  })

  it('returns 500 when otp validation throws', async () => {
    mockValidateOTP.mockRejectedValue(new Error('down'))

    const response = await agent()
      .post('/validateOtp')
      .send({ email: 'a@b.com', otp: '1234', userUUId: 'u1' })

    expect(response.status).toBe(500)
  })
})

describe('POST /registerUserWithMobile', () => {
  it('creates a new mobile user and reports success', async () => {
    mockAxios
      .mockResolvedValueOnce(userSearchResponse(false))
      .mockResolvedValueOnce(createUserResponse('user-uuid-2'))
      .mockResolvedValueOnce(upstreamOk())
    mockGetOTP.mockResolvedValue(upstreamOk({ result: { response: 'SUCCESS' } }))

    const response = await agent()
      .post('/registerUserWithMobile')
      .send({ phone: '9876543210', firstName: 'A' })

    expect(response.status).toBe(200)
    expect(response.body.userUUId).toBe('user-uuid-2')
  })

  it('rejects an existing mobile number with 400', async () => {
    mockAxios.mockResolvedValueOnce(userSearchResponse(true))

    const response = await agent().post('/registerUserWithMobile').send({ phone: '9876543210' })

    expect(response.status).toBe(400)
    expect(response.body.msg).toContain('already exists')
  })

  // A downstream axios failure during creation is deliberately NOT tested by
  // sending the request. createuserWithmobileOrEmail catches its OWN axios
  // errors internally and returns undefined (no return/throw in its catch
  // block), so `.catch(handleCreateUserError)` never fires — it only sees a
  // resolved undefined. Back in the handler, `if (newUserDetails)` is then
  // false with no `else`, so NO response is ever sent and the request hangs
  // until the client times out. Confirmed empirically: this scenario timed out
  // a real supertest request at the default 30s Jest timeout. Recorded in
  // docs/PROD-VERIFICATION.md instead of reproduced here.
})

describe('POST /auth', () => {
  const session = () => workingSession()

  it('authenticates an existing user and returns 200', async () => {
    mockAxios
      .mockResolvedValueOnce(userSearchResponse(true)) // email exists
      .mockResolvedValueOnce(userSearchResponse(false)) // mobile check
      .mockResolvedValueOnce(upstreamOk({ access_token: 'jwt-token' })) // token endpoint
    mockJwtDecode.mockReturnValue({ sub: 'realm:user:uid-1' })
    mockGetCurrentUserRoles.mockResolvedValue(undefined)

    const response = await mountRouter(emailOrMobileLogin, { session: session() })
      .post('/auth')
      .send({ email: 'a@b.com', password: 'pw' })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('success')
  })

  it('returns 400 when the user does not exist under either identifier', async () => {
    mockAxios.mockResolvedValueOnce(userSearchResponse(false)).mockResolvedValueOnce(
      userSearchResponse(false)
    )

    const response = await mountRouter(emailOrMobileLogin, { session: session() })
      .post('/auth')
      .send({ email: 'nouser@b.com' })

    expect(response.status).toBe(400)
    expect(response.body.msg).toBe('User does not exist please signup and login again')
  })

  it('returns 400 when authentication fails (bad credentials)', async () => {
    mockAxios
      .mockResolvedValueOnce(userSearchResponse(true))
      .mockResolvedValueOnce(userSearchResponse(false))
      .mockRejectedValueOnce(upstreamOk === undefined ? new Error('') : networkError())

    const response = await mountRouter(emailOrMobileLogin, { session: session() })
      .post('/auth')
      .send({ email: 'a@b.com', password: 'wrong' })

    expect(response.status).toBe(400)
    expect(response.body.error).toMatch(/Authentication failed/)
  })

  it('rejects when neither mobileNumber nor email is supplied', async () => {
    const response = await mountRouter(emailOrMobileLogin, { session: session() })
      .post('/auth')
      .send({})

    expect(response.status).toBe(400)
    expect(response.body.msg).toBe('Mobile no. or Email Id can not be empty')
  })
})

describe('POST /authv2/*', () => {
  it('exchanges an authorization code and returns 200', async () => {
    mockAxios.mockResolvedValueOnce(upstreamOk({ access_token: 'jwt-token' }))
    mockJwtDecode.mockReturnValue({ sub: 'realm:user:uid-2' })
    mockGetCurrentUserRoles.mockResolvedValue(undefined)

    const response = await mountRouter(emailOrMobileLogin, { session: workingSession() })
      .post('/authv2/callback')
      .query({ code: 'auth-code-123' })
      .send({})

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('success')
  })

  it('returns 400 when the code exchange fails', async () => {
    mockAxios.mockRejectedValueOnce(networkError())

    const response = await mountRouter(emailOrMobileLogin, { session: workingSession() })
      .post('/authv2/callback')
      .query({ code: 'bad-code' })
      .send({})

    expect(response.status).toBe(400)
    expect(response.body.error).toMatch(/Authentication failed/)
  })
})
