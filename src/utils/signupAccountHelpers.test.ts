/**
 * createAccount / profileUpdate / updateRoles — shared by the auto-login
 * signup flows (signupWithAutoLogin.ts, signupWithAutoLoginV2.ts,
 * appSignUpWithAutoLogin.ts; updateRoles only by the latter two, see its
 * own sonar-cleanup comment for why). Had no direct test file before —
 * only indirect coverage through each caller's own route tests.
 */

jest.mock('axios')
jest.mock('./logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('./env', () => ({
  CONSTANTS: { SB_API_KEY: 'sb-api-key-test' },
}))
jest.mock('./autoLoginSignupConstants', () => ({
  API_END_POINTS: {
    createUserWithMobileNo: 'https://sunbird.test/user/v3/create',
    profileUpdate: 'https://sunbird.test/user/private/v1/update',
    userRoles: 'https://sunbird.test/user/private/v1/assign/role',
  },
}))

import axios from 'axios'
import { createAccount, profileUpdate, updateRoles } from './signupAccountHelpers'

const mockAxiosCallable = axios as unknown as jest.Mock

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

/**
 * @description Verifies createAccount posts the email-typed request when
 * profileData has an email, and forwards the axios response.
 */
it('creates an account using the email field when profileData has an email', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { result: { userId: 'user-1' } } })

  const result = await createAccount({
    email: 'jane@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    password: 'secret',
  })

  expect(result.data.result.userId).toBe('user-1')
  expect(mockAxiosCallable).toHaveBeenCalledWith(
    expect.objectContaining({
      data: {
        request: {
          email: 'jane@example.com',
          firstName: 'Jane',
          lastName: 'Doe',
          password: 'secret',
        },
      },
      url: 'https://sunbird.test/user/v3/create',
    })
  )
})

/**
 * @description Verifies createAccount posts the phone-typed request when
 * profileData has no email.
 */
it('creates an account using the phone field when profileData has no email', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { result: { userId: 'user-1' } } })

  await createAccount({ firstName: 'Jane', lastName: 'Doe', password: 'secret', phone: '9876543210' })

  expect(mockAxiosCallable).toHaveBeenCalledWith(
    expect.objectContaining({
      data: { request: { firstName: 'Jane', lastName: 'Doe', password: 'secret', phone: '9876543210' } },
    })
  )
})

/**
 * @description Verifies createAccount swallows a rejected call rather than
 * throwing (matching every caller's fire-and-forget usage).
 */
it('createAccount returns undefined rather than throwing when the call rejects', async () => {
  mockAxiosCallable.mockRejectedValue(new Error('network down'))

  const result = await createAccount({ email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' })

  expect(result).toBeUndefined()
})

/**
 * @description Verifies profileUpdate PATCHes the expected personalDetails
 * shape for the given userId.
 */
it('updates a profile with the given firstName/lastName/userId', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { result: { response: 'SUCCESS' } } })

  await profileUpdate({ firstName: 'Jane', lastName: 'Doe' }, 'user-1')

  expect(mockAxiosCallable).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        request: expect.objectContaining({
          profileDetails: expect.objectContaining({
            profileReq: expect.objectContaining({
              id: 'user-1',
              personalDetails: { firstname: 'Jane', surname: 'Doe' },
            }),
          }),
          userId: 'user-1',
        }),
      }),
      method: 'PATCH',
      url: 'https://sunbird.test/user/private/v1/update',
    })
  )
})

/**
 * @description Verifies updateRoles posts a PUBLIC role assignment for the
 * given userUUId to the fixed auto-login-signup org id.
 */
it('assigns the PUBLIC role to the given user in the auto-login-signup org', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { result: { response: 'SUCCESS' } } })

  const result: any = await updateRoles('user-uuid-1')

  expect(result.data.result.response).toBe('SUCCESS')
  expect(mockAxiosCallable).toHaveBeenCalledWith(
    expect.objectContaining({
      data: {
        request: {
          organisationId: '0132317968766894088',
          roles: ['PUBLIC'],
          userId: 'user-uuid-1',
        },
      },
      method: 'POST',
      url: 'https://sunbird.test/user/private/v1/assign/role',
    })
  )
})

/**
 * @description Verifies updateRoles returns the string 'false' rather than
 * throwing when the role-assignment call rejects — matching the original
 * inline handlers' exact (unusual, string-not-boolean) failure value.
 */
it('updateRoles returns the string "false" when the call rejects', async () => {
  mockAxiosCallable.mockRejectedValue(new Error('network down'))

  const result = await updateRoles('user-uuid-1')

  expect(result).toBe('false')
})

/**
 * @description Concurrency: updateRoles is shared between
 * signupWithAutoLoginV2.ts and appSignUpWithAutoLogin.ts, which can each
 * receive signups at the same time. Fires 2 concurrent calls for different
 * users and confirms each axios call carries its own userUUId, never the
 * other's.
 */
it('concurrent updateRoles calls for different users never mix up the userId', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { result: { response: 'SUCCESS' } } })

  await Promise.all([updateRoles('user-a'), updateRoles('user-b')])

  const calls = mockAxiosCallable.mock.calls.map((c) => c[0])
  expect(calls.some((c) => c.data.request.userId === 'user-a')).toBe(true)
  expect(calls.some((c) => c.data.request.userId === 'user-b')).toBe(true)
})
