/**
 * PHASE 1 — workallocation.ts. Twelve routes, all the same axios-proxy shape:
 * an optional userId/param guard (400) then a proxied axios call (200 / 500).
 *
 * PHASE 2 note: the `!workOrderId` / `!workAllocationId` / `!userId` guards on
 * GET /getWorkOrderById/:workOrderId, GET /getWorkAllocationById/:workAllocationId,
 * GET /getUserBasicInfo/:userId and GET /getWOPdf/:workOrderId read from a
 * required route param (`:xxx`), which Express's router only matches against a
 * non-empty path segment — confirmed empirically (empty segment, trailing
 * slash, double slash, %00 all either 404 or produce a non-empty string param).
 * There is no supertest/HTTP request that reaches the handler with that param
 * falsy, so those four guard branches are left uncovered rather than faked
 * through a non-HTTP path.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractAuthorizationFromRequest: jest.fn(() => 'Bearer token'),
  extractUserId: jest.fn(() => 'user-1'),
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    KONG_API_BASE: 'https://kong.test',
    SB_API_KEY: 'sb-api-key',
    SB_EXT_API_BASE_2: 'https://ext2.test',
  },
}))

import axios from 'axios'
import { extractUserId } from '../utils/requestExtract'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { workAllocationApi } from './workallocation'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockExtractUserId = extractUserId as jest.Mock
const agent = () => mountRouter(workAllocationApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
  mockExtractUserId.mockReturnValue('user-1')
})

describe('POST /add', () => {
  it('proxies the allocation add request', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ added: true }))
    const response = await agent().post('/add').send({})
    expect(response.status).toBe(200)
  })

  it('rejects when there is no userId', async () => {
    mockExtractUserId.mockReturnValue(undefined)
    const response = await agent().post('/add').send({})
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/add').send({})
    expect(response.status).toBe(500)
  })
})

describe('POST /update', () => {
  it('proxies the allocation update request', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent().post('/update').send({})
    expect(response.status).toBe(200)
  })

  it('rejects when there is no userId', async () => {
    mockExtractUserId.mockReturnValue(undefined)
    const response = await agent().post('/update').send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/update').send({})
    expect(response.status).toBe(500)
  })
})

describe('POST /userSearch', () => {
  it('proxies the user search', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([{ id: 'u1' }]))
    const response = await agent().post('/userSearch').send({})
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/userSearch').send({})
    expect(response.status).toBe(500)
  })
})

describe('GET /user/autocomplete/:searchTerm', () => {
  it('proxies the autocomplete search', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ name: 'A' }]))
    const response = await agent().get('/user/autocomplete/abc')
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/user/autocomplete/abc')
    expect(response.status).toBe(500)
  })
})

describe('POST /v2/add', () => {
  it('proxies the v2 allocation add request', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ added: true }))
    const response = await agent().post('/v2/add').send({})
    expect(response.status).toBe(200)
  })

  it('rejects when there is no userId', async () => {
    mockExtractUserId.mockReturnValue(undefined)
    const response = await agent().post('/v2/add').send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/v2/add').send({})
    expect(response.status).toBe(500)
  })

  it('requests the v2 add endpoint with the body forwarded and userId in headers', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))
    await agent().post('/v2/add').send({ name: 'x' })
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://kong.test/v2/workallocation/add',
      { name: 'x' },
      expect.objectContaining({ headers: expect.objectContaining({ userId: 'user-1' }) })
    )
  })
})

describe('POST /v2/update', () => {
  it('proxies the v2 allocation update request', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent().post('/v2/update').send({})
    expect(response.status).toBe(200)
  })

  it('rejects when there is no userId', async () => {
    mockExtractUserId.mockReturnValue(undefined)
    const response = await agent().post('/v2/update').send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/v2/update').send({})
    expect(response.status).toBe(500)
  })

  it('requests the v2 update endpoint with the body forwarded and userId in headers', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))
    await agent().post('/v2/update').send({ name: 'x' })
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://kong.test/v2/workallocation/update',
      { name: 'x' },
      expect.objectContaining({ headers: expect.objectContaining({ userId: 'user-1' }) })
    )
  })
})

describe('POST /add/workorder', () => {
  it('proxies the work order add request', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ added: true }))
    const response = await agent().post('/add/workorder').send({})
    expect(response.status).toBe(200)
  })

  it('rejects when there is no userId', async () => {
    mockExtractUserId.mockReturnValue(undefined)
    const response = await agent().post('/add/workorder').send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/add/workorder').send({})
    expect(response.status).toBe(500)
  })

  it('requests the add-workorder endpoint with the body forwarded and userId in headers', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))
    await agent().post('/add/workorder').send({ name: 'x' })
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://kong.test/v2/workallocation/add/workorder',
      { name: 'x' },
      expect.objectContaining({ headers: expect.objectContaining({ userId: 'user-1' }) })
    )
  })
})

describe('POST /update/workorder', () => {
  it('proxies the work order update request', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent().post('/update/workorder').send({})
    expect(response.status).toBe(200)
  })

  it('rejects when there is no userId', async () => {
    mockExtractUserId.mockReturnValue(undefined)
    const response = await agent().post('/update/workorder').send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/update/workorder').send({})
    expect(response.status).toBe(500)
  })

  it('requests the update-workorder endpoint with the body forwarded and userId in headers', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))
    await agent().post('/update/workorder').send({ name: 'x' })
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://kong.test/v2/workallocation/update/workorder',
      { name: 'x' },
      expect.objectContaining({ headers: expect.objectContaining({ userId: 'user-1' }) })
    )
  })
})

describe('POST /getWorkOrders', () => {
  it('proxies the work orders list request', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([{ id: 'wo1' }]))
    const response = await agent().post('/getWorkOrders').send({})
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/getWorkOrders').send({})
    expect(response.status).toBe(500)
  })

  it('requests the getWorkOrders endpoint with the body forwarded and no userId header', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))
    await agent().post('/getWorkOrders').send({ filter: 'x' })
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://kong.test/v2/workallocation/getWorkOrders',
      { filter: 'x' },
      expect.anything()
    )
    const [, , config] = mockAxios.post.mock.calls[0]
    expect(config.headers).not.toHaveProperty('userId')
  })
})

describe('GET /getWorkOrderById/:workOrderId', () => {
  it('proxies a single work order fetch', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'wo1' }))
    const response = await agent().get('/getWorkOrderById/wo1')
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/getWorkOrderById/wo1')
    expect(response.status).toBe(500)
  })

  it('requests the resolved work-order-by-id endpoint', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({}))
    await agent().get('/getWorkOrderById/wo1')
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://kong.test/v2/workallocation/getWorkOrderById/wo1',
      expect.anything()
    )
  })
})

describe('GET /getWorkAllocationById/:workAllocationId', () => {
  it('proxies a single work allocation fetch', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'wa1' }))
    const response = await agent().get('/getWorkAllocationById/wa1')
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/getWorkAllocationById/wa1')
    expect(response.status).toBe(500)
  })

  it('requests the resolved work-allocation-by-id endpoint', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({}))
    await agent().get('/getWorkAllocationById/wa1')
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://kong.test/v2/workallocation/getWorkAllocationById/wa1',
      expect.anything()
    )
  })
})

describe('POST /copy/workOrder', () => {
  it('proxies the work order copy request', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ copied: true }))
    const response = await agent().post('/copy/workOrder').send({})
    expect(response.status).toBe(200)
  })

  it('rejects when there is no userId', async () => {
    mockExtractUserId.mockReturnValue(undefined)
    const response = await agent().post('/copy/workOrder').send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/copy/workOrder').send({})
    expect(response.status).toBe(500)
  })

  it('requests the copy-workOrder endpoint with the body forwarded and userId in headers', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))
    await agent().post('/copy/workOrder').send({ name: 'x' })
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://kong.test/v2/workallocation/copy/workOrder',
      { name: 'x' },
      expect.objectContaining({ headers: expect.objectContaining({ userId: 'user-1' }) })
    )
  })
})

describe('GET /getUserBasicInfo/:userId', () => {
  it('proxies a user basic-info fetch', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ userId: 'u1' }))
    const response = await agent().get('/getUserBasicInfo/u1')
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/getUserBasicInfo/u1')
    expect(response.status).toBe(500)
  })

  it('requests the resolved user-basic-info endpoint', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({}))
    await agent().get('/getUserBasicInfo/u1')
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://kong.test/v2/workallocation/user/basicInfo/u1',
      expect.anything()
    )
  })
})

describe('GET /getWOPdf/:workOrderId', () => {
  it('proxies a PDF fetch', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk(Buffer.from('pdf')))
    const response = await agent().get('/getWOPdf/wo1')
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/getWOPdf/wo1')
    expect(response.status).toBe(500)
  })
})
