/**
 * fetchUserBymobileorEmail — shared user-exists lookup, called by 10 route
 * files as of CHANGE 29 (signupWithAutoLogin.ts / signupWithAutoLoginV2.ts /
 * appSignUpWithAutoLogin.ts / emailOrMobileLoginSignIn.ts / tnaiAuth.ts /
 * tnnmcAuth.ts / tnnmcAuthV2.ts / sashaktAuth.ts / maternityFoundationAuth.ts /
 * signupWithAutoLoginOrgForm.ts). Had no direct test file before — only
 * indirect coverage through each caller's own route tests. Exercised
 * directly here.
 */

jest.mock('axios')
jest.mock('./logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('./env', () => ({
  CONSTANTS: { KONG_API_BASE: 'https://kong.test', SB_API_KEY: 'sb-api-key-test' },
}))

import axios from 'axios'
import { fetchUserBymobileorEmail } from './fetchUserExists'

const mockAxiosCallable = axios as unknown as jest.Mock

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

/**
 * @description Verifies an email search hits the email-exists endpoint and
 * returns the upstream's exists flag on a successful OK response.
 */
it('returns true when an email search finds an existing user', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { responseCode: 'OK', result: { exists: true } } })

  const result = await fetchUserBymobileorEmail('jane@example.com', 'email')

  expect(result).toBe(true)
  expect(mockAxiosCallable).toHaveBeenCalledWith(
    expect.objectContaining({ url: 'https://kong.test/user/v1/exists/email/jane@example.com' })
  )
})

/**
 * @description Verifies a phone search (any searchType other than 'email')
 * hits the phone-exists endpoint.
 */
it('returns false when a phone search finds no existing user', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { responseCode: 'OK', result: { exists: false } } })

  const result = await fetchUserBymobileorEmail('9876543210', 'phone')

  expect(result).toBe(false)
  expect(mockAxiosCallable).toHaveBeenCalledWith(
    expect.objectContaining({ url: 'https://kong.test/user/v1/exists/phone/9876543210' })
  )
})

/**
 * @description Verifies a non-OK responseCode returns undefined (no
 * explicit return in that branch) rather than throwing.
 */
it('returns undefined when the upstream responseCode is not OK', async () => {
  mockAxiosCallable.mockResolvedValue({ data: { responseCode: 'CLIENT_ERROR' } })

  const result = await fetchUserBymobileorEmail('jane@example.com', 'email')

  expect(result).toBeUndefined()
})

/**
 * @description Verifies a rejected upstream call returns undefined rather
 * than throwing, matching every caller's fire-and-forget usage pattern.
 */
it('returns undefined when the lookup call rejects', async () => {
  mockAxiosCallable.mockRejectedValue(new Error('network down'))

  const result = await fetchUserBymobileorEmail('jane@example.com', 'email')

  expect(result).toBeUndefined()
})

/**
 * @description Concurrency: this function is called from 10 different
 * route files, several of which can legitimately fire two lookups in the
 * same request (email AND phone) or receive overlapping requests from
 * different orgs at the same time. Fires 4 concurrent lookups — 2 emails,
 * 2 phones, each for a different value — with axios routing its response
 * by the requested URL, and confirms each call's result is paired with its
 * OWN search value, never another concurrent call's.
 */
it('concurrent lookups for different values never cross-pair results', async () => {
  mockAxiosCallable.mockImplementation((config) => {
    const existsByUrl = {
      'https://kong.test/user/v1/exists/email/exists@example.com': true,
      'https://kong.test/user/v1/exists/email/notfound@example.com': false,
      'https://kong.test/user/v1/exists/phone/1111111111': true,
      'https://kong.test/user/v1/exists/phone/2222222222': false,
    }
    return Promise.resolve({ data: { responseCode: 'OK', result: { exists: existsByUrl[config.url] } } })
  })

  const [existsEmail, notFoundEmail, existsPhone, notFoundPhone] = await Promise.all([
    fetchUserBymobileorEmail('exists@example.com', 'email'),
    fetchUserBymobileorEmail('notfound@example.com', 'email'),
    fetchUserBymobileorEmail('1111111111', 'phone'),
    fetchUserBymobileorEmail('2222222222', 'phone'),
  ])

  expect(existsEmail).toBe(true)
  expect(notFoundEmail).toBe(false)
  expect(existsPhone).toBe(true)
  expect(notFoundPhone).toBe(false)
})
