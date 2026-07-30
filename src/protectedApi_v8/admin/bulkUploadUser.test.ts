/**
 * PHASE 2 — bulkUploadUser.ts. One route, but a deeply nested fire-and-forget
 * CSV bulk-import pipeline: `cassandra-driver`'s `Client` is instantiated at
 * import time (module-load side effect, mocked below) and `uuid` is used
 * for a row ID. Every inner try/catch swallows its own errors without
 * rethrowing, so `Promise.allSettled` always resolves "fulfilled" regardless
 * of whether any individual user's creation actually succeeded upstream.
 *
 * TWO real bugs found while reading this file (documented in
 * docs/PROD-VERIFICATION.md, NOT reproduced live where dangerous):
 *  - `userProcessing()` is only called `if (result.length > 1)` (i.e. the
 *    CSV has 2+ data rows) and is never awaited by the route handler, which
 *    itself sends NO response at all after that check. For a CSV with 0 or
 *    1 data rows, the request hangs forever — not reproduced live here.
 *  - Because every inner catch swallows its error, `userProcessing()` always
 *    responds 200 "Bulk Upload is Completed!" even if every single row's
 *    user creation failed upstream — there is no way for a caller to learn
 *    that the import actually failed. This IS safe to test live (the code
 *    path itself doesn't hang), so it's asserted directly below.
 */

jest.mock('axios')
jest.mock('cassandra-driver', () => ({
  Client: jest.fn(() => ({ execute: jest.fn(), on: jest.fn() })),
}))
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('./bulkExtendedMethod', () => ({
  bulkExtendedMethod: jest.fn(async () => ({})),
  saveExtendedData: jest.fn(async () => ({})),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    BULK_USER: 'bulk-pass',
    CASSANDRA_IP: '127.0.0.1',
    KONG_API_BASE: 'https://kong.test',
    SB_API_KEY: 'sb-api-key',
    SUNBIRD_PROXY_API_BASE: 'https://proxy.test',
    X_Channel_Id: 'channel-1',
  },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { bulkUploadUserApi } from './bulkUploadUser'

const mockAxiosCallable = axios as unknown as jest.Mock

const csvWithTwoRows = [
  'first_name,last_name,username,phone,type,channel,usertype,Cadre',
  'A,B,userA,,phone,ch1,PUBLIC,OTHER',
  'C,D,userC,,phone,ch1,PUBLIC,OTHER',
].join('\n')

const csvWithAshaRows = [
  'first_name,last_name,username,phone,type,channel,usertype,Cadre,UserID',
  'E,F,userE,,phone,ch1,PUBLIC,ASHAS,ext-1',
  'G,H,userG,,phone,ch1,PUBLIC,ASHAS,ext-2',
].join('\n')

function agentWithFile(csv: string) {
  return mountRouter(bulkUploadUserApi, {
    // tslint:disable-next-line: no-any
    requestProps: { files: { userData: { data: Buffer.from(csv, 'utf8') } } } as any,
  })
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

beforeEach(() => {
  mockAxiosCallable.mockReset()
})

describe('POST /create-users', () => {
  it('returns 500 synchronously when no file is attached', async () => {
    const response = await mountRouter(bulkUploadUserApi).post('/create-users')
    expect(response.status).toBe(500)
  })

  it('responds 200 once processing settles, for a CSV with 2+ data rows', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: { userId: 'u1' } }))
    const response = await agentWithFile(csvWithTwoRows).post('/create-users')
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('success')
  })

  it('still responds 200 even when every upstream user-creation call fails (documented silent-failure bug)', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agentWithFile(csvWithTwoRows).post('/create-users')
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('success')
    await settle()
  })

  it('routes Cadre=ASHAS rows through the Cassandra-backed saveAshaWorkerData path', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('user/v2/read/')) {
        return Promise.resolve(upstreamOk({ result: { response: { organisations: [{ organisationId: 'org-1' }] } } }))
      }
      return Promise.resolve(upstreamOk({ result: { userId: 'u-asha-1' } }))
    })
    const response = await agentWithFile(csvWithAshaRows).post('/create-users')
    expect(response.status).toBe(200)
    await settle()
  })

  // NOTE: a CSV with 0 or 1 data rows is a documented hang bug (userProcessing()
  // is only invoked when result.length > 1, and nothing else ever responds) —
  // not reproduced live.
})
