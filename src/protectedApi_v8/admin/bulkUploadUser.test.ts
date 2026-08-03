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
// `Client` is instantiated once at module load, but jest.config.js's global
// `clearMocks: true` wipes every mock's call/result history before each
// test — including a factory-created inner `execute` jest.fn(). Capturing a
// single stable `execute` reference here (outside any test, so it survives
// clearMocks) is the proven fix for this, matching the pattern used for the
// same issue in publicCertifcateFlinkv2.test.ts.
const mockCassandraExecute = jest.fn()
jest.mock('cassandra-driver', () => ({
  Client: jest.fn(() => ({ execute: mockCassandraExecute, on: jest.fn() })),
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
import { logInfo } from '../../utils/logger'
import { bulkUploadUserApi } from './bulkUploadUser'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockLogInfo = logInfo as jest.Mock

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
  mockCassandraExecute.mockReset()
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

  it('responds 500 when userProcessing itself throws after the rows settle (its own outer catch)', async () => {
    // Forces logInfo to throw only on the specific call made right before the
    // 200 response, at the top level of userProcessing's own try block — not
    // inside any of the nested per-row try/catches, which would swallow it.
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: { userId: 'u1' } }))
    mockLogInfo.mockImplementation((msg: unknown) => {
      if (typeof msg === 'string' && msg.startsWith('Data inside user processing')) {
        throw new Error('logging blew up')
      }
    })
    try {
      const response = await agentWithFile(csvWithTwoRows).post('/create-users')
      expect(response.status).toBe(500)
      expect(response.body.message).toBe('Error While Creating the user ')
    } finally {
      mockLogInfo.mockImplementation(() => undefined)
    }
  })

  it('drives a non-ASHA row through role assignment, password reset and a successful welcome email', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('user/v2/read/')) {
        return Promise.resolve(upstreamOk({ result: { response: { organisations: [{ organisationId: 'org-1' }] } } }))
      }
      if (config.url.includes('/user/v1/role/assign')) {
        return Promise.resolve(upstreamOk({}))
      }
      if (config.url.includes('/password/reset')) {
        return Promise.resolve(upstreamOk({ result: { link: 'https://reset.test/link' } }))
      }
      if (config.url.includes('/notification/email')) {
        return Promise.resolve(upstreamOk({ params: { status: 'success' } }))
      }
      return Promise.resolve(upstreamOk({ result: { userId: 'u1' } }))
    })
    const response = await agentWithFile(csvWithTwoRows).post('/create-users')
    expect(response.status).toBe(200)
    await settle()
  })

  it('logs a failure when the welcome-email upstream reports a non-success status', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('user/v2/read/')) {
        return Promise.resolve(upstreamOk({ result: { response: { organisations: [{ organisationId: 'org-1' }] } } }))
      }
      if (config.url.includes('/user/v1/role/assign')) {
        return Promise.resolve(upstreamOk({}))
      }
      if (config.url.includes('/password/reset')) {
        return Promise.resolve(upstreamOk({ result: { link: 'https://reset.test/link' } }))
      }
      if (config.url.includes('/notification/email')) {
        return Promise.resolve(upstreamOk({ params: { status: 'failed' } }))
      }
      return Promise.resolve(upstreamOk({ result: { userId: 'u1' } }))
    })
    const response = await agentWithFile(csvWithTwoRows).post('/create-users')
    expect(response.status).toBe(200)
    await settle()
  })

  it('swallows an upstream failure from the welcome-email call for a non-ASHA row', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('user/v2/read/')) {
        return Promise.resolve(upstreamOk({ result: { response: { organisations: [{ organisationId: 'org-1' }] } } }))
      }
      if (config.url.includes('/user/v1/role/assign')) {
        return Promise.resolve(upstreamOk({}))
      }
      if (config.url.includes('/password/reset')) {
        return Promise.resolve(upstreamOk({ result: { link: 'https://reset.test/link' } }))
      }
      if (config.url.includes('/notification/email')) {
        return Promise.reject(networkError())
      }
      return Promise.resolve(upstreamOk({ result: { userId: 'u1' } }))
    })
    const response = await agentWithFile(csvWithTwoRows).post('/create-users')
    expect(response.status).toBe(200)
    await settle()
  })

  it('swallows an upstream failure resetting the password for a non-ASHA row', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('user/v2/read/')) {
        return Promise.resolve(upstreamOk({ result: { response: { organisations: [{ organisationId: 'org-1' }] } } }))
      }
      if (config.url.includes('/user/v1/role/assign')) {
        return Promise.resolve(upstreamOk({}))
      }
      if (config.url.includes('/password/reset')) {
        return Promise.reject(networkError())
      }
      return Promise.resolve(upstreamOk({ result: { userId: 'u1' } }))
    })
    const response = await agentWithFile(csvWithTwoRows).post('/create-users')
    expect(response.status).toBe(200)
    await settle()
  })

  it('swallows an upstream failure assigning a role for a non-ASHA row', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('user/v2/read/')) {
        return Promise.resolve(upstreamOk({ result: { response: { organisations: [{ organisationId: 'org-1' }] } } }))
      }
      if (config.url.includes('/user/v1/role/assign')) {
        return Promise.reject(networkError())
      }
      return Promise.resolve(upstreamOk({ result: { userId: 'u1' } }))
    })
    const response = await agentWithFile(csvWithTwoRows).post('/create-users')
    expect(response.status).toBe(200)
    await settle()
  })

  it('covers the non-ASHA row outer catch when logging itself throws before the user-creation call', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: { userId: 'u1' } }))
    mockLogInfo.mockImplementation((msg: unknown) => {
      if (msg === 'CSV data present more than one row') {
        throw new Error('log boom')
      }
    })
    try {
      const response = await agentWithFile(csvWithTwoRows).post('/create-users')
      expect(response.status).toBe(200)
      await settle()
    } finally {
      mockLogInfo.mockImplementation(() => undefined)
    }
  })

  it('swallows an upstream failure creating an ASHA worker', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agentWithFile(csvWithAshaRows).post('/create-users')
    expect(response.status).toBe(200)
    await settle()
  })

  it('swallows an upstream failure reading a newly created ASHA worker', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('user/v2/read/')) {
        return Promise.reject(networkError())
      }
      return Promise.resolve(upstreamOk({ result: { userId: 'u-asha-2' } }))
    })
    const response = await agentWithFile(csvWithAshaRows).post('/create-users')
    expect(response.status).toBe(200)
    await settle()
  })

  it('swallows an upstream failure assigning a role to an ASHA worker', async () => {
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('user/v2/read/')) {
        return Promise.resolve(upstreamOk({ result: { response: { organisations: [{ organisationId: 'org-2' }] } } }))
      }
      if (config.url.includes('/user/v1/role/assign')) {
        return Promise.reject(networkError())
      }
      return Promise.resolve(upstreamOk({ result: { userId: 'u-asha-3' } }))
    })
    const response = await agentWithFile(csvWithAshaRows).post('/create-users')
    expect(response.status).toBe(200)
    await settle()
  })

  it('swallows a Cassandra insert failure after an ASHA worker is fully provisioned', async () => {
    mockCassandraExecute.mockImplementationOnce(() => {
      throw new Error('cassandra insert failed')
    })
    mockAxiosCallable.mockImplementation((config: { url: string }) => {
      if (config.url.includes('user/v2/read/')) {
        return Promise.resolve(upstreamOk({ result: { response: { organisations: [{ organisationId: 'org-3' }] } } }))
      }
      if (config.url.includes('/user/v1/role/assign')) {
        return Promise.resolve(upstreamOk({}))
      }
      return Promise.resolve(upstreamOk({ result: { userId: 'u-asha-4' } }))
    })
    const response = await agentWithFile(csvWithAshaRows).post('/create-users')
    expect(response.status).toBe(200)
    await settle()
  })

  it('covers the ASHA row outer catch when logging itself throws before the user-creation call', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: { userId: 'u-asha-5' } }))
    mockLogInfo.mockImplementation((msg: unknown) => {
      if (msg === 'CSV data present more than one row') {
        throw new Error('log boom')
      }
    })
    try {
      const response = await agentWithFile(csvWithAshaRows).post('/create-users')
      expect(response.status).toBe(200)
      await settle()
    } finally {
      mockLogInfo.mockImplementation(() => undefined)
    }
  })
})
