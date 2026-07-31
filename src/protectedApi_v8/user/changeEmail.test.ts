/**
 * PHASE 1 — user/changeEmail.ts.
 *
 * One route: PUT /:metaType. userId comes from extractUserIdFromRequest(req)
 * (mocked below to a fixed value — the handler never validates that the
 * caller is only changing their OWN email, but that is a pre-existing
 * identity-check gap in extractUserIdFromRequest itself, not something this
 * 30-line file re-implements or bypasses, so it is out of scope here). No
 * rootOrg/header validation branch exists — the only branch is the
 * try/catch around the single axios.put() call.
 *
 * SKIPPED LIVE (real bug, not reproduced against a live HTTP response):
 * the catch block is
 *   res.status((err && err.response && err.response.status) || 500).send(err.response.data)
 * — `err.response.status` is guarded, but `err.response.data` on the
 * `.send(...)` call is NOT. When axios rejects with no `.response` (a
 * network-level failure, e.g. `networkError()`), evaluating `err.response.data`
 * throws `TypeError: Cannot read properties of undefined (reading 'data')`
 * before `.send()` is ever invoked. That throw escapes the catch block of an
 * async Express handler with no outer guard, becoming an unhandled promise
 * rejection — the request never gets a response (hangs) and, depending on
 * Node's unhandledRejection policy, can crash the whole process. This is the
 * same unguarded-property-on-error shape called out as unsafe to reproduce
 * live. See the "real bugs found" note in the test report for file/line and
 * MUST VERIFY IN PROD detail. Only `upstreamError()` (which carries a
 * `.response`) is used below for the failure-path test; a network-error case
 * is deliberately not exercised.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    USER_PROFILE_API_BASE: 'https://user-profile.test',
  },
}))

import axios from 'axios'
import { upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { changeEmailApi } from './changeEmail'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(changeEmailApi)

beforeEach(() => {
  mockAxios.put.mockReset()
})

/**
 * @description Verifies the PUT /:metaType route forwards metaTypeData and
 * rootOrg from the request body to the upstream user-profile API and relays
 * the upstream response body and status on success, and forwards the
 * upstream status/body on failure (a network failure with no `.response` is
 * intentionally not exercised live — see file header).
 */
describe('PUT /:metaType', () => {
  it('should update the email and return the upstream response body on success', async () => {
    mockAxios.put.mockResolvedValue(upstreamOk({ status: 'SUCCESS' }))
    const response = await agent()
      .put('/email')
      .send({ metaTypeData: 'new@example.com', rootOrg: 'r1' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'SUCCESS' })
  })

  it('should forward the metaType route param in the upstream URL', async () => {
    mockAxios.put.mockResolvedValue(upstreamOk({ status: 'SUCCESS' }))
    await agent()
      .put('/phone')
      .send({ metaTypeData: '1234567890', rootOrg: 'r1' })
    expect(mockAxios.put).toHaveBeenCalledWith(
      'https://user-profile.test/user/user-1/phone',
      { metaTypeData: '1234567890', rootOrg: 'r1' },
      expect.objectContaining({ headers: { 'content-Type': 'application/json' } })
    )
  })

  it('should always respond 200 via res.json regardless of the upstream response status', async () => {
    // res.json(response.data) never forwards response.status, unlike the
    // failure branch below which does forward err.response.status.
    mockAxios.put.mockResolvedValue(upstreamOk({ status: 'ACCEPTED' }, 202))
    const response = await agent()
      .put('/email')
      .send({ metaTypeData: 'new@example.com', rootOrg: 'r1' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ACCEPTED' })
  })

  it('should forward the upstream status and body when the update fails', async () => {
    mockAxios.put.mockRejectedValue(upstreamError(422, { error: 'invalid email' }))
    const response = await agent()
      .put('/email')
      .send({ metaTypeData: 'not-an-email', rootOrg: 'r1' })
    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'invalid email' })
  })

  it('should fall back to 500 when the upstream error carries a falsy status', async () => {
    // Exercises the `|| 500` branch: err.response exists (so err.response.data
    // is safe to read), but err.response.status is falsy, so the guarded
    // expression short-circuits to the 500 fallback.
    const err = upstreamError(502, { error: 'weird upstream status' })
    // tslint:disable-next-line: no-any
    ;(err as any).response.status = 0
    mockAxios.put.mockRejectedValue(err)
    const response = await agent()
      .put('/email')
      .send({ metaTypeData: 'dup@example.com', rootOrg: 'r1' })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'weird upstream status' })
  })
})
