/**
 * cohorts.ts — three routes over two axios call shapes:
 * the callable `axios({...})` form (GET /:cohortType/:contentId, non-authors
 * branch) and the `axios.get`/`axios.post` form (authors branch via
 * getAuthorsDetails, GET /:groupId, GET /user/autoenrollment/:courseId).
 *
 * extractUserIdFromRequest is mocked wholesale rather than exercised for
 * real: its fallback path reads req.session.userId, and mountRouter() does
 * not install session middleware by default, so calling the real
 * implementation here would throw on req.session being undefined. That
 * throw is actually caught by the route's own try/catch (see cohorts.ts
 * line 64), so it isn't a live-test safety hazard — it's just irrelevant to
 * this file's behaviour, so it's mocked out like the sibling
 * recommendation.test.ts / leaderboard.test.ts do.
 *
 * Route registration order note: '/:cohortType/:contentId' (2 segments),
 * '/:groupId' (1 segment) and '/user/autoenrollment/:courseId' (3 segments)
 * never overlap in path-segment count, so there is no shadowing risk between
 * them despite being registered as sibling routes on the same router.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    COHORTS_API_BASE: 'https://cohorts.test',
    KNOWLEDGE_MW_API_BASE: 'https://knowledge.test',
    NETWORK_HUB_SERVICE_BACKEND: 'https://networkhub.test',
    TIMEOUT: '10000',
    USER_PROFILE_API_BASE: 'https://userprofile.test',
  },
}))

import axios from 'axios'
import { cohortsApi } from './cohorts'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(cohortsApi)

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

const profile = {
  id: 'author1',
  personalDetails: {
    firstname: 'John',
    middlename: 'Doe',
    mobile: 9999999999,
    primaryEmail: 'john@test.com',
  },
  professionalDetails: [{ designation: 'SWE', name: 'Engineering' }],
}

const expectedCohortsUser = {
  city: '',
  department: 'Engineering',
  desc: '',
  designation: 'SWE',
  email: 'john@test.com',
  first_name: 'John',
  last_name: 'Doe',
  phone_No: 9999999999,
  userLocation: '',
  user_id: 'author1',
}

describe('GET /:cohortType/:contentId', () => {
  it('rejects an unrecognised cohort type', async () => {
    const response = await agent()
      .get('/not-a-real-type/course1')
      .set('org', 'o1')
      .set('rootOrg', 'r1')

    expect(response.status).toBe(400)
    expect(response.text).toBe('INVALID_COHORT_TYPE')
  })

  it('rejects a request missing org/rootOrg headers', async () => {
    const response = await agent().get('/activeusers/course1')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  describe('authors cohort type', () => {
    it('returns the transformed author list on success', async () => {
      mockAxios.get.mockResolvedValue(
        upstreamOk({
          result: {
            content: {
              creatorDetails: '[{"id":"author1"}]',
            },
          },
        })
      )
      mockAxios.post.mockResolvedValue(
        upstreamOk({ result: { UserProfile: [profile] } })
      )

      const response = await agent()
        .get('/authors/course1')
        .set('org', 'o1')
        .set('rootOrg', 'r1')
        .set('Authorization', 'Bearer token')

      expect(response.status).toBe(200)
      expect(response.body).toEqual([expectedCohortsUser])
    })

    it('returns an empty list when the hierarchy response has no content', async () => {
      mockAxios.get.mockResolvedValue(upstreamOk({ result: {} }))
      mockAxios.post.mockResolvedValue(upstreamOk({ result: {} }))

      const response = await agent()
        .get('/authors/course1')
        .set('org', 'o1')
        .set('rootOrg', 'r1')

      expect(response.status).toBe(200)
      expect(response.body).toEqual([])
    })

    it('returns false when the hierarchy lookup fails (swallowed internally)', async () => {
      // getAuthorsDetails wraps both its axios calls in a try/catch that logs
      // and returns `false` rather than throwing, so the route always
      // responds 200 here — even on upstream failure. Documenting current
      // behaviour, not asserting it's ideal.
      mockAxios.get.mockRejectedValue(networkError())

      const response = await agent()
        .get('/authors/course1')
        .set('org', 'o1')
        .set('rootOrg', 'r1')

      expect(response.status).toBe(200)
      expect(response.body).toBe(false)
    })
  })

  describe('other cohort types (proxy)', () => {
    it('forwards the upstream status and body on success', async () => {
      mockAxiosCallable.mockResolvedValue(upstreamOk({ users: ['u1'] }))

      const response = await agent()
        .get('/activeusers/course1')
        .set('org', 'o1')
        .set('rootOrg', 'r1')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ users: ['u1'] })
    })

    it('forwards an upstream error status and body', async () => {
      mockAxiosCallable.mockRejectedValue(upstreamError(404, { error: 'not found' }))

      const response = await agent()
        .get('/commongoals/course1')
        .set('org', 'o1')
        .set('rootOrg', 'r1')

      expect(response.status).toBe(404)
      expect(response.body).toEqual({ error: 'not found' })
    })

    it('falls back to 500 on a transport failure', async () => {
      mockAxiosCallable.mockRejectedValue(networkError())

      const response = await agent()
        .get('/educators/course1')
        .set('org', 'o1')
        .set('rootOrg', 'r1')

      expect(response.status).toBe(500)
      expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
    })
  })
})

describe('GET /:groupId', () => {
  it('rejects a request missing org/rootOrg headers', async () => {
    const response = await agent().get('/42')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('forwards the upstream status and body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'u1' }]))

    const response = await agent().get('/42').set('org', 'o1').set('rootOrg', 'r1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'u1' }])
  })

  it('requests the configured group-users endpoint (documents the trailing space in the URL)', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))

    await agent().get('/42').set('org', 'o1').set('rootOrg', 'r1')

    // Note the trailing space baked into API_END_POINTS.groupCohorts in
    // cohorts.ts — likely an accidental extra space in the template
    // literal. Documented here, not fixed (out of scope for this pass).
    expect(mockAxios.get).toHaveBeenCalledWith('https://userprofile.test/groups/42/users ')
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(403, { error: 'forbidden' }))

    const response = await agent().get('/42').set('org', 'o1').set('rootOrg', 'r1')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'forbidden' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent().get('/42').set('org', 'o1').set('rootOrg', 'r1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /user/autoenrollment/:courseId', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ enrolled: true }))

    const response = await agent()
      .get('/user/autoenrollment/course1')
      .set('wid', 'user-1')
      .set('rootOrg', 'r1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ enrolled: true })
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(409, { error: 'conflict' }))

    const response = await agent()
      .get('/user/autoenrollment/course1')
      .set('wid', 'user-1')
      .set('rootOrg', 'r1')

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent()
      .get('/user/autoenrollment/course1')
      .set('wid', 'user-1')
      .set('rootOrg', 'r1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
