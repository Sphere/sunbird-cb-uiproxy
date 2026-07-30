/**
 * PHASE 1 — user/goals.ts (199 uncovered).
 *
 * Structurally close to user/playlist.ts: axios-proxy endpoints, each guarded
 * by a rootOrg header check, with response shaping delegated to
 * ../../service/goals. Those transforms are mocked as pass-through identity
 * functions — these tests are about the route layer.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../service/goals', () => ({
  formContentRequestObj: jest.fn((x) => x),
  formGoalRequestObj: jest.fn((x) => x),
  formPlaylistupdateObj: jest.fn((x) => x),
  transformGoalUpsertResponse: jest.fn((x) => x),
  transformToCommonGoalGroup: jest.fn((x) => x),
  transformToGoalForOthers: jest.fn((x) => x),
  transformToSbExtPatchRequest: jest.fn((x) => x),
  transformToTrackStatus: jest.fn((x) => x),
  transformToUserGoals: jest.fn((x) => x),
}))
jest.mock('../../utils/env', () => ({ CONSTANTS: { GOALS_API_BASE: 'https://goals.test' } }))

import axios from 'axios'
import { networkError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { goalsApi } from './goals'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(goalsApi)
const withRootOrg = (req: ReturnType<typeof agent>) => req.set('rootOrg', 'r1')

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
  mockAxios.put.mockReset()
  mockAxios.delete.mockReset()
})

describe('GET /updateDurationCommonGoal/:goalType/:goalId', () => {
  it('forwards the updated goal', async () => {
    mockAxios.put.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await withRootOrg(agent().get('/updateDurationCommonGoal/common/g1'))
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/updateDurationCommonGoal/common/g1')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.put.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/updateDurationCommonGoal/common/g1'))
    expect(response.status).toBe(500)
  })
})

describe('POST /share/:goalType/:goalId', () => {
  it('shares the goal', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ shared: true }))
    const response = await withRootOrg(agent().post('/share/common/g1')).send({})
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/share/common/g1').send({})
    expect(response.status).toBe(400)
  })
})

describe('POST /sharev2/:goalType/:goalId', () => {
  it('shares the goal (v2)', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ shared: true }))
    const response = await withRootOrg(agent().post('/sharev2/common/g1')).send({})
    expect(response.status).toBe(200)
  })
})

describe('POST /action/:type/:goalType/:goalId', () => {
  it('performs the action', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ done: true }))
    const response = await withRootOrg(agent().post('/action/accept/common/g1')).send({})
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().post('/action/accept/common/g1').send({})
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().post('/action/accept/common/g1')).send({})
    expect(response.status).toBe(500)
  })
})

describe('GET /action', () => {
  it('returns goals requiring action', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'g1' }]))
    const response = await withRootOrg(agent().get('/action')).query({ sourceFields: 'name' })
    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(1)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/action')
    expect(response.status).toBe(400)
  })
})

describe('GET /common', () => {
  it('returns common goal groups', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'grp1' }]))
    const response = await withRootOrg(agent().get('/common'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ id: 'grp1' }])
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/common'))
    expect(response.status).toBe(500)
  })
})

describe('GET /common/:groupId', () => {
  it('returns the common goal group', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'grp1' }))
    const response = await withRootOrg(agent().get('/common/grp1'))
    expect(response.status).toBe(200)
  })
})

describe('GET /for-others', () => {
  it('returns goals set for others', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'g1' }]))
    const response = await withRootOrg(agent().get('/for-others')).query({ sourceFields: 'name' })
    expect(response.status).toBe(200)
  })
})

describe('GET /track/:goalType/:goalId', () => {
  it('returns the goal track status', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ status: 'inProgress' }))
    const response = await withRootOrg(agent().get('/track/common/g1'))
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/track/common/g1')
    expect(response.status).toBe(400)
  })
})

describe('DELETE /:goalType/:goalId', () => {
  it('deletes the goal', async () => {
    mockAxios.delete.mockResolvedValue(upstreamOk({ deleted: true }))
    const response = await withRootOrg(agent().delete('/common/g1'))
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().delete('/common/g1')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.delete.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().delete('/common/g1'))
    expect(response.status).toBe(500)
  })
})

describe('POST /removeUsers/:goalType/:goalId', () => {
  it('removes users from the goal', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ removed: true }))
    const response = await withRootOrg(agent().post('/removeUsers/common/g1')).send({
      userIds: ['u2'],
    })
    expect(response.status).toBe(200)
  })
})

describe('GET /:type', () => {
  it('returns the user goals of the given type', async () => {
    // Not 'common' or 'action' or 'for-others' — those are registered as
    // fixed routes earlier and would shadow this catch-all.
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'g1' }]))
    const response = await withRootOrg(agent().get('/self')).query({ sourceFields: 'name' })
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().get('/self')
    expect(response.status).toBe(400)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await withRootOrg(agent().get('/self'))
    expect(response.status).toBe(500)
  })
})

describe('DELETE /removeContent/:goalId/:contentId', () => {
  it('removes content from the goal', async () => {
    mockAxios.delete.mockResolvedValue(upstreamOk({ removed: true }))
    const response = await withRootOrg(agent().delete('/removeContent/g1/c1'))
    expect(response.status).toBe(200)
  })

  it('rejects a request missing rootOrg', async () => {
    const response = await agent().delete('/removeContent/g1/c1')
    expect(response.status).toBe(400)
  })
})
