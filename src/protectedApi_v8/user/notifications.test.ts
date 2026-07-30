/**
 * PHASE 1 — user/notifications.ts.
 *
 * Four routes, all following the same shape as sibling files in this
 * directory: a rootOrg header guard that sends 400 and `return`s (no
 * fall-through), one awaited axios call inside a try/catch, and a single
 * response send on both the success and failure path. No callback-outside-
 * try or missing-guard patterns found, so every route is safe to exercise
 * live end to end.
 *
 * Route registration order matters for the two PATCH routes: PATCH
 * '/settings' is registered before the catch-all PATCH
 * '/:notificationId?/:classification?', so a literal '/settings' path
 * always resolves to the dedicated settings handler rather than being
 * captured by the optional-params route.
 */

jest.mock('axios')
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: { NOTIFICATIONS_API_BASE: 'https://notifications.test' },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { notificationsApi } from './notifications'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(notificationsApi)
const withRootOrg = (req: ReturnType<typeof agent>) => req.set('rootOrg', 'r1')

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.patch.mockReset()
})

describe('PATCH /settings', () => {
  it('updates notification settings and forwards the upstream status/body', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ updated: true }, 201))
    const response = await withRootOrg(agent().patch('/settings')).send({ email: true })
    expect(response.status).toBe(201)
    expect(response.body).toEqual({ updated: true })
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().patch('/settings').send({ email: true })
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.patch.mockRejectedValue(upstreamError(409, { error: 'conflict' }))
    const response = await withRootOrg(agent().patch('/settings')).send({ email: true })
    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.patch.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().patch('/settings')).send({ email: true })
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /', () => {
  it("returns the user's notifications, forwarding query params", async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'n1' }]))
    const response = await withRootOrg(agent().get('/')).query({
      classification: 'general',
      page: '1',
      size: '10',
    })
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'n1' }])
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/')
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))
    const response = await withRootOrg(agent().get('/'))
    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('PATCH /:notificationId?/:classification?', () => {
  it('updates the seen status for a specific notification', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ seen: true }))
    const response = await withRootOrg(agent().patch('/n1/general')).send({})
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ seen: true })
  })

  it('updates all notifications when no notificationId is supplied', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ seen: true }))
    const response = await withRootOrg(agent().patch('/')).send({})
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ seen: true })
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().patch('/n1/general').send({})
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.patch.mockRejectedValue(upstreamError(404, { error: 'not found' }))
    const response = await withRootOrg(agent().patch('/n1/general')).send({})
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.patch.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().patch('/n1/general')).send({})
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /settings', () => {
  it('returns notification settings, forwarding the upstream status/body', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ email: true }, 200))
    const response = await withRootOrg(agent().get('/settings'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ email: true })
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/settings')
    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('forwards the upstream status and body on failure', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(403, { error: 'forbidden' }))
    const response = await withRootOrg(agent().get('/settings'))
    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'forbidden' })
  })

  it('returns 500 with the generic body on a network failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/settings'))
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
