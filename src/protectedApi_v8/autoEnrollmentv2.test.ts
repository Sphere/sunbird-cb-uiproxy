/**
 * autoEnrollmentv2.ts — a single route, POST /user, over one axios.get call
 * shape. The whole handler body (extracting courseId/wid/rootOrg/auth and
 * the axios.get call) sits inside one try/catch, so there is no
 * validation-branch or early-return to exercise separately from the
 * success/failure paths.
 *
 * extractUserIdFromRequest and extractUserToken are mocked wholesale: their
 * real implementations fall back to req.session.userId / req.kauth, and
 * mountRouter() installs neither session nor kauth by default. Both calls
 * sit inside the route's try block here, so a real-implementation throw
 * would just be swallowed into the catch branch rather than hang/crash —
 * but mocking them keeps the success-path tests actually exercising the
 * success path. Matches the sibling cohorts.test.ts / catalog.test.ts
 * approach.
 */

jest.mock('axios')
jest.mock('../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    COHORTS_API_BASE: 'https://cohorts.test',
  },
}))

import axios from 'axios'
import { autoEnrollmentApiv2 } from './autoEnrollmentv2'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(autoEnrollmentApiv2)

beforeEach(() => {
  mockAxios.get.mockReset()
})

/**
 * @description Verifies POST /user forwards the upstream autoenrollment
 * response on success, builds the correct upstream URL/headers from the
 * mocked userId/token and the request body, forwards an upstream error
 * status/body on rejection, and falls back to 500 on a transport-level
 * failure with no upstream response.
 */
describe('POST /user', () => {
  it('should forward the upstream status and body on success', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ enrolled: true }))

    const response = await agent()
      .post('/user')
      .send({ courseId: 'course1', rootOrg: 'r1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ enrolled: true })
  })

  it('should request the autoenrollment endpoint built from the extracted userId/courseId with the extracted auth and rootOrg headers', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ enrolled: true }))

    await agent().post('/user').send({ courseId: 'course1', rootOrg: 'r1' })

    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://cohorts.test/v1/autoenrollment/user-1/course1',
      expect.objectContaining({
        headers: {
          Authorization: 'token-1',
          rootOrg: 'r1',
        },
      })
    )
  })

  it('should forward an upstream error status and body', async () => {
    mockAxios.get.mockRejectedValue(upstreamError(409, { error: 'conflict' }))

    const response = await agent()
      .post('/user')
      .send({ courseId: 'course1', rootOrg: 'r1' })

    expect(response.status).toBe(409)
    expect(response.body).toEqual({ error: 'conflict' })
  })

  it('should fall back to 500 with a generic error body on a transport failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())

    const response = await agent()
      .post('/user')
      .send({ courseId: 'course1', rootOrg: 'r1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
