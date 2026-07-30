/**
 * PHASE 1 (harder tier) — training.ts. Twenty routes; mostly a uniform
 * axios-proxy shape, plus a handful with real post-processing logic
 * (watchlist membership check, feedback date-range formatting, nominee/user
 * email mapping, JL6+ privilege derivation). getEmailLocalPart /
 * getDateRangeString / getStringifiedQueryParams are pure helpers, used
 * directly rather than mocked.
 */

jest.mock('axios')
jest.mock('../utils/requestExtract', () => ({
  extractUserEmailFromRequest: jest.fn(() => 'user1@test.com'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: { LEARNING_HUB_API_BASE: 'https://learning-hub.test' },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { trainingApi } from './training'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(trainingApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
  mockAxios.delete.mockReset()
  mockAxios.patch.mockReset()
})

describe('GET /content/:contentId/trainings', () => {
  it('forwards trainings for a date range', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 't1' }]))
    const response = await agent().get('/content/c1/trainings?fromDate=2024-01-01&toDate=2024-01-31')
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 't1' }])
  })

  it('appends a location filter when provided', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))
    await agent().get('/content/c1/trainings?fromDate=2024-01-01&toDate=2024-01-31&location=Chennai')
    expect(mockAxios.get).toHaveBeenCalledWith(expect.stringContaining('&location=Chennai'))
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/content/c1/trainings?fromDate=2024-01-01&toDate=2024-01-31')
    expect(response.status).toBe(400)
  })
})

describe('GET /content/:contentId/trainings/count', () => {
  it('forwards the training count', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ count: 3 }))
    const response = await agent().get('/content/c1/trainings/count')
    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledWith(expect.any(String), { identifiers: ['c1'] })
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().get('/content/c1/trainings/count')
    expect(response.status).toBe(400)
  })
})

describe('POST /count', () => {
  it('forwards the training count for the given filters', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ count: 5 }))
    const response = await agent().post('/count').send({ identifiers: ['c1', 'c2'] })
    expect(response.status).toBe(200)
  })
})

describe('POST /:trainingId (register)', () => {
  it('registers the user and returns a success payload', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({}))
    const response = await agent().post('/t1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ res_code: 1, res_message: 'Registered' })
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/t1')
    expect(response.status).toBe(400)
  })
})

describe('DELETE /:trainingId (deregister)', () => {
  it('deregisters the user', async () => {
    mockAxios.delete.mockResolvedValue(upstreamOk({ res_code: 1 }))
    const response = await agent().delete('/t1')
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.delete.mockRejectedValue(networkError())
    const response = await agent().delete('/t1')
    expect(response.status).toBe(400)
  })
})

describe('POST /:trainingId/nominees', () => {
  it('maps nominee emails to their local part and forwards them', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk([{ res_code: 1 }]))
    const response = await agent()
      .post('/t1/nominees')
      .send({ nominees: [{ email: 'a@b.com' }, { email: 'c@d.com' }] })
    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ manager: 'user1', nominees: ['a', 'c'] })
    )
  })

  it('returns 400 when nominees are missing', async () => {
    const response = await agent().post('/t1/nominees').send({})
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })
})

describe('POST /:trainingId/share', () => {
  it('maps share-target emails to their local part', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ res_code: 1 }))
    const response = await agent()
      .post('/t1/share')
      .send({ users: [{ email: 'a@b.com' }] })
    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ shared_with: ['a'] })
    )
  })

  it('shares with an empty list when users is omitted', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ res_code: 1 }))
    const response = await agent().post('/t1/share').send({})
    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ shared_with: [] }))
  })
})

describe('GET /watchlist', () => {
  it('forwards the watchlist', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk(['c1', 'c2']))
    const response = await agent().get('/watchlist')
    expect(response.status).toBe(200)
  })
})

describe('GET /watchlist/content/:contentId/status', () => {
  it('reports true when the content is in the watchlist', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk(['c1', 'c2']))
    const response = await agent().get('/watchlist/content/c1/status')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ inWatchlist: true })
  })

  it('reports false when the content is not in the watchlist', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk(['c2']))
    const response = await agent().get('/watchlist/content/c1/status')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ inWatchlist: false })
  })
})

describe('POST /watchlist/content/:contentId', () => {
  it('adds content to the watchlist', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ res_code: 1 }))
    const response = await agent().post('/watchlist/content/c1')
    expect(response.status).toBe(200)
  })
})

describe('DELETE /watchlist/content/:contentId', () => {
  it('removes content from the watchlist', async () => {
    mockAxios.delete.mockResolvedValue(upstreamOk({ res_code: 1 }))
    const response = await agent().delete('/watchlist/content/c1')
    expect(response.status).toBe(200)
  })
})

describe('GET /trainings/jit', () => {
  it('forwards past JIT requests', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'jit1' }]))
    const response = await agent().get('/trainings/jit')
    expect(response.status).toBe(200)
  })
})

describe('POST /trainings/jit', () => {
  it('builds and forwards a JIT request', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ res_code: 1 }))
    const response = await agent()
      .post('/trainings/jit')
      .send({ contentId: 'c1', location: 'L1', participantCount: 10, startDate: '2024-05-01', track: 'T1' })
    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ content_id: 'c1', raised_by: 'user1', start_date: '2024-05-01' })
    )
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/trainings/jit').send({ startDate: '2024-05-01' })
    expect(response.status).toBe(500)
  })
})

describe('GET /trainingsForApproval', () => {
  it('forwards the manager team training requests', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'r1' }]))
    const response = await agent().get('/trainingsForApproval')
    expect(response.status).toBe(200)
  })
})

describe('PATCH /:trainingId', () => {
  it('forwards a training request status update', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ res_code: 1 }))
    const response = await agent().patch('/t1').send({ status: 'rejected' })
    expect(response.status).toBe(200)
  })
})

describe('GET /trainings/feedback', () => {
  // getDateRangeString (src/utils/helpers.ts) uses date-fns v1-style tokens
  // ('D', 'DD', 'YYYY') that date-fns v2 deliberately throws on — so this
  // ALWAYS ends up in that helper's catch block and date_range is ALWAYS ''.
  // Confirmed directly (see docs/PROD-VERIFICATION.md). Asserting the real,
  // current (buggy) behaviour here, not the intended one.
  it('sets an empty date_range on each pending-feedback training (documented bug)', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk([{ end_dt: '2024-01-05', start_dt: '2024-01-01' }])
    )
    const response = await agent().get('/trainings/feedback')
    expect(response.status).toBe(200)
    expect(response.body[0].date_range).toBe('')
  })
})

describe('GET /feedback/:formId', () => {
  it('forwards the feedback form questions', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'q1' }]))
    const response = await agent().get('/feedback/f1')
    expect(response.status).toBe(200)
  })
})

describe('POST /trainings/:trainingId/feedback', () => {
  it('submits feedback with the formId query param', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ res_code: 1 }))
    const response = await agent().post('/trainings/t1/feedback?formId=f1').send({ answers: [] })
    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledWith(expect.stringContaining('template=f1'), { answers: [] })
  })

  it('returns 400 when formId is missing', async () => {
    const response = await agent().post('/trainings/t1/feedback').send({ answers: [] })
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })
})

describe('GET /userInfo', () => {
  it('derives nominate/JIT privileges for a JL6+ user', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ isJL6AndAbove: true }))
    const response = await agent().get('/userInfo')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ canNominate: true, canRequestJIT: true })
  })

  it('derives false privileges for a below-JL6 user', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ isJL6AndAbove: false }))
    const response = await agent().get('/userInfo')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ canNominate: false, canRequestJIT: false })
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/userInfo')
    expect(response.status).toBe(400)
  })
})
