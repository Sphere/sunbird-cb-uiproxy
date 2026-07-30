/**
 * PHASE 1 — user/follow.ts.
 *
 * All routes are one-shot axios-proxy endpoints, most guarded by a
 * rootOrg/org header check before forwarding to a fixed NODE_API_BASE path.
 * extractUserIdFromRequest is mocked wholesale (it reads req.session.userId
 * when no wid header is present, and this file never sets up session
 * middleware).
 *
 * NOTE on GET /followers/:targetId (follow.ts lines 47-52): the handler does
 *   if (!targetId) { res.status(400).send() }
 * with NO `return`, so execution would fall through into the axios.get call
 * and could send a second response (ERR_HTTP_HEADERS_SENT). This is not
 * exercised live here because it is unreachable via real HTTP: Express's
 * :targetId param matcher requires at least one non-slash character, so no
 * request can actually reach this handler with a falsy targetId. Flagged for
 * the shared PROD-VERIFICATION doc rather than fixed or reproduced live.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: { NODE_API_BASE: 'https://node-api.test' },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { followApi } from './follow'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(followApi)
const withOrg = (req: ReturnType<typeof agent>) => req.set('rootOrg', 'r1').set('org', 'o1')

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

describe('POST /fetchAll', () => {
  it('forwards the request and returns the upstream status/body', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ items: [{ id: 'u1' }] }, 200))
    const response = await withOrg(agent().post('/fetchAll')).send({ page: 1 })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ items: [{ id: 'u1' }] })
  })

  it('rejects a request missing rootOrg/org headers', async () => {
    const response = await agent().post('/fetchAll').send({})
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('forwards the upstream error status/body on failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await withOrg(agent().post('/fetchAll')).send({})
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('returns 500 on a network failure with no upstream response', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/fetchAll')).send({})
    expect(response.status).toBe(500)
  })
})

describe('GET /followers/:targetId', () => {
  // See file-level note: the `if (!targetId)` branch here has no `return`
  // after res.status(400).send(), but it is unreachable via real routing
  // (Express requires a non-empty :targetId segment to match at all), so
  // only the reachable success/failure paths are tested live.

  it('returns the followers for the target user', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'f1' }]))
    const response = await agent().get('/followers/target-1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'f1' }])
  })

  it('returns 500 on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/followers/target-1')
    expect(response.status).toBe(500)
  })

  it('forwards the upstream error status/body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await agent().get('/followers/target-1')
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })
})

describe('GET /following/:type', () => {
  it('returns the users the caller is following, by type', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([{ id: 'u2' }]))
    const response = await withOrg(agent().get('/following/user'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'u2' }])
  })

  it('rejects a request missing rootOrg/org headers', async () => {
    const response = await agent().get('/following/user')
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('returns 500 on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/following/user'))
    expect(response.status).toBe(500)
  })
})

describe('GET /getFollowing', () => {
  it('returns following list using the token user id', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([{ id: 'u3' }]))
    const response = await withOrg(agent().get('/getFollowing')).query({ type: 'user' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'u3' }])
  })

  it('uses an explicit wid query param over the session/token user id', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([]))
    const response = await withOrg(agent().get('/getFollowing')).query({ type: 'user', wid: 'other-user' })
    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ userid: 'other-user' }),
      expect.anything()
    )
  })

  it('rejects a request missing rootOrg/org headers', async () => {
    const response = await agent().get('/getFollowing').query({ type: 'user' })
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('returns 500 on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().get('/getFollowing')).query({ type: 'user' })
    expect(response.status).toBe(500)
  })
})

describe('POST /getFollowingv3', () => {
  it('forwards to the intranet/standalone-aware endpoint', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([{ id: 'u4' }]))
    const response = await withOrg(agent().post('/getFollowingv3'))
      .query({ isIntranet: 'true', isStandAlone: 'false' })
      .send({ page: 1 })
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'u4' }])
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://node-api.test/getfollowingv3?isIntranet=true&isStandAlone=false',
      expect.anything(),
      expect.anything()
    )
  })

  it('rejects a request missing rootOrg/org headers', async () => {
    const response = await agent().post('/getFollowingv3').send({})
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('returns 500 on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/getFollowingv3')).send({})
    expect(response.status).toBe(500)
  })
})

describe('POST /getFollowersv3', () => {
  it('forwards to the v3 followers endpoint', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([{ id: 'f2' }]))
    const response = await withOrg(agent().post('/getFollowersv3')).send({ page: 1 })
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'f2' }])
  })

  it('rejects a request missing rootOrg/org headers', async () => {
    const response = await agent().post('/getFollowersv3').send({})
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('returns 500 on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/getFollowersv3')).send({})
    expect(response.status).toBe(500)
  })
})

describe('POST /', () => {
  it('follows the target user', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ followed: true }, 201))
    const response = await withOrg(agent().post('/')).send({ targetId: 'u5' })
    expect(response.status).toBe(201)
    expect(response.body).toEqual({ followed: true })
  })

  it('rejects a request missing rootOrg/org headers', async () => {
    const response = await agent().post('/').send({ targetId: 'u5' })
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('forwards the upstream error status/body on failure', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(409, { error: 'already following' }))
    const response = await withOrg(agent().post('/')).send({ targetId: 'u5' })
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'already following' })
  })
})

describe('POST /unfollow', () => {
  it('unfollows the target user', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ unfollowed: true }, 200))
    const response = await withOrg(agent().post('/unfollow')).send({ targetId: 'u5' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ unfollowed: true })
  })

  it('rejects a request missing rootOrg/org headers', async () => {
    const response = await agent().post('/unfollow').send({ targetId: 'u5' })
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('returns 500 on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/unfollow')).send({ targetId: 'u5' })
    expect(response.status).toBe(500)
  })
})

describe('POST /getFollowers', () => {
  it('returns the followers list', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([{ id: 'f3' }], 200))
    const response = await withOrg(agent().post('/getFollowers')).send({ page: 1 })
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'f3' }])
  })

  it('rejects a request missing rootOrg/org headers', async () => {
    const response = await agent().post('/getFollowers').send({})
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('returns 500 on a network failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withOrg(agent().post('/getFollowers')).send({})
    expect(response.status).toBe(500)
  })
})
