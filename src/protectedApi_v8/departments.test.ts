/**
 * EXEMPLAR — multi-endpoint handler with a query parameter.
 *
 * Companion to counter.test.ts. Shows the pattern when one router exposes
 * several endpoints: one describe() per endpoint, each with success / upstream
 * error / transport failure.
 *
 * Note the module-level URL capture below — API_END_POINTS is built from
 * CONSTANTS at import time, so the env mock must be registered before the
 * module under test is imported. jest.mock() is hoisted above the imports, so
 * this works; a mock assigned inside beforeEach would NOT.
 */

jest.mock('axios')
jest.mock('../utils/env', () => ({
  CONSTANTS: { SB_EXT_API_BASE_2: 'https://ext.test', TIMEOUT: '10000' },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { deptApi } from './departments'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(deptApi)

describe('GET /getAllDept', () => {
  it('forwards the upstream body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 1, name: 'Health' }]))

    const response = await agent().get('/getAllDept')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 1, name: 'Health' }])
  })

  it('requests the configured department endpoint', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))

    await agent().get('/getAllDept')

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://ext.test/portal/getAllDept',
      expect.anything()
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(404, { error: 'not found' }))

    const response = await agent().get('/getAllDept')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: 'not found' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent().get('/getAllDept')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /searchDept', () => {
  it('passes the friendlyName query through to the upstream url', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 2 }]))

    const response = await agent().get('/searchDept').query({ friendlyName: 'health' })

    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://ext.test/portal/deptSearch?friendlyName=health',
      expect.anything()
    )
  })

  it('still calls upstream when friendlyName is absent', async () => {
    // Documents current behaviour: the value is interpolated as undefined
    // rather than rejected with a 400.
    mockAxios.get.mockResolvedValue(upstreamOk([]))

    const response = await agent().get('/searchDept')

    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://ext.test/portal/deptSearch?friendlyName=undefined',
      expect.anything()
    )
  })

  it('forwards an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(502, { error: 'bad gateway' }))

    const response = await agent().get('/searchDept').query({ friendlyName: 'x' })

    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'bad gateway' })
  })

  it('falls back to 500 on a transport failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent().get('/searchDept').query({ friendlyName: 'x' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
