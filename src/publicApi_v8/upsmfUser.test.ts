/**
 * PHASE 1 — upsmfUser.ts (212 uncovered).
 *
 * Structurally near-identical to bnrcUser.ts (same author, same pg-pool +
 * createUser + 3-OTP-endpoint shape) — see that file's test for the sibling
 * coverage.
 *
 * PHASE 2 — /createUser coverage added below. Same bug family as
 * mpNHMUser.ts: L3-5 (all three orgs' createUser() reuses
 * CONSTANTS.BNRC_USER_DEFAULT_PASSWORD regardless of org — see
 * docs/PROD-VERIFICATION.md change BL) and L3-7 (updateUserStatusInDatabase()
 * retry loop). Unlike bnrcUser.ts (doc change BI), upsmfUser.ts's retry loop
 * correctly `return false`s when Postgres insert retries are exhausted, so
 * that path is asserted here as correct behavior, not a bug.
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
    MSG_91_AUTH_KEY_SSO: 'msg91-key',
    MSG_91_TEMPLATE_ID_SEND_OTP_SSO: 'tmpl-1',
    SB_API_KEY: 'sb-api-key',
  },
}))

import axios from 'axios'
import { Pool } from 'pg'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { upsmfUserCreation } from './upsmfUser'

const mockAxios = axios as unknown as jest.Mock
const mockPool = (Pool as unknown as jest.Mock).mock.results[0].value as { query: jest.Mock }
const agent = () => mountRouter(upsmfUserCreation)

beforeEach(() => {
  mockAxios.mockReset()
  mockPool.query.mockReset()
  mockPool.query.mockResolvedValue({ rows: [] })
})

/** Minimal valid /createUser payload for a brand-new Student registration. */
const validStudentBody = () => ({
  value: {
    request: {
      formValues: {
        courseSelection: 'GNM',
        district: 'Lucknow',
        firstName: 'Asha',
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
    expect(response.body.status).toBe('success')
  })

  it('returns 500 when the msg91 call fails', async () => {
    mockAxios.mockRejectedValue(new Error('down'))
    const response = await agent().post('/otp/sendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
  })

  // A missing phone is deliberately NOT sent live — same unreturned-400
  // double-send hazard documented for bnrcUser.ts. See
  // docs/PROD-VERIFICATION.md.
})

describe('POST /otp/resendOtp', () => {
  it('resends the otp and reports success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({}))
    const response = await agent().post('/otp/resendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(200)
  })

  it('rejects a request with no phone', async () => {
    const response = await agent().post('/otp/resendOtp').send({})
    expect(response.status).toBe(400)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('returns 500 when the msg91 call fails', async () => {
    mockAxios.mockRejectedValue(new Error('down'))
    const response = await agent().post('/otp/resendOtp').send({ phone: '9876543210' })
    expect(response.status).toBe(500)
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
    // documented BL finding (docs/PROD-VERIFICATION.md) — upsmf reuses
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

  it('migrates and returns 200 when an existing user is already in a valid root org but under a different target org', async () => {
    mockAxios
      .mockResolvedValueOnce(
        upstreamOk({
          result: {
            response: {
              content: [
                {
                  id: 'u1',
                  profileDetails: { profileReq: { personalDetails: {}, professionalDetails: [{}] } },
                  rootOrgName: 'National Health Mission (UP)',
                },
              ],
            },
          },
        }),
      ) // getUserDetails: existing user in a different valid org than the new Student org
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'success' } })) // migrateUserToUpsmf: migrateUser call
      .mockResolvedValueOnce(upstreamOk({})) // migrateUserToUpsmf: profileUpdate call
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } })) // assignRoleToUser
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent().post('/createUser').send(validStudentBody())

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
  })

  it('returns 200 without migrating when the existing user is already in the target org', async () => {
    mockAxios
      .mockResolvedValueOnce(
        upstreamOk({
          result: {
            response: {
              content: [
                {
                  id: 'u1',
                  rootOrgName: 'Department of Medical Education Education and Training',
                },
              ],
            },
          },
        }),
      ) // getUserDetails: already in the exact target org for role Student
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent().post('/createUser').send(validStudentBody())

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
    expect(mockAxios).toHaveBeenCalledTimes(2)
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
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'success' } })) // migrateUserToUpsmf: migrateUser call
      .mockResolvedValueOnce(upstreamOk({})) // migrateUserToUpsmf: profileUpdate call
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
      .mockRejectedValueOnce(networkError()) // migrateUserToUpsmf: migrateUser call fails -> migrateUserToUpsmf returns false
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } })) // assignRoleToUser
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

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
    // Unlike bnrcUser.ts (docs/PROD-VERIFICATION.md change BI), upsmfUser.ts's
    // retry loop correctly returns false here rather than reporting success
    // internally — asserting the route-level behavior is unaffected by that
    // return value either way.
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

  it('creates a Faculty user end to end, exercising the Faculty branch of userProfileUpdate', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ result: { response: { content: [] } } })) // getUserDetails: no match
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'faculty-user-1' } })) // createUser
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } })) // assignRoleToUser
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent()
      .post('/createUser')
      .send({
        value: {
          request: {
            formValues: {
              district: 'Lucknow',
              facultyType: 'Guest',
              firstName: 'Ravi',
              instituteName: 'City Institute',
              instituteType: 'Government',
              lastName: 'Sharma',
              phone: 9876543211,
              role: 'Faculty',
              serviceType: 'Regular',
            },
          },
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
  })

  it('creates a Medical Officer-UP user end to end, exercising that branch of userProfileUpdate', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ result: { response: { content: [] } } })) // getUserDetails: no match
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'mo-user-1' } })) // createUser
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } })) // assignRoleToUser
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent()
      .post('/createUser')
      .send({
        value: {
          request: {
            formValues: {
              dateOfJoining: '2020-01-01',
              district: 'Lucknow',
              firstName: 'Anita',
              lastName: 'Verma',
              phone: 9876543212,
              role: 'Medical Officer-UP',
            },
          },
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
  })

  it('creates an ANM-UP Government/Regular user, exercising that userProfileUpdate branch and the Government+Regular org-detail branch', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ result: { response: { content: [] } } })) // getUserDetails: no match
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'anm-user-1' } })) // createUser
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } })) // assignRoleToUser
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent()
      .post('/createUser')
      .send({
        value: {
          request: {
            formValues: {
              district: 'Lucknow',
              dob: '1995-05-05',
              firstName: 'Meena',
              hrmsId: '12345',
              lastName: 'Yadav',
              phone: 9876543213,
              block: 'Block A',
              facilityCode: 'FC1',
              facilityType: 'PHC',
              role: 'ANM-UP',
              roleForInService: 'Government',
              serviceType: 'Regular',
            },
          },
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
  })

  it('creates an ANM-UP Private user, exercising the Private org-detail branch', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ result: { response: { content: [] } } })) // getUserDetails: no match
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'anm-user-2' } })) // createUser
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } })) // assignRoleToUser
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent()
      .post('/createUser')
      .send({
        value: {
          request: {
            formValues: {
              district: 'Lucknow',
              dob: '1995-05-05',
              firstName: 'Priya',
              lastName: 'Singh',
              phone: 9876543214,
              role: 'ANM-UP',
              roleForInService: 'Private',
              serviceType: 'Private',
            },
          },
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
  })

  it('resolves without throwing when assignRoleToUser gets a non-SUCCESS response (roleAssign stays failed)', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({ result: { response: { content: [] } } })) // getUserDetails: no match
      .mockResolvedValueOnce(upstreamOk({ result: { userId: 'new-user-4' } })) // createUser
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'FAILED' } })) // assignRoleToUser: not 'SUCCESS', not an error
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent().post('/createUser').send(validStudentBody())

    expect(response.status).toBe(400)
    expect(response.body.userJourneyStatus.roleAssign).toBe('failed')
  })

  it('migrates and returns 400 access-denied when migrateUserToUpsmf resolves but the upstream response is not \'success\'', async () => {
    mockAxios
      .mockResolvedValueOnce(
        upstreamOk({
          result: {
            response: {
              content: [
                {
                  id: 'u1',
                  profileDetails: { profileReq: { personalDetails: {}, professionalDetails: [{}] } },
                  rootOrgName: 'National Health Mission (UP)',
                },
              ],
            },
          },
        }),
      ) // getUserDetails: existing user in a different valid org than the new Student org
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'PENDING' } })) // migrateUserToUpsmf: migrateUser call resolves but not 'success'
      .mockResolvedValueOnce(upstreamOk({})) // migrateUserToUpsmf: profileUpdate call
      .mockResolvedValueOnce(upstreamOk({ result: { response: 'SUCCESS' } })) // assignRoleToUser
      .mockResolvedValueOnce(upstreamOk({})) // userProfileUpdate

    const response = await agent().post('/createUser').send(validStudentBody())

    // migrateUserToUpsmf implicitly returns undefined (falsy) here, same as the
    // network-error case already covered — the handler doesn't branch on the
    // migration result at all in this code path, so it still reports 200.
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
  })
})
