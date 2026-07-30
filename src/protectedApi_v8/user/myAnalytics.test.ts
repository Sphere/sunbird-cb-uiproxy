/**
 * PHASE 1 — user/myAnalytics.ts (232 uncovered, 869 lines / 30+ endpoints).
 *
 * Overwhelmingly one shape: axios.get/post/delete a fixed LA1 API path with
 * auth/org headers forwarded, response passed through (occasionally with a
 * field renamed, e.g. /assessments renames `assessments` to `achievements`).
 * Covers a broad, representative subset rather than all 30+ endpoints —
 * chosen to include every distinct response-shaping variant found in this
 * file (plain pass-through, field-rename, query-param building, DELETE).
 */

jest.mock('axios')
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: { HTTPS_HOST: 'https://auth.test/', MY_ANALYTICS_VALIDATOR_URL: 'https://validator.test' },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { myAnalyticsApi } from './myAnalytics'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(myAnalyticsApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
  mockAxios.delete.mockReset()
})

describe('GET /assessments', () => {
  it('renames assessments to achievements', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ assessments: [{ id: 'a1' }] }))
    const response = await agent().get('/assessments')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ achievements: [{ id: 'a1' }] })
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/assessments')
    expect(response.status).toBe(500)
  })
})

describe('GET /certification', () => {
  it('renames certifications to achievements', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ certifications: [{ id: 'c1' }] }))
    const response = await agent().get('/certification')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ achievements: [{ id: 'c1' }] })
  })
})

describe('GET /skills', () => {
  it('forwards the skills list', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ skill: 'JS' }]))
    const response = await agent().get('/skills')
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ skill: 'JS' }])
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/skills')
    expect(response.status).toBe(500)
  })
})

describe('GET /myskills', () => {
  it('forwards the acquired skills for the token user', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ skill: 'React' }]))
    const response = await agent().get('/myskills')
    expect(response.status).toBe(200)
  })

  it('uses an explicit wid query param when provided', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([]))
    const response = await agent().get('/myskills').query({ wid: 'other-user' })
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ wid: 'other-user' }) })
    )
  })
})

describe('GET /recommendedSkills', () => {
  it('forwards recommended skills', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ skill: 'Go' }]))
    const response = await agent().get('/recommendedSkills')
    expect(response.status).toBe(200)
  })
})

describe('GET /allSkills', () => {
  it('forwards all skills with query params', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ skill: 'Rust' }]))
    const response = await agent().get('/allSkills').query({ category: 'tech', pageNo: 1 })
    expect(response.status).toBe(200)
  })
})

describe('GET /isAdmin', () => {
  it('forwards the admin status', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ isAdmin: true }))
    const response = await agent().get('/isAdmin')
    expect(response.status).toBe(200)
  })
})

describe('GET /role/get', () => {
  it('forwards the roles', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ role: 'ADMIN' }]))
    const response = await agent().get('/role/get')
    expect(response.status).toBe(200)
  })
})

describe('GET /skillquotient', () => {
  it('forwards the skill quotient', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ quotient: 80 }))
    const response = await agent().get('/skillquotient')
    expect(response.status).toBe(200)
  })
})

describe('GET /rolequotient', () => {
  it('forwards the role quotient', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ quotient: 70 }))
    const response = await agent().get('/rolequotient')
    expect(response.status).toBe(200)
  })
})

describe('GET /skills-role/:roleId', () => {
  it('forwards the role skill breakdown', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ skills: [] }))
    const response = await agent().get('/skills-role/role-1')
    expect(response.status).toBe(200)
  })
})

describe('GET /role/getExisting', () => {
  it('forwards the existing roles', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ role: 'MEMBER' }]))
    const response = await agent().get('/role/getExisting')
    expect(response.status).toBe(200)
  })
})

describe('POST /role/add', () => {
  it('adds a role', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ added: true }))
    const response = await agent().post('/role/add').send({ role: 'ADMIN' })
    expect(response.status).toBe(200)
  })

  it('returns 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/role/add').send({})
    expect(response.status).toBe(500)
  })
})

describe('POST /skills/add', () => {
  it('adds a skill', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ added: true }))
    const response = await agent().post('/skills/add').send({ skill: 'JS' })
    expect(response.status).toBe(200)
  })
})

describe('POST /role/shareRole', () => {
  it('shares the role', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ shared: true }))
    const response = await agent().post('/role/shareRole').send({})
    expect(response.status).toBe(200)
  })
})

describe('GET /skill/search', () => {
  it('searches skills', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ skill: 'JS' }]))
    const response = await agent().get('/skill/search').query({ q: 'j' })
    expect(response.status).toBe(200)
  })
})

describe('GET /role/delete', () => {
  it('deletes the role', async () => {
    mockAxios.delete.mockResolvedValue(upstreamOk({ deleted: true }))
    const response = await agent().get('/role/delete')
    expect(response.status).toBe(200)
  })
})

describe('POST /role/update', () => {
  it('updates the role', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ updated: true }))
    const response = await agent().post('/role/update').send({})
    expect(response.status).toBe(200)
  })
})

describe('GET /isApprover', () => {
  it('forwards the approver status', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ isApprover: false }))
    const response = await agent().get('/isApprover')
    expect(response.status).toBe(200)
  })
})

describe('GET /skillData', () => {
  it('forwards skill data', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ data: [] }))
    const response = await agent().get('/skillData').query({ skill: 'JS' })
    expect(response.status).toBe(200)
  })
})

describe('GET /search', () => {
  it('forwards search results', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ results: [] }))
    const response = await agent().get('/search').query({ q: 'x' })
    expect(response.status).toBe(200)
  })
})

describe('GET /projectEndorsement/getList', () => {
  it('forwards the endorsement list', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'p1' }]))
    const response = await agent().get('/projectEndorsement/getList')
    expect(response.status).toBe(200)
  })
})

describe('GET /projectEndorsement/get', () => {
  it('forwards a single endorsement', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ id: 'p1' }))
    const response = await agent().get('/projectEndorsement/get')
    expect(response.status).toBe(200)
  })
})

describe('POST /projectEndorsement/endorseRequest', () => {
  it('submits an endorse request', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ requested: true }))
    const response = await agent().post('/projectEndorsement/endorseRequest').send({})
    expect(response.status).toBe(200)
  })
})

describe('POST /projectEndorsement/add', () => {
  it('adds a project endorsement', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ added: true }))
    const response = await agent().post('/projectEndorsement/add').send({})
    expect(response.status).toBe(200)
  })
})
