/**
 * PHASE 1 — user/auto-complete.ts.
 *
 * Two routes, two axios call shapes:
 *  - POST /department/:query: axios.post(), guarded by org+rootOrg header
 *    checks with a `return` after the 400 — safe to exercise live for the
 *    validation branches and the success path. BUT the catch block is
 *    `catch (err) { return err }` — no res.send/res.status at all. A rejected
 *    axios.post() therefore never sends a response, so the request hangs
 *    until the client/test times out. NOT exercised live here; see the
 *    it.skip below and the report back to the requester (candidate for
 *    docs/PROD-VERIFICATION.md, not edited by this file).
 *  - GET /:query: try/catch around the callable `axios({...})` form, guarded
 *    by the same org+rootOrg header check with a `return` after the 400 —
 *    safe. The catch's guard has a typo: `err && err.reponse && ...` (not
 *    `err.response`) for the body, so `err.reponse` is always undefined and
 *    the handler ALWAYS falls back to the generic
 *    `{ error: 'Failed due to unknown reason' }` body, even when the upstream
 *    sent a real error body. The status code itself (`err.response.status`)
 *    is read correctly since that guard has no typo. Not a hang/crash, so
 *    exercised live, asserting the actual (buggy) behaviour.
 */

jest.mock('axios')
jest.mock('../../utils/requestExtract', () => ({
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    KONG_API_BASE: 'https://kong.test',
    SB_API_KEY: 'api-key-1',
    USER_PROFILE_API_BASE: 'https://user-profile.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { autocompleteApi } from './auto-complete'

const mockAxiosMethods = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(autocompleteApi)
const withOrgHeaders = (req: ReturnType<typeof agent>) =>
  req.set('org', 'o1').set('rootOrg', 'r1')

beforeEach(() => {
  mockAxiosMethods.post.mockReset()
  mockAxiosCallable.mockReset()
})

/**
 * @description Verifies the POST /department/:query route rejects requests
 * missing either the org or rootOrg header and forwards the upstream
 * response on success; the hang-prone failure path is documented via a
 * skipped test rather than exercised live.
 */
describe('POST /department/:query', () => {
  it('should reject a request missing the org header', async () => {
    const response = await agent()
      .post('/department/dept1')
      .set('rootOrg', 'r1')
      .send({})
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should reject a request missing the rootOrg header', async () => {
    const response = await agent()
      .post('/department/dept1')
      .set('org', 'o1')
      .send({})
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should submit the department search and forward the upstream response', async () => {
    mockAxiosMethods.post.mockResolvedValue(upstreamOk({ users: ['u1', 'u2'] }))
    const response = await withOrgHeaders(agent().post('/department/dept1')).send({
      searchItem: 'foo',
    })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ users: ['u1', 'u2'] })
  })

  // NOT exercised live: the catch block is `catch (err) { return err }` with
  // no res.send/res.status — a rejected axios.post() never sends a response,
  // so the request hangs (Pattern B, zero response) rather than failing
  // fast. Reporting this back instead of reproducing it live.
  it.skip('should skip the failure path — catch block never sends a response (would hang)', () => {
    return
  })
})

/**
 * @description Verifies the GET /:query route rejects requests missing
 * either the org or rootOrg header, returns the upstream autocomplete
 * results on success, and — due to the `err.reponse` typo in the source —
 * always falls back to the generic error body on any upstream or network
 * failure.
 */
describe('GET /:query', () => {
  it('should reject a request missing the org header', async () => {
    const response = await agent().get('/q1').set('rootOrg', 'r1')
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should reject a request missing the rootOrg header', async () => {
    const response = await agent().get('/q1').set('org', 'o1')
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should return the autocomplete results for the caller', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ users: ['u1'] }))
    const response = await withOrgHeaders(agent().get('/q1'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ users: ['u1'] })
  })

  it('should fall back to the generic body (not the upstream data) on an upstream error, due to the err.reponse typo', async () => {
    mockAxiosCallable.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await withOrgHeaders(agent().get('/q1'))
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })

  it('should return 500 with the generic body on a network failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await withOrgHeaders(agent().get('/q1'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
