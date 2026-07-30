/**
 * PHASE 2 — entityCompetency.ts. Five routes, uniform axios-proxy shape,
 * but ALL of them do `res.status(response.data.responseCode).send(response.data)`
 * — using the UPSTREAM'S OWN `responseCode` field as the HTTP status code.
 *
 * Real bug, confirmed empirically and safe to test live (caught by the
 * route's own try/catch, so no hang/crash — just wrong behavior; documented
 * in docs/PROD-VERIFICATION.md): Sunbird-family APIs conventionally return
 * `responseCode` as a STRING (e.g. `"OK"`), not a numeric HTTP status.
 * `res.status('OK')` throws `RangeError: Invalid status code: OK` —
 * confirmed via `node -e "... res.status('OK') ..."` before writing this
 * file. Since that throw happens inside the same try block, it's caught by
 * the route's own catch, which sends its generic 500 failure body — so a
 * genuinely SUCCESSFUL upstream call, if it returns a string responseCode
 * (the realistic case), is reported to the client as a 500 failure.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('../utils/pilotMockEntity', () => ({
  appendPilotMockEntity: jest.fn(async (data: unknown) => data),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: { ENTITY_API_BASE: 'https://entity.test' },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { entityCompetencyApi } from './entityCompetency'

const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(entityCompetencyApi)

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

const ROUTES: Array<[string, string]> = [
  ['/addUpdateEntity', 'ADD_UPDATE'],
  ['/addEntityRelation', 'ADD_RELATION'],
  ['/getAllEntity', 'ALL_ENTITY'],
  ['/addEntities', 'ADD_ENTITIES'],
  ['/reviewEntity', 'REVIEW'],
]

describe.each(ROUTES)('POST %s', (path) => {
  it('forwards the upstream response when responseCode is numeric', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ responseCode: 200, result: 'ok' }))
    const response = await agent().post(path).send({})
    expect(response.status).toBe(200)
    expect(response.body.result).toBe('ok')
  })

  it('degrades to 500 (documented bug) when the upstream returns a string responseCode', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ responseCode: 'OK', result: 'ok' }))
    const response = await agent().post(path).send({})
    expect(response.status).toBe(500)
    expect(response.body.status).toBe('failed')
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().post(path).send({})
    expect(response.status).toBe(500)
  })
})

describe('POST /getEntityById/:id', () => {
  it('forwards the upstream response when responseCode is numeric', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ responseCode: 200, result: 'ok' }))
    const response = await agent().post('/getEntityById/e1').send({})
    expect(response.status).toBe(200)
  })

  it('degrades to 500 (documented bug) when the upstream returns a string responseCode', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ responseCode: 'OK', result: 'ok' }))
    const response = await agent().post('/getEntityById/e1').send({})
    expect(response.status).toBe(500)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().post('/getEntityById/e1').send({})
    expect(response.status).toBe(500)
  })
})

describe('POST /getAllEntity pilot mock add-on', () => {
  it('passes the upstream response through appendPilotMockEntity before sending', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ responseCode: 200, result: ['e1'] }))
    const response = await agent().post('/getAllEntity').send({})
    expect(response.status).toBe(200)
    expect(response.body.result).toEqual(['e1'])
  })
})
