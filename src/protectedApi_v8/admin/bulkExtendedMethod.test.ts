/**
 * bulkExtendedMethod.ts — NOT an Express router. It exports two plain async
 * helper functions, `bulkExtendedMethod` and `saveExtendedData`, each of
 * which builds a Kong "update user profile" payload from a CSV-row-shaped
 * object and PATCHes it via the callable `axios({...})` form. Both are
 * called (and mocked) from bulkUploadUser.ts's route handler — there is no
 * router here to mount, so these are exercised as plain function calls
 * rather than through mountRouter/supertest.
 *
 * Both functions wrap their entire body in a try/catch that only logs on
 * error and does not rethrow — so a failed axios call resolves to
 * `undefined` rather than throwing or hanging. Safe to exercise live in
 * both the success and failure directions.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logInfo: jest.fn() }))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    KONG_API_BASE: 'https://kong.test',
    SB_API_KEY: 'sb-api-key',
  },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../../test-support/mockAxios'
import { bulkExtendedMethod, saveExtendedData } from './bulkExtendedMethod'

const mockAxiosCallable = axios as unknown as jest.Mock

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

/**
 * @description Verifies bulkExtendedMethod builds and PATCHes the correct
 * Kong profile-update payload from a CSV-row request and returns the
 * original request on success, and resolves to undefined without throwing
 * when the upstream PATCH fails.
 */
describe('bulkExtendedMethod', () => {
  const request = {
    Designation: 'Nurse',
    RN_Number: 'RN-1',
    countryCode: '91',
    dob: '1985-05-05',
    first_name: 'Jane',
    hobbies: 'reading',
    institution_name: 'Other Institute',
    last_name: 'Doe',
    nameOfInstitute: 'Institute A',
    nameOfQualification: 'BSc',
    orgType: 'govt',
    organisationName: 'Org A',
    postalAddress: '123 Street',
    profession: 'nurse',
    profileLocation: 'City A',
    qualificationType: 'degree',
    yearOfPassing: '2010',
  }

  it('should PATCH the built profile payload to Kong and return the original request on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: {} }))

    const result = await bulkExtendedMethod(request, 'user-1')

    expect(result).toBe(request)
    expect(mockAxiosCallable).toHaveBeenCalledTimes(1)
    const callConfig = mockAxiosCallable.mock.calls[0][0]
    expect(callConfig.method).toBe('PATCH')
    expect(callConfig.url).toBe('https://kong.test/user/private/v1/update')
    expect(callConfig.headers.Authorization).toBe('sb-api-key')
    expect(callConfig.data.request.userId).toBe('user-1')
    expect(callConfig.data.request.profileDetails.id).toBe('user-1')
    const profileReq = callConfig.data.request.profileDetails.profileReq
    expect(profileReq.academics[0]).toEqual({
      nameOfInstitute: request.nameOfInstitute,
      nameOfQualification: request.nameOfQualification,
      type: request.qualificationType,
      yearOfPassing: request.yearOfPassing,
    })
    expect(profileReq.personalDetails.firstname).toBe('Jane')
    expect(profileReq.personalDetails.surname).toBe('Doe')
    expect(profileReq.personalDetails.tncAccepted).toBe(false)
  })

  it('should resolve to undefined (caught and logged) when the upstream PATCH fails, instead of throwing', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const result = await bulkExtendedMethod(request, 'user-1')

    expect(result).toBeUndefined()
  })
})

/**
 * @description Verifies saveExtendedData builds and PATCHes the correct
 * Kong profile-update payload for an ASHA-worker CSV row (including the
 * hard-coded countryCode/dob) and returns the original request on success,
 * and resolves to undefined without throwing when the upstream PATCH fails.
 */
describe('saveExtendedData', () => {
  const request = {
    Cadre: 'ASHAS',
    UserID: 'ext-1',
    first_name: 'Asha',
    last_name: 'Worker',
    qualificationType: 'na',
  }

  it('should PATCH the ASHA-worker profile payload (hard-coded countryCode/dob) and return the request on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: {} }))

    const result = await saveExtendedData(request, 'user-2')

    expect(result).toBe(request)
    expect(mockAxiosCallable).toHaveBeenCalledTimes(1)
    const callConfig = mockAxiosCallable.mock.calls[0][0]
    expect(callConfig.method).toBe('PATCH')
    expect(callConfig.url).toBe('https://kong.test/user/private/v1/update')
    expect(callConfig.headers.Authorization).toBe('sb-api-key')
    expect(callConfig.data.request.userId).toBe('user-2')
    const profileReq = callConfig.data.request.profileDetails.profileReq
    expect(profileReq.personalDetails.countryCode).toBe('IN')
    expect(profileReq.personalDetails.dob).toBe('1990-01-01')
    expect(profileReq.personalDetails.firstname).toBe('Asha')
    expect(profileReq.personalDetails.surname).toBe('Worker')
    expect(profileReq.academics[0].yearOfPassing).toBe('1990')
    expect(profileReq.employmentDetails.departmentName).toBe('ASHAS')
  })

  it('should resolve to undefined (caught and logged) when the upstream PATCH fails, instead of throwing', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const result = await saveExtendedData(request, 'user-2')

    expect(result).toBeUndefined()
  })
})
