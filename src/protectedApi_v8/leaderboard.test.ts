/**
 * PHASE 1 — leaderboard.ts. Fourteen routes; twelve share one axios-proxy
 * shape (spread apiParams/req.body, forward, send response.data). Tested
 * table-driven for those, plus dedicated tests for the two path-param GETs
 * and the two badge endpoints that post-process the response.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    GAMIFICATION_API_BASE: 'https://gamification.test',
    SB_EXT_API_BASE_2: 'https://ext2.test',
  },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { leaderBoardApi } from './leaderboard'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(leaderBoardApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

describe('GET /:durationType/:durationValue/:year', () => {
  it('forwards the leaderboard for the given period', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ rank: 1 }))
    const response = await agent().get('/monthly/1/2026').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/monthly/1/2026')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/monthly/1/2026').set('rootOrg', 'r1')
    expect(response.status).toBe(500)
  })
})

describe('GET /hallOfFame', () => {
  it('forwards the hall of fame list', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'u1' }]))
    const response = await agent().get('/hallOfFame').set('rootOrg', 'r1')
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/hallOfFame')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/hallOfFame').set('rootOrg', 'r1')
    expect(response.status).toBe(500)
  })
})

const UNIFORM_POST_ENDPOINTS = [
  '/fetchLeaderBoardDetails',
  '/leaderboardActivities',
  '/leaderboardGuild',
  '/badgeDetails',
  '/dealersDetails',
  '/userDetails',
  '/updateApprovedPoints',
  '/updateConfiguration',
  '/Getsso',
  '/GetBalance',
  '/fetchConfiguration',
  '/fetchGuildAwardCountData',
]

describe.each(UNIFORM_POST_ENDPOINTS)('POST %s', (path) => {
  it('proxies the request and forwards the response', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ ok: true }))
    const response = await agent().post(path).send({})
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post(path).send({})
    expect(response.status).toBe(500)
  })
})

describe('POST /badgeWon', () => {
  it('processes and returns the badges array, rewriting image paths', async () => {
    mockAxios.post.mockResolvedValue(
      upstreamOk([{ BadgeImagePath: 'https://gamification.test/img/badge1.png', name: 'B1' }])
    )
    const response = await agent().post('/badgeWon').send({})
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ BadgeImagePath: '/apis/proxies/v8/img/badge1.png', name: 'B1' }])
  })

  it('returns null when the upstream response has no data', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk(null))
    const response = await agent().post('/badgeWon').send({})
    expect(response.status).toBe(200)
    expect(response.body).toEqual({})
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/badgeWon').send({})
    expect(response.status).toBe(500)
  })
})

describe('POST /badgeYetToWin', () => {
  it('processes each badge category and rewrites image paths', async () => {
    const badge = { BadgeImagePath: 'https://gamification.test/img/b.png', name: 'B' }
    mockAxios.post.mockResolvedValue(
      upstreamOk({
        Certifications: [badge],
        Comments: [],
        Content: [],
        'Forum Posts': [],
        'Peer Sharing': [],
        Quizzes: [],
      })
    )
    const response = await agent().post('/badgeYetToWin').send({})
    expect(response.status).toBe(200)
    expect(response.body.Certifications).toEqual([{ BadgeImagePath: '/apis/proxies/v8/img/b.png', name: 'B' }])
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/badgeYetToWin').send({})
    expect(response.status).toBe(500)
  })
})
