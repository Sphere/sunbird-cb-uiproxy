/**
 * PHASE 1 — bnrcUser.ts (251 uncovered).
 *
 * Scope: the three OTP endpoints only. POST /createUser (~150 lines) is a
 * multi-step Joi-validated flow across Postgres and several internal helpers
 * (getUserDetails, migrateUserToBnrc, assignRoleToUser, userProfileUpdate,
 * createUser, updateUserStatusInDatabase) with org-migration business logic —
 * not a one-line mock; deferred to Phase 2 with this file's other
 * Postgres-dependent code.
 *
 * `pg` is mocked because `new (require('pg')).Pool(...)` runs AT IMPORT TIME.
 *
 * PHASE 2 additions below cover POST /createUser and its internal helpers,
 * plus the upstream-HTTP-error-response branches of the OTP routes that
 * Phase 1 didn't exercise (only network errors were covered there).
 */

jest.mock('axios')
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ on: jest.fn(), query: jest.fn() })) }))
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    BNRC_USER_DEFAULT_PASSWORD: 'default-pw',
    DATA_LAKE_POSTGRES_DATABASE: 'db',
    DATA_LAKE_POSTGRES_HOST: 'host',
    DATA_LAKE_POSTGRES_PASSWORD: 'pw',
    DATA_LAKE_POSTGRES_PORT: 5432,
    DATA_LAKE_POSTGRES_USER: 'user',
    HTTPS_HOST: 'https://sunbird.test',
    LEARNER_SERVICE_API_BASE: 'https://learner.test',
    MSG_91_AUTH_KEY_SSO: 'msg91-key',
    MSG_91_TEMPLATE_ID_SEND_OTP_SSO: 'tmpl-1',
    SB_API_KEY: 'sb-api-key',
    SB_EXT_API_BASE_2: 'https://sb-ext.test',
  },
}))

import axios from 'axios'
import { Pool } from 'pg'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { bnrcUserCreation } from './bnrcUser'

const mockAxios = axios as unknown as jest.Mock
const agent = () => mountRouter(bnrcUserCreation)

// The pg Pool is constructed once at import time inside the module under test
// (`createDataLakePgPool()` -> `new Pool(...)`). Pull out the single instance
// actually wired to pgPool so tests can drive its query() behaviour, matching
// the established pattern in signupWithAutoLoginOrgForm.test.ts.
const mockPoolInstance = (Pool as unknown as jest.Mock).mock.results[0].value
const mockPgQuery = mockPoolInstance.query as jest.Mock

beforeEach(() => {
  mockAxios.mockReset()
  mockPgQuery.mockReset()
  mockPgQuery.mockResolvedValue(undefined)
})

/** Minimal valid /createUser body for the 'Student' role. */
function studentFormValues(overrides = {}) {
  return {
    courseSelection: 'GNM',
    district: 'Patna',
    firstName: 'Asha',
    instituteName: 'ANM School Patna',
    instituteType: 'Government',
    lastName: 'Kumari',
    phone: 9876543210,
    role: 'Student',
    ...overrides,
  }
}

function createUserBody(formValues = studentFormValues()) {
  return { value: { request: { formValues } } }
}

const userNotFound = upstreamOk({ result: { response: { content: [] } } })

/**
 * An existing-user search result shaped for the migrateUserToBnrc() path,
 * which reads userDetails.profileDetails.profileReq.professionalDetails[0]
 * and .personalDetails — both must already exist or that helper throws
 * internally (caught, returns false) before making its second axios call.
 */
function existingUserWithProfile(id: string, rootOrgName: string) {
  return upstreamOk({
    result: {
      response: {
        content: [
          {
            id,
            profileDetails: {
              profileReq: {
                personalDetails: { postalAddress: '' },
                professionalDetails: [{}],
              },
            },
            rootOrgName,
          },
        ],
      },
    },
  })
}

describe('POST /otp/sendOtp', () => {
  it('sends the otp and reports success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))

    const response = await agent().post('/otp/sendOtp').send({ phone: '9876543210' })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('success')
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ mobile: '+919876543210' }) })
    )
  })

  it('returns 500 when the msg91 call fails', async () => {
    mockAxios.mockRejectedValue(new Error('down'))
    const response = await agent().post('/otp/sendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
  })

  it('returns 500 (falls back, does not forward the upstream status) when msg91 responds with an HTTP error', async () => {
    mockAxios.mockRejectedValue(upstreamError(502, { error: 'msg91 down' }))
    const response = await agent().post('/otp/sendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
    expect(response.body.status).toBe('failed')
  })

  // A missing phone is deliberately NOT sent as a live request: the handler
  // calls res.status(400).json(...) WITHOUT returning, so it falls through and
  // calls axios anyway, then res.status(200).json(...) a SECOND time on an
  // already-sent response — throwing ERR_HTTP_HEADERS_SENT, unhandled. Same
  // failure family documented for userRegistration.ts and
  // emailOrMobileLoginSignIn.ts. Recorded in docs/PROD-VERIFICATION.md.
})

describe('POST /otp/resendOtp', () => {
  it('resends the otp and reports success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))
    const response = await agent().post('/otp/resendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(200)
  })

  it('rejects a request with no phone (this handler DOES return correctly)', async () => {
    const response = await agent().post('/otp/resendOtp').send({})
    expect(response.status).toBe(400)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('returns 500 when the msg91 call fails', async () => {
    mockAxios.mockRejectedValue(new Error('down'))
    const response = await agent().post('/otp/resendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
  })

  it('returns 500 when msg91 responds with an HTTP error', async () => {
    mockAxios.mockRejectedValue(upstreamError(503, { error: 'msg91 down' }))
    const response = await agent().post('/otp/resendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
    expect(response.body.status).toBe('failed')
  })
})

describe('POST /otp/validateOtp', () => {
  it('validates and reports success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ type: 'success' }))

    const response = await agent()
      .post('/otp/validateOtp')
      .send({ otp: '1234', phone: '9876543210' })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('success')
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

  it('returns 500 when msg91 responds with an HTTP error', async () => {
    mockAxios.mockRejectedValue(upstreamError(500, { error: 'msg91 down' }))
    const response = await agent()
      .post('/otp/validateOtp')
      .send({ otp: '1234', phone: '9876543210' })
    expect(response.status).toBe(500)
    expect(response.body.status).toBe('failed')
  })

  // A missing phone/otp is deliberately NOT sent as a live request either —
  // same unreturned res.status(400).json(...) pattern as /otp/sendOtp above.
})

describe('POST /createUser', () => {
  it('returns 400 with the Joi validation message when a required field is missing', async () => {
    const response = await agent()
      .post('/createUser')
      .send(createUserBody(studentFormValues({ firstName: undefined })))

    expect(response.status).toBe(400)
    expect(response.body.status).toBe('FAILED')
    expect(mockAxios).not.toHaveBeenCalled()
    // Validation failure still writes an audit row (updateUserStatusInDatabase).
    expect(mockPgQuery).toHaveBeenCalledTimes(1)
  })

  it('creates a brand-new Student user end to end and reports success', async () => {
    mockAxios
      .mockResolvedValueOnce(userNotFound) // getUserDetails
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'new-user-1' } })) // createUser
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } })) // assignRoleToUser
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent().post('/createUser').send(createUserBody())

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
  })

  it('returns 400 with the journey status when role assignment fails for a new user', async () => {
    mockAxios
      .mockResolvedValueOnce(userNotFound)
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'new-user-2' } }))
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'FAILED' } })) // assignRoleToUser -> falsy
      .mockResolvedValueOnce(upstreamOk({}))

    const response = await agent().post('/createUser').send(createUserBody())

    expect(response.status).toBe(400)
    expect(response.body.userJourneyStatus.roleAssign).toBe('failed')
  })

  it('returns 400 when createUser upstream never returns a userId', async () => {
    mockAxios
      .mockResolvedValueOnce(userNotFound)
      .mockResolvedValueOnce(upstreamOk({ result: {} })) // createUser -> no userId

    const response = await agent().post('/createUser').send(createUserBody())

    expect(response.status).toBe(400)
    expect(response.body.message).toContain('Access denied')
  })

  it('returns 400 accessDenied when the createUser upstream call itself fails', async () => {
    mockAxios
      .mockResolvedValueOnce(userNotFound)
      .mockRejectedValueOnce(upstreamError(502, { error: 'user-service down' }))

    const response = await agent().post('/createUser').send(createUserBody())

    expect(response.status).toBe(400)
    expect(response.body.message).toContain('Access denied')
  })

  it('returns 400 accessDenied when the getUserDetails (user search) upstream call fails', async () => {
    mockAxios.mockRejectedValueOnce(networkError())

    const response = await agent().post('/createUser').send(createUserBody())

    expect(response.status).toBe(400)
    expect(response.body.message).toContain('Access denied')
    // Only the failed search call was made; createUser must not run afterward.
    expect(mockAxios).toHaveBeenCalledTimes(1)
  })

  it('updates an existing user in the same BNRC-family org and reports success', async () => {
    mockAxios
      .mockResolvedValueOnce(
        upstreamOk({
          result: {
            response: {
              content: [{ id: 'existing-1', rootOrgName: 'Bihar Nursing Registration Council' }],
            },
          },
        })
      ) // getUserDetails
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent().post('/createUser').send(createUserBody())

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
    // Same org as the new role -> no migrateUserToBnrc/assignRoleToUser calls.
    expect(mockAxios).toHaveBeenCalledTimes(2)
  })

  it('migrates an existing user to a new BNRC-family org when their role/org changes', async () => {
    mockAxios
      // In-Service org, but the submitted form is 'Student' -> different target org triggers migration.
      .mockResolvedValueOnce(existingUserWithProfile('existing-2', 'Private (Bihar)')) // getUserDetails
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'success' } })) // migrateUserToBnrc: migrateUser PATCH
      .mockResolvedValueOnce(upstreamOk({})) // migrateUserToBnrc: profileUpdate PATCH
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } })) // assignRoleToUser
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent().post('/createUser').send(createUserBody())

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
    expect(mockAxios).toHaveBeenCalledTimes(5)
  })

  it('migrates an aastrika-org user, reporting success when migration and role assignment both succeed', async () => {
    mockAxios
      .mockResolvedValueOnce(existingUserWithProfile('existing-3', 'aastrika')) // getUserDetails
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'success' } })) // migrateUserToBnrc: migrateUser PATCH
      .mockResolvedValueOnce(upstreamOk({})) // migrateUserToBnrc: profileUpdate PATCH
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } })) // assignRoleToUser
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent().post('/createUser').send(createUserBody())

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
  })

  it('returns 400 accessDenied when migrating an aastrika-org user fails', async () => {
    mockAxios
      .mockResolvedValueOnce(
        upstreamOk({ result: { response: { content: [{ id: 'existing-4', rootOrgName: 'SPhere Team 1' }] } } })
      ) // getUserDetails
      .mockRejectedValueOnce(upstreamError(502, {})) // migrateUserToBnrc fails outright -> falsy
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } })) // assignRoleToUser
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent().post('/createUser').send(createUserBody())

    expect(response.status).toBe(400)
    expect(response.body.message).toContain('Access denied')
  })

  it('returns 400 accessDenied when the existing user belongs to an unrecognised org', async () => {
    mockAxios.mockResolvedValueOnce(
      upstreamOk({ result: { response: { content: [{ id: 'existing-5', rootOrgName: 'Some Other Org' }] } } })
    )

    const response = await agent().post('/createUser').send(createUserBody())

    expect(response.status).toBe(400)
    expect(response.body.message).toContain('Access denied')
    expect(mockAxios).toHaveBeenCalledTimes(1)
  })

  // A body missing `value.request.formValues` is deliberately NOT sent as a
  // live request: `const userFormDetails = req.body.value.request.formValues`
  // sits BEFORE the handler's try block, so that throw is an unhandled
  // synchronous exception outside any catch — Express never sends a
  // response and the request hangs until timeout. Same
  // fell-outside-the-try-block failure family as the other unreturned/
  // unhandled cases documented in docs/PROD-VERIFICATION.md for this file.

  it('creates an In Service / Public Health Facility user (a distinct role/profile branch)', async () => {
    mockAxios
      .mockResolvedValueOnce(userNotFound)
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'new-user-3' } }))
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } }))
      .mockResolvedValueOnce(upstreamOk({}))

    const response = await agent()
      .post('/createUser')
      .send(
        createUserBody(
          studentFormValues({
            courseSelection: undefined,
            instituteName: undefined,
            instituteType: undefined,
            publicFacilityType: 'GNM-Bihar',
            role: 'In Service',
            roleForInService: 'Public Health Facility',
          })
        )
      )

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
  })

  // Documented, pre-existing bug (docs/PROD-VERIFICATION.md, item BI /
  // docs/DUPLICATE-CODE-CLEANUP.md, L3-7): updateUserStatusInDatabase()
  // `break`s out of its retry loop on exhausted retries exactly like it does
  // on success, then unconditionally `return true`s either way — so a fully
  // failed audit-log insert is still reported as a successful registration.
  // Asserting the CURRENT behaviour here, not fixing it.
  it('still reports registration success even when every Postgres audit-log insert attempt fails (documented bug BI)', async () => {
    mockPgQuery.mockReset()
    mockPgQuery.mockRejectedValue(new Error('connection refused'))
    mockAxios
      .mockResolvedValueOnce(userNotFound)
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'new-user-4' } }))
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } }))
      .mockResolvedValueOnce(upstreamOk({}))

    const response = await agent().post('/createUser').send(createUserBody())

    // The registration itself still reports SUCCESS even though the audit
    // row was never written after exhausting retries — this is the bug.
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
    expect(mockPgQuery).toHaveBeenCalledTimes(2) // maxRetries = 2, both attempts failed
  })
})
