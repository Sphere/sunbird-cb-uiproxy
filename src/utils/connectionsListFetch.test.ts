/**
 * fetchConnectionsList — shared GET-route body behind network.ts's and
 * connections_v2.ts's 5 near-identical connections-list routes (CHANGE 33).
 * Exercised directly here, independent of either call site's own test file.
 */

jest.mock('axios')
jest.mock('./requestExtract', () => ({
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('./env', () => ({
  CONSTANTS: { SB_API_KEY: 'sb-api-key-test' },
}))

import axios from 'axios'
import { fetchConnectionsList } from './connectionsListFetch'

const mockAxiosGet = axios.get as jest.Mock

function mockReqRes(rootorg?: string) {
  const req: any = { headers: { rootorg }, header: jest.fn() }
  const res: any = { send: jest.fn(), status: jest.fn(() => res) }
  return { req, res }
}

beforeEach(() => {
  mockAxiosGet.mockReset()
})

/**
 * @description Verifies a 400 with ERROR_NO_ORG_DATA is sent, and the
 * endpoint is never called, when rootOrg is missing.
 */
it('returns 400 without calling the endpoint when rootOrg is missing', async () => {
  const { req, res } = mockReqRes(undefined)

  await fetchConnectionsList(req, res, 'https://kong.test/connections/requested', 'user-1')

  expect(res.status).toHaveBeenCalledWith(400)
  expect(mockAxiosGet).not.toHaveBeenCalled()
})

/**
 * @description Verifies a 400 with GENERAL_ERR_MSG is sent, and the
 * endpoint is never called, when userId is undefined.
 */
it('returns 400 without calling the endpoint when userId is missing', async () => {
  const { req, res } = mockReqRes('org-1')

  await fetchConnectionsList(req, res, 'https://kong.test/connections/requested', undefined)

  expect(res.status).toHaveBeenCalledWith(400)
  expect(mockAxiosGet).not.toHaveBeenCalled()
})

/**
 * @description Verifies a successful fetch calls the given endpoint with
 * the rootOrg/userId/auth-token headers and sends the upstream data.
 */
it('fetches the endpoint and sends the upstream data when rootOrg and userId are present', async () => {
  mockAxiosGet.mockResolvedValue({ data: { connections: ['a', 'b'] } })
  const { req, res } = mockReqRes('org-1')

  await fetchConnectionsList(req, res, 'https://kong.test/connections/requested', 'user-1')

  expect(mockAxiosGet).toHaveBeenCalledWith(
    'https://kong.test/connections/requested',
    expect.objectContaining({
      headers: expect.objectContaining({
        rootOrg: 'org-1',
        userId: 'user-1',
      }),
    })
  )
  expect(res.send).toHaveBeenCalledWith({ connections: ['a', 'b'] })
})

/**
 * @description Concurrency: this helper is shared between network.ts and
 * connections_v2.ts, whose routes can receive requests for different
 * users/endpoints at the same time. Fires 2 concurrent fetches with axios
 * routing its response by the requested endpoint, and confirms each
 * response goes to its OWN res object with its OWN data — never the other
 * call's.
 */
it('concurrent fetches for different endpoints never cross-send to the wrong response', async () => {
  mockAxiosGet.mockImplementation((url) =>
    Promise.resolve({ data: url.includes('requested') ? { kind: 'requested' } : { kind: 'suggests' } })
  )
  const a = mockReqRes('org-1')
  const b = mockReqRes('org-1')

  await Promise.all([
    fetchConnectionsList(a.req, a.res, 'https://kong.test/connections/requested', 'user-a'),
    fetchConnectionsList(b.req, b.res, 'https://kong.test/connections/suggests', 'user-b'),
  ])

  expect(a.res.send).toHaveBeenCalledWith({ kind: 'requested' })
  expect(b.res.send).toHaveBeenCalledWith({ kind: 'suggests' })
})
