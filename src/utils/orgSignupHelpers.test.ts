/**
 * getUserDetails — shared user-search-by-phone helper behind upsmfUser.ts /
 * mpNHMUser.ts / bnrcUser.ts (CHANGE 30). Exercised directly here,
 * independent of any single caller's own test file.
 */

jest.mock('axios')
jest.mock('./logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('./env', () => ({
  CONSTANTS: { MSG_91_TEMPLATE_ID_SEND_OTP_SSO: 'template-1', SB_API_KEY: 'sb-api-key-test' },
}))
jest.mock('./orgSignupConstants', () => ({
  API_END_POINTS: {
    migrateUser: 'https://sunbird.test/user/v1/migrate',
    msg91ResendOtp: 'https://msg91.test/retry',
    msg91SendOtp: 'https://msg91.test/send',
    msg91VerifyOtp: 'https://msg91.test/verify',
    profileUpdate: 'https://sunbird.test/user/private/v1/update',
    userSearch: 'https://learner.test/private/user/v1/search',
  },
  INDIAN_COUNTRY_CODE: '+91',
  MSG91_HEADERS: { authkey: 'msg91-key-test' },
}))

import axios from 'axios'
import {
  assignOrgSignupUserRole,
  createOrgSignupUser,
  getUserDetails,
  migrateOrgSignupUser,
  resendMsg91Otp,
  sendMsg91Otp,
  verifyMsg91Otp,
} from './orgSignupHelpers'

const mockAxiosCallable = axios as unknown as jest.Mock

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

/**
 * @description Verifies a matching user is returned when the search finds
 * at least one result, and that phone is stringified in the request filter.
 */
it('returns the first matching user when found', async () => {
  mockAxiosCallable.mockResolvedValue({
    data: { result: { response: { content: [{ id: 'user-1' }] } } },
  })

  const result = await getUserDetails(9876543210)

  expect(result).toEqual({ message: 'success', userDetails: { id: 'user-1' } })
  expect(mockAxiosCallable).toHaveBeenCalledWith(
    expect.objectContaining({
      data: { request: { filters: { phone: '9876543210' } } },
      url: 'https://learner.test/private/user/v1/search',
    })
  )
})

/**
 * @description Verifies an empty userDetails string is returned when the
 * search succeeds but finds no matching content.
 */
it('returns an empty userDetails when no match is found', async () => {
  mockAxiosCallable.mockResolvedValue({
    data: { result: { response: { content: [] } } },
  })

  const result = await getUserDetails(9876543210)

  expect(result).toEqual({ message: 'success', userDetails: '' })
})

/**
 * @description Verifies a failed lookup returns a failure message rather
 * than throwing.
 */
it('returns a failure message when the search call rejects', async () => {
  mockAxiosCallable.mockRejectedValue(new Error('network down'))

  const result = await getUserDetails(9876543210)

  expect(result).toEqual({ message: 'failed' })
})

/**
 * @description Verifies createOrgSignupUser logs with the given orgLabel,
 * resolves the channel via the given getOrgName, and omits the axios
 * `timeout` option entirely when timeoutMs is not passed — matching
 * upsmfUser.ts/bnrcUser.ts's original calls exactly.
 */
it('creates a user without a timeout option when timeoutMs is omitted', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { result: { userId: 'user-1' } } })
  const getOrgName = jest.fn(() => 'Some Org')

  const result = await createOrgSignupUser(
    { firstName: 'Jane', lastName: 'Doe', phone: 9876543210 },
    'upsmf',
    getOrgName
  )

  expect(result).toEqual({ message: 'success', userId: 'user-1' })
  expect(getOrgName).toHaveBeenCalled()
  const callArgs = mockAxiosCallable.mock.calls[0][0]
  expect(callArgs.timeout).toBeUndefined()
  expect(callArgs.data.request.channel).toBe('Some Org')
})

/**
 * @description Verifies createOrgSignupUser passes the given timeoutMs
 * through as the axios `timeout` option — matching mpNHMUser.ts's
 * 60-second-timeout call.
 */
it('creates a user with the given timeout option when timeoutMs is passed', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { result: { userId: 'user-1' } } })

  await createOrgSignupUser(
    { firstName: 'Jane', phone: 9876543210 },
    'MP',
    () => 'MP Org',
    60000
  )

  const callArgs = mockAxiosCallable.mock.calls[0][0]
  expect(callArgs.timeout).toBe(60000)
})

/**
 * @description Verifies assignOrgSignupUserRole omits the axios `timeout`
 * option when timeoutMs is not passed, and returns true on a SUCCESS
 * response.
 */
it('assigns a role without a timeout option when timeoutMs is omitted', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { result: { response: 'SUCCESS' } } })

  const result = await assignOrgSignupUserRole('user-1', { role: 'Student' }, () => 'org-1')

  expect(result).toBe(true)
  const callArgs = mockAxiosCallable.mock.calls[0][0]
  expect(callArgs.timeout).toBeUndefined()
  expect(callArgs.data.request.organisationId).toBe('org-1')
})

/**
 * @description Verifies assignOrgSignupUserRole passes the given timeoutMs
 * through as the axios `timeout` option.
 */
it('assigns a role with the given timeout option when timeoutMs is passed', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { result: { response: 'SUCCESS' } } })

  await assignOrgSignupUserRole('user-1', { role: 'Student' }, () => 'org-1', 60000)

  const callArgs = mockAxiosCallable.mock.calls[0][0]
  expect(callArgs.timeout).toBe(60000)
})

/**
 * @description Verifies assignOrgSignupUserRole returns false rather than
 * throwing when the role-assignment call rejects.
 */
it('returns false when role assignment rejects', async () => {
  mockAxiosCallable.mockRejectedValue(new Error('network down'))

  const result = await assignOrgSignupUserRole('user-1', { role: 'Student' }, () => 'org-1')

  expect(result).toBe(false)
})

/**
 * @description Verifies sendMsg91Otp calls the send endpoint with the
 * country-code-prefixed phone number and the configured template id.
 */
it('sends an OTP via the MSG91 send endpoint', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { type: 'success' } })

  await sendMsg91Otp('9876543210')

  expect(mockAxiosCallable).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'POST',
      params: { mobile: '+919876543210', template_id: 'template-1' },
      url: 'https://msg91.test/send',
    })
  )
})

/**
 * @description Verifies resendMsg91Otp calls the retry endpoint with the
 * country-code-prefixed phone number and retrytype: 'text'.
 */
it('resends an OTP via the MSG91 retry endpoint', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { type: 'success' } })

  await resendMsg91Otp('9876543210')

  expect(mockAxiosCallable).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'POST',
      params: { mobile: '+919876543210', retrytype: 'text' },
      url: 'https://msg91.test/retry',
    })
  )
})

/**
 * @description Verifies verifyMsg91Otp calls the verify endpoint with the
 * country-code-prefixed phone number and the given otp.
 */
it('verifies an OTP via the MSG91 verify endpoint', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { type: 'success' } })

  await verifyMsg91Otp('9876543210', '1234')

  expect(mockAxiosCallable).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'GET',
      params: { mobile: '+919876543210', otp: '1234' },
      url: 'https://msg91.test/verify',
    })
  )
})

function migratableUserDetails() {
  return {
    id: 'sunbird-id-1',
    profileDetails: {
      profileReq: {
        personalDetails: {} as { postalAddress?: string },
        professionalDetails: [{ designation: 'Old Designation' }],
      },
    },
    userId: 'user-1',
  }
}

/**
 * @description Verifies migrateOrgSignupUser builds the postal address from
 * the given stateLabel, resolves designation via getDesignation, and
 * returns true when the migration call reports success.
 */
it('migrates a user and returns true on a successful migration response', async () => {
  mockAxiosCallable
    .mockResolvedValueOnce({ data: { result: { response: 'success' } } })
    .mockResolvedValueOnce({ data: {} })
  const getOrgName = jest.fn(() => 'Some Org')
  const getDesignation = jest.fn(() => 'Nurse')

  const result = await migrateOrgSignupUser(
    migratableUserDetails(),
    { district: 'Lucknow', role: 'Faculty' },
    getOrgName,
    getDesignation,
    'Uttar Pradesh',
    'UPSMF'
  )

  expect(result).toBe(true)
  const migrateCallArgs = mockAxiosCallable.mock.calls[0][0]
  expect(migrateCallArgs.url).toBe('https://sunbird.test/user/v1/migrate')
  const profileUpdateCallArgs = mockAxiosCallable.mock.calls[1][0]
  expect(profileUpdateCallArgs.data.request.profileDetails.profileReq.personalDetails.postalAddress).toBe(
    'India, Uttar Pradesh, Lucknow'
  )
  expect(profileUpdateCallArgs.data.request.profileDetails.profileReq.professionalDetails[0].designation).toBe(
    'Nurse'
  )
})

/**
 * @description Verifies migrateOrgSignupUser builds an empty-state postal
 * address when stateLabel is '' — matching mpNHMUser.ts's original
 * `India, , ${district}` literal exactly.
 */
it('builds an empty-state postal address when stateLabel is an empty string', async () => {
  mockAxiosCallable
    .mockResolvedValueOnce({ data: { result: { response: 'success' } } })
    .mockResolvedValueOnce({ data: {} })

  await migrateOrgSignupUser(
    migratableUserDetails(),
    { district: 'Bhopal', role: 'Faculty' },
    () => 'MP Org',
    () => 'Nurse',
    '',
    'MP'
  )

  const profileUpdateCallArgs = mockAxiosCallable.mock.calls[1][0]
  expect(profileUpdateCallArgs.data.request.profileDetails.profileReq.personalDetails.postalAddress).toBe(
    'India, , Bhopal'
  )
})

/**
 * @description Verifies migrateOrgSignupUser returns false rather than
 * throwing when the migration call rejects, using orgLabel in the log
 * message (verified via the mocked logError call).
 */
it('returns false when the migration call rejects', async () => {
  mockAxiosCallable.mockRejectedValue(new Error('network down'))
  const { logError } = jest.requireMock('./logger')

  const result = await migrateOrgSignupUser(
    migratableUserDetails(),
    { district: 'Patna', role: 'Faculty' },
    () => 'BNRC Org',
    () => 'Nurse',
    'Bihar',
    'BNRC'
  )

  expect(result).toBe(false)
  expect(logError).toHaveBeenCalledWith('Error while migrating user to BNRC org', expect.any(String))
})

/**
 * Concurrency: these 7 functions are called from 3 different org-signup
 * route files simultaneously in production (e.g. an UPSMF and an MP-NHM
 * signup landing in the same event-loop tick). Since none of them hold any
 * module-level mutable state — every per-org value (orgLabel, timeoutMs,
 * getOrgName/getOrgId/getDesignation, stateLabel) is a parameter — there is
 * no shared state to race on. These tests prove that directly: interleaved
 * concurrent calls with DIFFERENT per-org config never cross-contaminate,
 * rather than just asserting it from reading the source.
 */
describe('concurrency — interleaved calls from different orgs never cross-contaminate', () => {
  /**
   * @description Fires 3 concurrent createOrgSignupUser calls (one per org,
   * each with its own orgLabel/timeoutMs/getOrgName), with axios responding
   * based on the request's own channel so a mixup would surface as a
   * mismatched userId. Also asserts each call's own timeout is independent.
   */
  it('createOrgSignupUser: concurrent calls for 3 orgs each get their own response and timeout', async () => {
    mockAxiosCallable.mockImplementation((config) => {
      const channel = config.data.request.channel
      const userIdByChannel = { 'BNRC Org': 'bnrc-user', 'MP Org': 'mp-user', 'UPSMF Org': 'upsmf-user' }
      return Promise.resolve({ data: { result: { userId: userIdByChannel[channel] } } })
    })

    const [upsmfResult, mpResult, bnrcResult] = await Promise.all([
      createOrgSignupUser({ firstName: 'A', phone: 1 }, 'upsmf', () => 'UPSMF Org'),
      createOrgSignupUser({ firstName: 'B', phone: 2 }, 'MP', () => 'MP Org', 60000),
      createOrgSignupUser({ firstName: 'C', phone: 3 }, 'bnrc', () => 'BNRC Org'),
    ])

    expect(upsmfResult).toEqual({ message: 'success', userId: 'upsmf-user' })
    expect(mpResult).toEqual({ message: 'success', userId: 'mp-user' })
    expect(bnrcResult).toEqual({ message: 'success', userId: 'bnrc-user' })

    const calls = mockAxiosCallable.mock.calls.map((c) => c[0])
    const upsmfCall = calls.find((c) => c.data.request.channel === 'UPSMF Org')
    const mpCall = calls.find((c) => c.data.request.channel === 'MP Org')
    const bnrcCall = calls.find((c) => c.data.request.channel === 'BNRC Org')
    expect(upsmfCall.timeout).toBeUndefined()
    expect(mpCall.timeout).toBe(60000)
    expect(bnrcCall.timeout).toBeUndefined()
  })

  /**
   * @description Fires 2 concurrent sendMsg91Otp calls for different phone
   * numbers and confirms each axios call carries its own phone, not the
   * other's — proves no shared/leaked request state between calls.
   */
  it('sendMsg91Otp: concurrent calls for different phones never mix up the mobile param', async () => {
    mockAxiosCallable.mockResolvedValue({ data: { type: 'success' } })

    await Promise.all([sendMsg91Otp('1111111111'), sendMsg91Otp('2222222222')])

    const calls = mockAxiosCallable.mock.calls.map((c) => c[0])
    expect(calls.some((c) => c.params.mobile === '+911111111111')).toBe(true)
    expect(calls.some((c) => c.params.mobile === '+912222222222')).toBe(true)
    expect(calls).toHaveLength(2)
  })

  /**
   * @description Fires 3 concurrent migrateOrgSignupUser calls (one per
   * org, each with its own stateLabel/orgLabel/getDesignation), with axios
   * responding based on the migrate call's own channel. Confirms each
   * org's profileUpdate call carries its OWN postal address and
   * designation, not another concurrently-running org's.
   */
  it('migrateOrgSignupUser: concurrent calls for 3 orgs each write their own postal address and designation', async () => {
    let migrateCallCount = 0
    mockAxiosCallable.mockImplementation((config) => {
      if (config.method === 'PATCH' && config.data.request.channel) {
        migrateCallCount++
        return Promise.resolve({ data: { result: { response: 'success' } } })
      }
      return Promise.resolve({ data: {} })
    })

    const results = await Promise.all([
      migrateOrgSignupUser(
        migratableUserDetails(),
        { district: 'Lucknow', role: 'Faculty' },
        () => 'UPSMF Org',
        () => 'UPSMF Designation',
        'Uttar Pradesh',
        'UPSMF'
      ),
      migrateOrgSignupUser(
        migratableUserDetails(),
        { district: 'Bhopal', role: 'Faculty' },
        () => 'MP Org',
        () => 'MP Designation',
        '',
        'MP'
      ),
      migrateOrgSignupUser(
        migratableUserDetails(),
        { district: 'Patna', role: 'Faculty' },
        () => 'BNRC Org',
        () => 'BNRC Designation',
        'Bihar',
        'BNRC'
      ),
    ])

    expect(results).toEqual([true, true, true])
    expect(migrateCallCount).toBe(3)

    const profileUpdateCalls = mockAxiosCallable.mock.calls
      .map((c) => c[0])
      .filter((c) => c.url === 'https://sunbird.test/user/private/v1/update')
    const postalAddresses = profileUpdateCalls.map(
      (c) => c.data.request.profileDetails.profileReq.personalDetails.postalAddress
    )
    const designations = profileUpdateCalls.map(
      (c) => c.data.request.profileDetails.profileReq.professionalDetails[0].designation
    )
    expect(postalAddresses).toContain('India, Uttar Pradesh, Lucknow')
    expect(postalAddresses).toContain('India, , Bhopal')
    expect(postalAddresses).toContain('India, Bihar, Patna')
    expect(designations).toContain('UPSMF Designation')
    expect(designations).toContain('MP Designation')
    expect(designations).toContain('BNRC Designation')
  })
})
