/**
 * PHASE 1 — user/validate.ts.
 *
 * One route: GET '/'. Builds a body from three extract helpers
 * (extractUserEmailFromRequest, extractUserNameFromRequest,
 * extractUserIdFromRequest), each with an `|| 'default'` fallback, then calls
 * logInfo() and res.send(body). No axios call, no validation branch to gate
 * access, and — notably — NO try/catch anywhere in the handler.
 *
 * SKIPPED LIVE (real bug, not reproduced against a live HTTP response) —
 * Pattern E, flagged URGENT/CRITICAL: the three extract calls happen with no
 * surrounding try/catch, inside an `async (req, res) => { ... }` handler. In
 * production these helpers only ever optional-chain off `req.kauth` and can't
 * throw, so this is latent rather than currently triggered. But it only takes
 * one of them throwing (e.g. a future refactor, or a caller with a malformed
 * req) to turn into an unhandled promise rejection with res.send() never
 * called — the request hangs with zero response (Pattern B), and depending on
 * Node's unhandledRejection policy can crash the whole process. Reproducing
 * that live in this suite (e.g. `mockExtractUserEmailFromRequest.mockImplementation(() => {
 * throw new Error('boom') })`) would hang the Jest worker, so it is
 * deliberately NOT exercised below. See the "real bugs found" note in the
 * test report for MUST VERIFY IN PROD detail.
 */

jest.mock('../../utils/logger', () => ({ logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserEmailFromRequest: jest.fn(),
  extractUserIdFromRequest: jest.fn(),
  extractUserNameFromRequest: jest.fn(),
}))

import { mountRouter } from '../../test-support/mountRouter'
import { validateApi } from './validate'
import {
  extractUserEmailFromRequest,
  extractUserIdFromRequest,
  extractUserNameFromRequest,
} from '../../utils/requestExtract'

const mockExtractUserEmailFromRequest = extractUserEmailFromRequest as jest.Mock
const mockExtractUserIdFromRequest = extractUserIdFromRequest as jest.Mock
const mockExtractUserNameFromRequest = extractUserNameFromRequest as jest.Mock
const agent = () => mountRouter(validateApi)

beforeEach(() => {
  mockExtractUserEmailFromRequest.mockReset()
  mockExtractUserIdFromRequest.mockReset()
  mockExtractUserNameFromRequest.mockReset()
})

/**
 * @description Verifies the GET / route echoes back the email, name and
 * userId derived from the request when the extract helpers return real
 * values, and falls back to the hardcoded demo defaults for whichever
 * helper(s) return a falsy value (undefined, null, or empty string).
 */
describe('GET /', () => {
  it('should return the email, name and userId from the extract helpers when all are present', async () => {
    mockExtractUserEmailFromRequest.mockReturnValue('real.user@example.com')
    mockExtractUserNameFromRequest.mockReturnValue('Real User')
    mockExtractUserIdFromRequest.mockReturnValue('user-123')

    const response = await agent().get('/')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      email: 'real.user@example.com',
      name: 'Real User',
      userId: 'user-123',
    })
  })

  it('should fall back to the demo defaults when all extract helpers return undefined', async () => {
    mockExtractUserEmailFromRequest.mockReturnValue(undefined)
    mockExtractUserNameFromRequest.mockReturnValue(undefined)
    mockExtractUserIdFromRequest.mockReturnValue(undefined)

    const response = await agent().get('/')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      email: 'user@demo.com',
      name: 'demo user',
      userId: 'user@demo.com',
    })
  })

  it('should fall back per-field when only some extract helpers return a falsy value', async () => {
    mockExtractUserEmailFromRequest.mockReturnValue('real.user@example.com')
    mockExtractUserNameFromRequest.mockReturnValue('')
    mockExtractUserIdFromRequest.mockReturnValue(null)

    const response = await agent().get('/')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      email: 'real.user@example.com',
      name: 'demo user',
      userId: 'user@demo.com',
    })
  })
})
