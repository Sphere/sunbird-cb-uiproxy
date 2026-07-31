/**
 * roleActivity.ts — two routes:
 *   GET '/'          — no axios call; returns a hardcoded role list, gated on
 *                       a 'rootOrg' header.
 *   GET '/:roleKey'   — axios.post proxy to FRAC's searchNodes, gated on
 *                       'rootOrg' header + extractAuthorizationFromRequest,
 *                       with a response-shaping step (getRoles) that filters
 *                       each matched role's children down to type 'ACTIVITY'.
 *
 * Both header/auth guards use `return` after res.status(400).send(...), so
 * there is no fall-through into the protected logic (checked by hand before
 * writing any live test — see roleActivity.ts lines 20-23 and 38-41). Both
 * routes wrap their logic in try/catch with the standard
 * `err.response.status || 500` / `err.response.data || {...}` shape, so
 * upstream and transport failures are safe to exercise live.
 *
 * extractAuthorizationFromRequest is mocked wholesale (like
 * workallocation.test.ts) since its real implementation reads
 * req.kauth.grant.access_token.token — mountRouter() doesn't install Keycloak
 * middleware, and even absent that, `'Bearer ' + undefined` would be a
 * truthy string, so exercising the "missing auth" 400 branch live requires
 * controlling the mock's return value directly.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractAuthorizationFromRequest: jest.fn(() => 'Bearer token'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    FRAC_API_BASE: 'https://frac.test',
  },
}))

import axios from 'axios'
import { extractAuthorizationFromRequest } from '../utils/requestExtract'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { roleActivityApi } from './roleActivity'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockExtractAuth = extractAuthorizationFromRequest as jest.Mock
const agent = () => mountRouter(roleActivityApi)

beforeEach(() => {
  mockAxios.post.mockReset()
  mockExtractAuth.mockReturnValue('Bearer token')
})

/**
 * @description Verifies the GET / route rejects requests missing the rootOrg
 * header and otherwise returns the hardcoded role list.
 */
describe('GET /', () => {
  it('should reject a request missing the rootOrg header', async () => {
    const response = await agent().get('/')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('should return the hardcoded role list when rootOrg is present', async () => {
    const response = await agent().get('/').set('rootOrg', 'r1')

    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(4)
    expect(response.body.map((r: { id: string }) => r.id)).toEqual([
      'RID001',
      'RID002',
      'RID003',
      'RID004',
    ])
    expect(response.body[0]).toEqual({
      childNodes: [
        {
          description: 'Implementation of e-Office',
          id: 'AID002',
          name: 'Implementation of e-Office',
          parentRole: 'RID001',
          source: 'ISTM',
          status: 'UNVERIFIED',
          type: 'ACTIVITY',
        },
        {
          description: 'Work related to committee of financial sector statistics',
          id: 'AID002',
          name: 'Work related to committee of financial sector statistics',
          parentRole: 'RID001',
          source: 'ISTM',
          status: 'UNVERIFIED',
          type: 'ACTIVITY',
        },
      ],
      description: 'Development and deployment of e-Office and training the employees',
      id: 'RID001',
      name: 'Information Technology',
      source: 'ISTM',
      status: 'UNVERIFIED',
      type: 'ROLE',
    })
  })
})

/**
 * @description Verifies the GET /:roleKey route guards on the rootOrg header
 * and auth token, posts the expected search body to FRAC's searchNodes, and
 * shapes the response to keep only ACTIVITY-type children for matched roles.
 */
describe('GET /:roleKey', () => {
  it('should reject a request missing the rootOrg header', async () => {
    const response = await agent().get('/manager')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('should reject a request missing the auth token', async () => {
    mockExtractAuth.mockReturnValue(undefined)

    const response = await agent().get('/manager').set('rootOrg', 'r1')

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('should post the expected search body and headers to the searchNodes endpoint', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ responseData: [] }))

    await agent()
      .get('/manager')
      .set('rootOrg', 'r1')
      .set('Authorization', 'Bearer token')

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://frac.test/fracapis/frac/searchNodes',
      {
        childCount: true,
        childNodes: true,
        searches: [
          { field: 'name', keyword: 'manager', type: 'ROLE' },
          { field: 'status', keyword: 'VERIFIED', type: 'ROLE' },
        ],
      },
      expect.objectContaining({
        headers: { Authorization: 'Bearer token' },
      })
    )
  })

  it('should map matched roles, keeping only ACTIVITY-type children', async () => {
    mockAxios.post.mockResolvedValue(
      upstreamOk({
        responseData: [
          {
            children: [
              {
                description: 'An activity',
                id: 'A1',
                name: 'Activity One',
                source: 'SRC',
                status: 'VERIFIED',
                type: 'ACTIVITY',
              },
              {
                description: 'A nested role, not an activity',
                id: 'R2',
                name: 'Nested Role',
                source: 'SRC',
                status: 'VERIFIED',
                type: 'ROLE',
              },
            ],
            description: 'A matched role',
            id: 'R1',
            name: 'Manager',
            source: 'SRC',
            status: 'VERIFIED',
            type: 'ROLE',
          },
        ],
      })
    )

    const response = await agent().get('/manager').set('rootOrg', 'r1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      {
        childNodes: [
          {
            description: 'An activity',
            id: 'A1',
            name: 'Activity One',
            parentRole: '',
            source: 'SRC',
            status: 'VERIFIED',
            type: 'ACTIVITY',
          },
        ],
        description: 'A matched role',
        id: 'R1',
        name: 'Manager',
        source: 'SRC',
        status: 'VERIFIED',
        type: 'ROLE',
      },
    ])
  })

  it('should return childNodes: [] for a matched role with no children', async () => {
    mockAxios.post.mockResolvedValue(
      upstreamOk({
        responseData: [
          {
            description: 'Childless role',
            id: 'R3',
            name: 'Solo',
            source: 'SRC',
            status: 'VERIFIED',
            type: 'ROLE',
            // no `children` key at all
          },
        ],
      })
    )

    const response = await agent().get('/solo').set('rootOrg', 'r1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      {
        childNodes: [],
        description: 'Childless role',
        id: 'R3',
        name: 'Solo',
        source: 'SRC',
        status: 'VERIFIED',
        type: 'ROLE',
      },
    ])
  })

  it('should return an empty list when responseData is an empty array', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ responseData: [] }))

    const response = await agent().get('/nomatch').set('rootOrg', 'r1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it('should return an empty list when responseData is absent from the upstream body', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    const response = await agent().get('/nomatch').set('rootOrg', 'r1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it('should forward an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent().get('/manager').set('rootOrg', 'r1')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('should fall back to 500 on a transport failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().get('/manager').set('rootOrg', 'r1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })

  it('should fall back to 500 when the upstream body is a shape the handler cannot read (no .response on the thrown error)', async () => {
    // Resolving with data: null makes `response.data.responseData` throw a
    // plain TypeError inside the try block. That TypeError has no `.response`
    // property, so it's the GENERAL_ERR_MSG/500 fallback branch — still
    // caught by the route's own try/catch, so this is safe to run live.
    mockAxios.post.mockResolvedValue({ data: null, status: 200, statusText: 'OK', headers: {}, config: {} })

    const response = await agent().get('/manager').set('rootOrg', 'r1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
