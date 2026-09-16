/**
 * Multi-endpoint proxy handler. Every route follows the exemplar shape
 * (axios call -> forward status+data, or forward the upstream error status),
 * with several POST routes additionally validating that `rootorg`/`org`
 * headers are present before making the upstream call.
 *
 * extractUserToken (../utils/requestExtract) is NOT mocked: it just does
 * `req.kauth && req.kauth.grant.access_token.token`, which safely evaluates
 * to `undefined` when no `kauth` is present on the request (as here), so
 * there is nothing to stub.
 */

jest.mock('axios')
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    KONG_API_BASE: 'https://kong.test',
    SB_API_KEY: 'test-api-key',
    TIMEOUT: '10000',
    WORKFLOW_HANDLER_SERVICE_API_BASE: 'https://workflow.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { workflowHandlerApi } from './workflow-handler'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(workflowHandlerApi)

const orgHeaders = { rootorg: 'root-1', org: 'org-1' }

describe('POST /transition', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ transitioned: true }))

    const response = await agent().post('/transition').set(orgHeaders).send({ id: 1 })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ transitioned: true })
  })

  it('requests the configured transition endpoint', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    await agent().post('/transition').set(orgHeaders).send({ id: 1 })

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://kong.test/workflow/transition',
      { id: 1 },
      expect.anything()
    )
  })

  it('rejects with 400 when rootorg header is missing', async () => {
    const response = await agent().post('/transition').set('org', 'org-1').send({ id: 1 })

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('rejects with 400 when org header is missing', async () => {
    const response = await agent().post('/transition').set('rootorg', 'root-1').send({ id: 1 })

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(409, { error: 'conflict' }))

    const response = await agent().post('/transition').set(orgHeaders).send({ id: 1 })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/transition').set(orgHeaders).send({ id: 1 })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /applicationsSearch', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ applications: [] }))

    const response = await agent().post('/applicationsSearch').set(orgHeaders).send({ q: 'x' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ applications: [] })
  })

  it('requests the configured applications search endpoint', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    await agent().post('/applicationsSearch').set(orgHeaders).send({ q: 'x' })

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://kong.test/workflow/applications/search',
      { q: 'x' },
      expect.anything()
    )
  })

  it('rejects with 400 when org headers are missing', async () => {
    const response = await agent().post('/applicationsSearch').send({ q: 'x' })

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent().post('/applicationsSearch').set(orgHeaders).send({ q: 'x' })

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/applicationsSearch').set(orgHeaders).send({ q: 'x' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /nextActionSearch/:serviceName/:state', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ nextAction: 'approve' }))

    const response = await agent().get('/nextActionSearch/onboarding/pending').set(orgHeaders)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ nextAction: 'approve' })
  })

  it('requests the configured next-action endpoint with path params interpolated', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({}))

    await agent().get('/nextActionSearch/onboarding/pending').set(orgHeaders)

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://kong.test/workflow/nextAction/onboarding/pending',
      expect.anything()
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))

    const response = await agent().get('/nextActionSearch/onboarding/pending').set(orgHeaders)

    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent().get('/nextActionSearch/onboarding/pending').set(orgHeaders)

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /historyByApplicationIdAndWfId/:applicationId/:wfId', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ history: [] }))

    const response = await agent().get('/historyByApplicationIdAndWfId/app-1/wf-1').set(orgHeaders)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ history: [] })
  })

  it('requests the configured wfId/applicationId history endpoint', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({}))

    await agent().get('/historyByApplicationIdAndWfId/app-1/wf-1').set(orgHeaders)

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://workflow.test/v1/workflow/wf-1/app-1/history',
      expect.anything()
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent().get('/historyByApplicationIdAndWfId/app-1/wf-1').set(orgHeaders)

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent().get('/historyByApplicationIdAndWfId/app-1/wf-1').set(orgHeaders)

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /workflowProcess/:wfId', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ process: 'ready' }))

    const response = await agent().get('/workflowProcess/wf-1').set('rootorg', 'root-1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ process: 'ready' })
  })

  it('requests the configured workflow process endpoint', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({}))

    await agent().get('/workflowProcess/wf-1').set('rootorg', 'root-1')

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://kong.test/workflow/workflowProcess/wf-1',
      expect.anything()
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(403, { error: 'forbidden' }))

    const response = await agent().get('/workflowProcess/wf-1').set('rootorg', 'root-1')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'forbidden' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent().get('/workflowProcess/wf-1').set('rootorg', 'root-1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /historyByApplicationId/:applicationId', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ history: ['a'] }))

    const response = await agent().get('/historyByApplicationId/app-1').set(orgHeaders)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ history: ['a'] })
  })

  it('requests the configured applicationId history endpoint', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({}))

    await agent().get('/historyByApplicationId/app-1').set(orgHeaders)

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://workflow.test/v1/workflow/app-1/history',
      expect.anything()
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(400, { error: 'bad request' }))

    const response = await agent().get('/historyByApplicationId/app-1').set(orgHeaders)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: 'bad request' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent().get('/historyByApplicationId/app-1').set(orgHeaders)

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /updateUserProfileWf', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ updated: true }))

    const response = await agent().post('/updateUserProfileWf').set(orgHeaders).send({ name: 'a' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ updated: true })
  })

  it('requests the configured profile-update endpoint', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    await agent().post('/updateUserProfileWf').set(orgHeaders).send({ name: 'a' })

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://kong.test/workflow/updateUserProfileWF',
      { name: 'a' },
      expect.anything()
    )
  })

  it('rejects with 400 when org headers are missing', async () => {
    const response = await agent().post('/updateUserProfileWf').send({ name: 'a' })

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(422, { error: 'invalid' }))

    const response = await agent().post('/updateUserProfileWf').set(orgHeaders).send({ name: 'a' })

    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'invalid' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/updateUserProfileWf').set(orgHeaders).send({ name: 'a' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /userWfSearch', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ wf: [] }))

    const response = await agent()
      .post('/userWfSearch')
      .set(orgHeaders)
      .set('wid', 'wid-1')
      .send({ userId: 'u1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ wf: [] })
  })

  it('requests the configured userWfSearch endpoint, forwarding the wid header', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    await agent().post('/userWfSearch').set(orgHeaders).set('wid', 'wid-1').send({ userId: 'u1' })

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://kong.test/workflow/getUserWF',
      { userId: 'u1' },
      expect.objectContaining({ headers: expect.objectContaining({ wid: 'wid-1' }) })
    )
  })

  it('rejects with 400 when org headers are missing', async () => {
    const response = await agent().post('/userWfSearch').send({ userId: 'u1' })

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(409, { error: 'conflict' }))

    const response = await agent().post('/userWfSearch').set(orgHeaders).send({ userId: 'u1' })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/userWfSearch').set(orgHeaders).send({ userId: 'u1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('POST /userWFApplicationFieldsSearch', () => {
  it('forwards the upstream status and body on success', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ fields: [] }))

    const response = await agent()
      .post('/userWFApplicationFieldsSearch')
      .set(orgHeaders)
      .set('wid', 'wid-1')
      .send({ userId: 'u1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ fields: [] })
  })

  it('requests the configured userWFApplicationFieldsSearch endpoint, forwarding the wid header', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    await agent()
      .post('/userWFApplicationFieldsSearch')
      .set(orgHeaders)
      .set('wid', 'wid-1')
      .send({ userId: 'u1' })

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://kong.test/workflow/getUserWFApplicationFields',
      { userId: 'u1' },
      expect.objectContaining({ headers: expect.objectContaining({ wid: 'wid-1' }) })
    )
  })

  it('rejects with 400 when org headers are missing', async () => {
    const response = await agent().post('/userWFApplicationFieldsSearch').send({ userId: 'u1' })

    expect(response.status).toBe(400)
    expect(response.text).toBe('ERROR_NO_ORG_DATA')
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.post.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent().post('/userWFApplicationFieldsSearch').set(orgHeaders).send({ userId: 'u1' })

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent().post('/userWFApplicationFieldsSearch').set(orgHeaders).send({ userId: 'u1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
