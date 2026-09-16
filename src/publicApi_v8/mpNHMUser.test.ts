/**
 * PHASE 1 — mpNHMUser.ts (208 uncovered).
 *
 * Third file in the bnrcUser.ts/upsmfUser.ts family: pg pool + createUser +
 * 3-OTP-endpoint shape, same author. Same scope decision: /createUser deferred
 * to Phase 2 (also uses cassandra-driver here, adding another dependency).
 *
 * PHASE 2 — /createUser coverage added below. Same bug family documented in
 * docs/DUPLICATE-CODE-CLEANUP.md: L3-5 (createUser() reuses
 * CONSTANTS.BNRC_USER_DEFAULT_PASSWORD regardless of org) and L3-8
 * (migrateUserToMp() builds a postal address with a blank state name,
 * `India, , ${district}`, unlike upsmf's "Uttar Pradesh" / bnrc's "Bihar").
 * Note the cassandra-driver mock below only exports `Client`, so `types` is
 * undefined in the module under test — every /createUser body here
 * deliberately omits `dob` to avoid exercising `types.LocalDate.fromString`,
 * which would throw against this mock (a mocking-infrastructure limit, not
 * a source bug).
 */

jest.mock('axios')
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ on: jest.fn(), query: jest.fn() })) }))
jest.mock('cassandra-driver', () => ({ Client: jest.fn(() => ({ execute: jest.fn() })) }))
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    BNRC_USER_DEFAULT_PASSWORD: 'default-pw',
    CASSANDRA_IP: '127.0.0.1',
    DATA_LAKE_POSTGRES_DATABASE: 'db',
    DATA_LAKE_POSTGRES_HOST: 'host',
    DATA_LAKE_POSTGRES_PASSWORD: 'pw',
    DATA_LAKE_POSTGRES_PORT: 5432,
    DATA_LAKE_POSTGRES_USER: 'user',
    MSG_91_AUTH_KEY_SSO: 'msg91-key',
    MSG_91_TEMPLATE_ID_SEND_OTP_SSO: 'tmpl-1',
    SB_API_KEY: 'sb-api-key',
  },
}))

import axios from 'axios'
import { Pool } from 'pg'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { logError, logInfo } from '../utils/logger'
import { validRootOrgs } from '../utils/mpUtils'
import { mpNHMUserCreation } from './mpNHMUser'

const mockAxios = axios as unknown as jest.Mock
const mockLogInfo = logInfo as jest.Mock
const mockLogError = logError as jest.Mock
const mockPool = (Pool as unknown as jest.Mock).mock.results[0].value as { query: jest.Mock }
const agent = () => mountRouter(mpNHMUserCreation)

beforeEach(() => {
  mockAxios.mockReset()
  mockLogInfo.mockReset()
  mockLogError.mockReset()
  mockPool.query.mockReset()
  mockPool.query.mockResolvedValue({ rows: [] })
})

/**
 * Minimal valid /createUser payload for a brand-new Student registration.
 * `roleForInService` is deliberately left unset so the Joi `.when(...)`
 * branches for block/facilityCode/facilityType stay optional; `hrmsId` is
 * always required regardless of roleForInService, so it's always supplied.
 */
const validStudentBody = () => ({
  value: {
    request: {
      formValues: {
        courseSelection: 'GNM',
        district: 'Bhopal',
        firstName: 'Asha',
        hrmsId: '12345',
        instituteName: 'City Institute',
        instituteType: 'Government',
        lastName: 'Kumari',
        phone: 9876543210,
        role: 'Student',
        serviceType: 'Regular',
      },
    },
  },
})

describe('POST /otp/sendOtp', () => {
  it('sends the otp and reports success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))
    const response = await agent().post('/otp/sendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(200)
  })

  it('returns 500 when the msg91 call fails', async () => {
    mockAxios.mockRejectedValue(new Error('down'))
    const response = await agent().post('/otp/sendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
  })

  it('returns 500 with the generic fallback body on a network-level failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await agent().post('/otp/sendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
    expect(response.body.status).toBe('failed')
  })

  it('returns 500 (not the upstream status) even when msg91 responds with a real HTTP error', async () => {
    // The catch block always sends a fixed 500 + generic body here, unlike
    // some other handlers in this codebase that forward err.response.status.
    mockAxios.mockRejectedValue(upstreamError(400, { error: 'bad request' }))
    const response = await agent().post('/otp/sendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
    expect(response.body.status).toBe('failed')
  })

  it('logs OTP-send failures at info level, not error level (known pre-existing bug)', async () => {
    // Documented, pre-existing bug — docs/DUPLICATE-CODE-CLEANUP.md L3-9:
    // mpNHMUser.ts's OTP catch blocks call logInfo instead of logError, so
    // these failures won't surface in error-level monitoring/alerting the
    // way upsmfUser.ts/bnrcUser.ts's equivalent handlers do. Asserting the
    // CURRENT (buggy) behavior verbatim — do not "fix" this in source.
    mockAxios.mockRejectedValue(new Error('down'))
    await agent().post('/otp/sendOtp').send({ phone: '9876543210' })
    expect(mockLogInfo).toHaveBeenCalledWith(expect.stringContaining('Error in sending user OTP'))
    expect(mockLogError).not.toHaveBeenCalled()
  })

  // A missing phone is deliberately NOT sent live — same unreturned-400
  // double-send hazard as bnrcUser.ts / upsmfUser.ts. See
  // docs/PROD-VERIFICATION.md.
})

describe('POST /otp/resendOtp', () => {
  it('resends the otp and reports success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))
    const response = await agent().post('/otp/resendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(200)
  })

  it('returns 500 when the msg91 call fails', async () => {
    mockAxios.mockRejectedValue(new Error('down'))
    const response = await agent().post('/otp/resendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
  })

  it('rejects a request with no phone (this handler DOES return correctly)', async () => {
    const response = await agent().post('/otp/resendOtp').send({})
    expect(response.status).toBe(400)
    expect(response.body.status).toBe('error')
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('returns 500 with the generic fallback body on a network-level failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await agent().post('/otp/resendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
    expect(response.body.status).toBe('failed')
  })

  it('returns 500 (not the upstream status) even when msg91 responds with a real HTTP error', async () => {
    mockAxios.mockRejectedValue(upstreamError(400, { error: 'bad request' }))
    const response = await agent().post('/otp/resendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
    expect(response.body.status).toBe('failed')
  })

  it('logs OTP-resend failures at info level, not error level (known pre-existing bug)', async () => {
    // Same documented bug as /otp/sendOtp above — docs/DUPLICATE-CODE-CLEANUP.md
    // L3-9. Asserting current (buggy) behavior verbatim.
    mockAxios.mockRejectedValue(new Error('down'))
    await agent().post('/otp/resendOtp').send({ phone: '9876543210' })
    expect(mockLogInfo).toHaveBeenCalledWith(expect.stringContaining('Error in resending user OTP'))
    expect(mockLogError).not.toHaveBeenCalled()
  })
})

describe('POST /otp/validateOtp', () => {
  it('validates and reports success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ type: 'success' }))
    const response = await agent()
      .post('/otp/validateOtp')
      .send({ otp: '1234', phone: '9876543210' })
    expect(response.status).toBe(200)
  })

  it('returns 400 when msg91 reports the otp as invalid', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ type: 'error' }))
    const response = await agent()
      .post('/otp/validateOtp')
      .send({ otp: 'wrong', phone: '9876543210' })
    expect(response.status).toBe(400)
  })

  it('returns 500 when the msg91 call fails', async () => {
    mockAxios.mockRejectedValue(new Error('down'))
    const response = await agent()
      .post('/otp/validateOtp')
      .send({ otp: '1234', phone: '9876543210' })
    expect(response.status).toBe(500)
  })

  it('returns 500 with the generic fallback body on a network-level failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await agent()
      .post('/otp/validateOtp')
      .send({ otp: '1234', phone: '9876543210' })
    expect(response.status).toBe(500)
    expect(response.body.status).toBe('failed')
  })

  it('returns 500 (not the upstream status) even when msg91 responds with a real HTTP error', async () => {
    mockAxios.mockRejectedValue(upstreamError(400, { error: 'bad request' }))
    const response = await agent()
      .post('/otp/validateOtp')
      .send({ otp: '1234', phone: '9876543210' })
    expect(response.status).toBe(500)
    expect(response.body.status).toBe('failed')
  })

  it('logs OTP-validate failures at error level (this handler does NOT have the logInfo bug)', async () => {
    // Unlike /otp/sendOtp and /otp/resendOtp above, this catch block already
    // calls logError — confirming the L3-9 bug is specific to those two
    // handlers, not the whole file.
    mockAxios.mockRejectedValue(new Error('down'))
    await agent().post('/otp/validateOtp').send({ otp: '1234', phone: '9876543210' })
    expect(mockLogError).toHaveBeenCalled()
  })

  // A missing phone/otp is deliberately NOT sent as a live request either —
  // same unreturned res.status(400).json(...) double-send hazard as
  // /otp/sendOtp above.
})

describe('POST /createUser', () => {
  it('returns 400 on a Joi validation failure and writes the failure status to Postgres', async () => {
    const response = await agent()
      .post('/createUser')
      .send({ value: { request: { formValues: { role: 'Student' } } } })
    expect(response.status).toBe(400)
    expect(response.body.status).toBe('FAILED')
    // Validation failure still goes through updateUserStatusInDatabase before responding.
    expect(mockPool.query).toHaveBeenCalledTimes(1)
    // No upstream calls happen before validation.
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('creates a brand-new user end to end and returns 200 with a success journey status', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ result: { response: { content: [] } } })) // getUserDetails: no match
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'new-user-1' } })) // createUser
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } })) // assignRoleToUser
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent().post('/createUser').send(validStudentBody())

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
    // createUser's request body carries the shared default password, per the
    // documented L3-5 finding (docs/DUPLICATE-CODE-CLEANUP.md) — mpNHM reuses
    // CONSTANTS.BNRC_USER_DEFAULT_PASSWORD like the other two org files.
    // Asserting current behavior only; not a fix.
    const createUserCall = mockAxios.mock.calls[1][0]
    expect(createUserCall.data.request.password).toBe('default-pw')
  })

  it('returns 400 with the access-denied message when the new user could not be created (no userId)', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ result: { response: { content: [] } } })) // getUserDetails: no match
      .mockResolvedValueOnce(upstreamOk({ result: {} })) // createUser: no userId

    const response = await agent().post('/createUser').send(validStudentBody())

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/Access denied/)
  })

  it('returns 400 with the access-denied message when the createUser call fails outright', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ result: { response: { content: [] } } })) // getUserDetails: no match
      .mockRejectedValueOnce(networkError()) // createUser: transport failure

    const response = await agent().post('/createUser').send(validStudentBody())

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/Access denied/)
  })

  it('returns 400 access-denied when the phone lookup itself fails', async () => {
    mockAxios.mockRejectedValueOnce(networkError()) // getUserDetails: transport failure -> message === 'failed'

    const response = await agent().post('/createUser').send(validStudentBody())

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/Access denied/)
    // Only the phone-lookup call is made; the failed-lookup branch returns early.
    expect(mockAxios).toHaveBeenCalledTimes(1)
  })

  it('returns 400 access-denied when the existing user belongs to an org outside the allow-list', async () => {
    mockAxios.mockResolvedValueOnce(
      upstreamOk({ result: { response: { content: [{ id: 'u1', rootOrgName: 'Some Unrelated Org' }] } } }),
    )

    const response = await agent().post('/createUser').send(validStudentBody())

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/Access denied/)
  })

  it('migrates and returns 200 when an existing user is already in the valid root org but under a different target org', async () => {
    // getDetailsAsPerRole('Student').orgName is 'NA' (Student/Faculty hit the
    // default case in mpUtils.ts), so any existing user already in the one
    // validRootOrgs entry always mismatches the target org for a Student
    // registration, taking the migration branch. Using validRootOrgs[0]
    // directly (rather than retyping the literal) because that string
    // contains a non-breaking space between "Madhya" and "Pradesh", not a
    // regular space — a real, pre-existing quirk in mpUtils.ts's data that a
    // hand-typed lookalike string would silently fail to match.
    mockAxios
      .mockResolvedValueOnce(
        upstreamOk({
          result: {
            response: {
              content: [
                {
                  id: 'u1',
                  profileDetails: { profileReq: { personalDetails: {}, professionalDetails: [{}] } },
                  rootOrgName: validRootOrgs[0],
                },
              ],
            },
          },
        }),
      ) // getUserDetails: existing user in the one valid root org
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'success' } })) // migrateUserToMp: migrateUser call
      .mockResolvedValueOnce(upstreamOk({})) // migrateUserToMp: profileUpdate call
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } })) // assignRoleToUser
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent().post('/createUser').send(validStudentBody())

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
    // migrateUserToMp builds the migrated user's postal address with a blank
    // state name — documented pre-existing bug, docs/DUPLICATE-CODE-CLEANUP.md
    // L3-8 ("mpNHMUser.ts builds `India, , ${district}` — the state name is
    // literally blank — vs upsmf's 'Uttar Pradesh' and bnrc's 'Bihar'").
    // Asserting the CURRENT (buggy) value verbatim; not a fix.
    const migrateProfileUpdateCall = mockAxios.mock.calls[2][0]
    expect(migrateProfileUpdateCall.data.request.profileDetails.profileReq.personalDetails.postalAddress).toBe(
      'India, , Bhopal',
    )
  })

  it('migrates an aastrika-org user and returns 200 on success', async () => {
    mockAxios
      .mockResolvedValueOnce(
        upstreamOk({
          result: {
            response: {
              content: [
                {
                  id: 'u1',
                  profileDetails: { profileReq: { personalDetails: {}, professionalDetails: [{}] } },
                  rootOrgName: 'aastrika',
                },
              ],
            },
          },
        }),
      ) // getUserDetails
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'success' } })) // migrateUserToMp: migrateUser call
      .mockResolvedValueOnce(upstreamOk({})) // migrateUserToMp: profileUpdate call
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } })) // assignRoleToUser
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent().post('/createUser').send(validStudentBody())

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
  })

  it('returns 400 access-denied when migrating an aastrika-org user fails', async () => {
    mockAxios
      .mockResolvedValueOnce(
        upstreamOk({
          result: {
            response: {
              content: [
                {
                  id: 'u1',
                  profileDetails: { profileReq: { personalDetails: {}, professionalDetails: [{}] } },
                  rootOrgName: 'SPhere Team 1',
                },
              ],
            },
          },
        }),
      ) // getUserDetails
      .mockRejectedValueOnce(networkError()) // migrateUserToMp: migrateUser call fails -> migrateUserToMp returns false
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } })) // assignRoleToUser
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent().post('/createUser').send(validStudentBody())

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/Access denied/)
  })

  it('returns 400 access-denied when the existing user lookup itself reports failed', async () => {
    // Distinct branch from "phone lookup itself fails": here getUserDetails
    // resolves successfully but its own message is 'failed' (not thrown),
    // e.g. a malformed upstream success response missing result.response.
    mockAxios.mockResolvedValueOnce(upstreamOk({ result: {} }))

    const response = await agent().post('/createUser').send(validStudentBody())

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/Access denied/)
  })

  it('reports a failed journey status (400) when downstream role-assign fails after a successful user creation', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ result: { response: { content: [] } } })) // getUserDetails: no match
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'new-user-2' } })) // createUser
      .mockRejectedValueOnce(networkError()) // assignRoleToUser fails
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent().post('/createUser').send(validStudentBody())

    expect(response.status).toBe(400)
    expect(response.body.userJourneyStatus.roleAssign).toBe('failed')
  })

  it('still returns 200 when the Postgres audit-log insert fails after exhausting retries', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ result: { response: { content: [] } } })) // getUserDetails: no match
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'new-user-3' } })) // createUser
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } })) // assignRoleToUser
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate
    // Every Postgres insert attempt fails; updateUserStatusInDatabase's own
    // return value is never surfaced to the HTTP caller either way, so the
    // route still responds 200 for an otherwise-successful registration.
    // mpNHMUser.ts's retry loop correctly returns false on exhausted retries
    // (unlike bnrcUser.ts's documented L3-7 break/return-true bug) — asserting
    // the route-level behavior is unaffected by that return value either way.
    mockPool.query.mockRejectedValue(new Error('insert failed'))

    const response = await agent().post('/createUser').send(validStudentBody())

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
    expect(mockPool.query).toHaveBeenCalledTimes(2)
  }, 10000)

  it('returns 400 with the access-denied message when an unexpected error is thrown in the handler', async () => {
    mockAxios.mockImplementationOnce(() => {
      throw new TypeError('boom')
    })

    const response = await agent().post('/createUser').send(validStudentBody())

    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/Access denied/)
  })
})
