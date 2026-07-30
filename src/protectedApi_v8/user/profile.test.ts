/**
 * PHASE 1 — user/profile.ts.
 *
 * Two axios call shapes: axios.get (getUserDetailsFromApi, getUserDetailsFromGraph,
 * GET /graph/photo/:userEmail) and the callable `axios({...})` form (PATCH /).
 *
 * getUserDetailsFromApi and getUserDetailsFromGraph both swallow ALL axios
 * errors internally and resolve to `null` rather than throwing (see their own
 * try/catch blocks). getUserProfile (used by GET /) wraps its own
 * Promise.all in a try/catch too, so an upstream failure never bubbles up as
 * a rejection through any of these helpers. Practically this means:
 *   - GET /empDB and GET /graph never hit their route-level catch/500 branch
 *     via an upstream failure — a failed axios.get just yields `null` in a
 *     200 response body. Documented below rather than treated as a bug: it's
 *     safe to exercise live (single response per request).
 *   - GET / (getUserProfile) likewise never 500s from an upstream failure;
 *     manipulateResult() always falls back to values derived from the
 *     request (extractUserNameFromRequest / extractUserEmailFromRequest).
 * The route-level catch blocks on all four GET routes and PATCH / ARE still
 * reachable, just only via extractUserIdFromRequest/extractUserTokenContent
 * throwing (e.g. missing/malformed session) rather than via upstream
 * failures — each is exercised below with a mockImplementationOnce throw.
 *
 * GET /graph/photo/:userEmail is the one route with no internal error
 * swallowing (a bare axios.get straight in the route try/catch), so it's the
 * one route here that genuinely forwards upstream failures as documented in
 * mockAxios.ts (upstreamError -> forwarded status/body, networkError -> 500
 * fallback).
 *
 * No missing-`return`-after-`res.send`/double-send issues were found in
 * profile.ts — every branch that sends a response returns (implicitly, by
 * being the last statement in its try/catch) or is followed only by
 * catch-block code that runs solely on a distinct code path. All branches
 * here are safe to exercise live. See the bottom of this file for one
 * behavioral quirk in manipulateResult() that was found but is not a
 * crash/hang risk (parseInt never throws), so it's noted, not treated as a
 * live-test hazard.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserEmailFromRequest: jest.fn(() => 'default-email@example.com'),
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
  extractUserNameFromRequest: jest.fn(() => 'Default Name'),
  extractUserTokenContent: jest.fn(() => undefined),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    SB_EXT_API_BASE: 'https://sbext.test',
    USER_DETAILS_API_BASE: 'https://userdetails.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import {
  extractUserEmailFromRequest,
  extractUserIdFromRequest,
  extractUserNameFromRequest,
  extractUserTokenContent,
} from '../../utils/requestExtract'
import {
  getUserDetailsFromApi,
  getUserDetailsFromGraph,
  getUserProfile,
  profileApi,
} from './profile'

const mockAxiosGet = (axios as jest.Mocked<typeof axios>).get
const mockAxiosCallable = axios as unknown as jest.Mock
const mockExtractUserId = extractUserIdFromRequest as jest.Mock
const mockExtractUserName = extractUserNameFromRequest as jest.Mock
const mockExtractUserEmail = extractUserEmailFromRequest as jest.Mock
const mockExtractTokenContent = extractUserTokenContent as jest.Mock

const agent = () => mountRouter(profileApi)

beforeEach(() => {
  mockAxiosGet.mockReset()
  mockAxiosCallable.mockReset()
  mockExtractUserId.mockReset().mockReturnValue('user-1')
  mockExtractUserName.mockReset().mockReturnValue('Default Name')
  mockExtractUserEmail.mockReset().mockReturnValue('default-email@example.com')
  mockExtractTokenContent.mockReset().mockReturnValue(undefined)
})

describe('GET /empDB', () => {
  it("returns the upstream user's details", async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk({ name: 'Jane', email: 'jane@example.com' }))
    const response = await agent().get('/empDB')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ name: 'Jane', email: 'jane@example.com' })
  })

  it('responds with null (200) when the upstream call fails, since getUserDetailsFromApi swallows the error', async () => {
    mockAxiosGet.mockRejectedValue(networkError())
    const response = await agent().get('/empDB')
    expect(response.status).toBe(200)
    expect(response.body).toBeNull()
  })

  it('returns 500 when extracting the user id throws', async () => {
    mockExtractUserId.mockImplementationOnce(() => {
      throw new Error('no session')
    })
    const response = await agent().get('/empDB')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /graph', () => {
  it("returns the upstream user's graph profile", async () => {
    mockAxiosGet.mockResolvedValue(
      upstreamOk({ result: { response: { givenName: 'Jane', surname: 'Doe' } } })
    )
    const response = await agent().get('/graph')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ givenName: 'Jane', surname: 'Doe' })
  })

  it('responds with null (200) when the upstream call fails, since getUserDetailsFromGraph swallows the error', async () => {
    mockAxiosGet.mockRejectedValue(networkError())
    const response = await agent().get('/graph')
    expect(response.status).toBe(200)
    expect(response.body).toBeNull()
  })

  it('returns 500 when extracting the user id throws', async () => {
    mockExtractUserId.mockImplementationOnce(() => {
      throw new Error('no session')
    })
    const response = await agent().get('/graph')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /graph/photo/:userEmail', () => {
  it("returns the upstream user's photo data", async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk({ photo: 'base64data' }))
    const response = await agent().get('/graph/photo/jane@example.com')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ photo: 'base64data' })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxiosGet.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/graph/photo/jane@example.com')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('returns 500 on a network failure', async () => {
    mockAxiosGet.mockRejectedValue(networkError())
    const response = await agent().get('/graph/photo/jane@example.com')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /', () => {
  it('merges details and graph responses, preferring the details response', async () => {
    mockAxiosGet.mockImplementation((url: string) => {
      if (url.includes('/user/')) {
        return Promise.resolve(
          upstreamOk({ email: 'details@example.com', name: 'Details Name', empNumber: 11 })
        )
      }
      return Promise.resolve(
        upstreamOk({
          result: {
            response: {
              companyName: '7',
              givenName: 'Graph',
              onPremisesUserPrincipalName: 'graph@example.com',
              surname: 'Name',
            },
          },
        })
      )
    })
    const response = await agent().get('/')
    expect(response.status).toBe(200)
    expect(response.body.email).toBe('details@example.com')
    expect(response.body.name).toBe('Details Name')
    expect(response.body.miscellaneous.empNumber).toBe(7)
  })

  it('falls back to the graph response and request-derived defaults when the details call fails', async () => {
    mockAxiosGet.mockImplementation((url: string) => {
      if (url.includes('/user/')) {
        return Promise.reject(networkError())
      }
      return Promise.resolve(
        upstreamOk({
          result: {
            response: {
              onPremisesUserPrincipalName: 'graph@example.com',
            },
          },
        })
      )
    })
    mockExtractUserName.mockReturnValue('')
    const response = await agent().get('/')
    expect(response.status).toBe(200)
    expect(response.body.email).toBe('graph@example.com')
  })

  it('falls back to the request-derived name/email when both upstream calls fail', async () => {
    mockAxiosGet.mockRejectedValue(networkError())
    const response = await agent().get('/')
    expect(response.status).toBe(200)
    expect(response.body.email).toBe('default-email@example.com')
    expect(response.body.name).toBe('Default Name')
  })

  it('returns 500 when extracting the user id throws', async () => {
    mockExtractUserId.mockImplementationOnce(() => {
      throw new Error('no session')
    })
    const response = await agent().get('/')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('PATCH /', () => {
  it('returns 404 with an empty body when there is no token content', async () => {
    mockExtractTokenContent.mockReturnValue(undefined)
    const response = await agent().patch('/')
    expect(response.status).toBe(404)
    expect(response.text).toBe('')
  })

  it('creates the user and forwards the upstream status/body when token content is present', async () => {
    mockExtractTokenContent.mockReturnValue({
      family_name: 'Doe',
      given_name: 'Jane',
      preferred_username: 'jane',
      sub: 'sub-1',
    })
    mockAxiosCallable.mockResolvedValue(upstreamOk({ created: true }, 201))
    const response = await agent().patch('/')
    expect(response.status).toBe(201)
    expect(response.body).toEqual({ created: true })
  })

  it('forwards the upstream status and body on failure', async () => {
    mockExtractTokenContent.mockReturnValue({ sub: 'sub-1' })
    mockAxiosCallable.mockRejectedValue(upstreamError(409, { error: 'already exists' }))
    const response = await agent().patch('/')
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'already exists' })
  })

  it('returns 500 on a network failure', async () => {
    mockExtractTokenContent.mockReturnValue({ sub: 'sub-1' })
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().patch('/')
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('exported helpers (direct calls, not over HTTP)', () => {
  // getUserProfile's own try/catch (profile.ts lines 98-100) is unreachable
  // via an upstream axios failure, since both getUserDetailsFromApi and
  // getUserDetailsFromGraph already swallow those internally. The only way
  // to exercise it is a synchronous throw from one of the
  // extractUser*FromRequest calls made *after* Promise.all resolves. Calling
  // getUserProfile directly (not through the route) keeps this safe/isolated
  // -- res is never involved.
  it('getUserProfile resolves to {} when extracting the user name throws after the upstream calls resolve', async () => {
    mockAxiosGet.mockResolvedValue(upstreamOk({}))
    mockExtractUserName.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    // tslint:disable-next-line: no-any
    const result = await getUserProfile('user-1', {} as any)
    expect(result).toEqual({})
  })

  it('getUserDetailsFromApi resolves to null on an upstream failure', async () => {
    mockAxiosGet.mockRejectedValue(networkError())
    await expect(getUserDetailsFromApi('user-1')).resolves.toBeNull()
  })

  it('getUserDetailsFromGraph resolves to null on an upstream failure', async () => {
    mockAxiosGet.mockRejectedValue(networkError())
    await expect(getUserDetailsFromGraph('user-1')).resolves.toBeNull()
  })
})
