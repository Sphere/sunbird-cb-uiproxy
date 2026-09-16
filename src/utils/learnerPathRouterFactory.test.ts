/**
 * createLearnerPathRouter — shared factory behind learnerPath.ts and
 * learnerPathV2.ts (CHANGE 29). Exercises the factory directly with an
 * arbitrary apiBase/versionLabel pair to prove the parametrization itself
 * works, independent of either call site's own test file.
 */

jest.mock('axios')
jest.mock('./requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('./env', () => ({
  CONSTANTS: { SB_API_KEY: 'sb-api-key-test' },
}))
jest.mock('./logger', () => ({ logInfo: jest.fn() }))

import axios from 'axios'
import { mountRouter } from '../test-support/mountRouter'
import { upstreamOk } from '../test-support/mockAxios'
import { createLearnerPathRouter } from './learnerPathRouterFactory'
import { logInfo } from './logger'

const mockAxiosCallable = axios as unknown as jest.Mock
const mockLogInfo = logInfo as jest.Mock

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockLogInfo.mockReset()
})

/**
 * @description Verifies the factory forwards apiBase into the upstream URL
 * and versionLabel into the log messages, for a version distinct from either
 * production call site.
 */
it('builds a router that calls the given apiBase and logs with the given versionLabel', async () => {
  mockAxiosCallable.mockResolvedValue(upstreamOk({ path: ['x'] }))
  const router = createLearnerPathRouter('https://custom-base.test', ' custom')

  const response = await mountRouter(router).get('/').query({ userId: 'user-1' })

  expect(response.status).toBe(200)
  expect(response.body).toEqual({ data: { path: ['x'] }, status: 'SUCCESS' })
  expect(mockAxiosCallable).toHaveBeenCalledWith(
    expect.objectContaining({ url: 'https://custom-base.test/learnerpath' })
  )
  expect(mockLogInfo).toHaveBeenCalledWith('***********  learner path custom')
})

/**
 * @description Concurrency: learnerPath.ts and learnerPathV2.ts each call
 * createLearnerPathRouter once at module load with their own apiBase, so
 * there's no shared mutable state between them (apiBase is captured in each
 * router's own closure). This fires concurrent requests against BOTH
 * routers at once, with axios routing its response by the requested URL,
 * and confirms each router's response only ever reflects its OWN apiBase —
 * never the other router's.
 */
it('concurrent requests against two independently-created routers never cross-route', async () => {
  mockAxiosCallable.mockImplementation((config) => {
    if (config.url.startsWith('https://v1-base.test')) {
      return Promise.resolve(upstreamOk({ path: ['v1-step'] }))
    }
    return Promise.resolve(upstreamOk({ path: ['v2-step'] }))
  })
  const routerV1 = createLearnerPathRouter('https://v1-base.test', ' v1')
  const routerV2 = createLearnerPathRouter('https://v2-base.test', ' v2')

  const [responseV1, responseV2] = await Promise.all([
    mountRouter(routerV1).get('/').query({ userId: 'user-1' }),
    mountRouter(routerV2).get('/').query({ userId: 'user-1' }),
  ])

  expect(responseV1.body).toEqual({ data: { path: ['v1-step'] }, status: 'SUCCESS' })
  expect(responseV2.body).toEqual({ data: { path: ['v2-step'] }, status: 'SUCCESS' })
})
