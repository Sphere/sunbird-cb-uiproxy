/**
 * PHASE 2 — user/exercise.ts. Four routes; the last one uses `form-data`'s
 * own `.submit()` (a raw Node HTTP call, not axios) rather than the usual
 * axios-proxy shape — `form-data` is mocked below.
 *
 * TWO real bugs found while reading this file (documented in
 * docs/PROD-VERIFICATION.md, NOT reproduced live):
 *  - `POST /createContentDirectory/:contentId`'s success path does
 *    `res.status(response.status)` with NO `.send()`/`.json()`/`.end()` —
 *    the response is never completed, so the request hangs forever on
 *    every successful call. Only the failure path (which DOES complete via
 *    the catch block) is tested live here.
 *  - `POST /uploadFileToContentDirectory/:contentId`'s `formData.submit(url,
 *    (err, response) => {...})` callback reads `response.statusCode` before
 *    checking whether `err` is set — if the submit itself fails at the
 *    transport level (`err` truthy, `response` undefined), this throws
 *    inside a plain Node callback with no surrounding try/catch (the outer
 *    try only protects the synchronous setup before `.submit()` is called),
 *    which is very likely an uncaught exception at the process level. Not
 *    reproduced live; the live tests here only mock `.submit()` to call back
 *    with a defined `response` object.
 */

jest.mock('axios')
jest.mock('form-data', () =>
  jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    submit: jest.fn(),
  }))
)
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    CONTENT_API_BASE: 'https://content.test',
    SB_EXT_API_BASE_3: 'https://ext3.test',
    SUBMISSION_API_BASE: 'https://submission.test',
  },
}))

import axios from 'axios'
import FormData from 'form-data'
import { networkError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { exerciseApi } from './exercise'

const mockAxios = axios as jest.Mocked<typeof axios>
const mockFormDataInstance = (FormData as unknown as jest.Mock).mock.results

const agent = () => mountRouter(exerciseApi)

function agentWithFile() {
  return mountRouter(exerciseApi, {
    // tslint:disable-next-line: no-any
    requestProps: { files: { file: { data: Buffer.from('x'), mimetype: 'image/png', name: 'a.png' } } } as any,
  })
}

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
  mockFormDataInstance.length = 0
})

/**
 * @description Verifies the GET /getSubmissions route forwards submissions
 * with the private-content-service URL rewritten to the proxy path, and
 * returns 500 on an upstream failure.
 */
describe('GET /getSubmissions', () => {
  it('should forward submissions with processed URLs', async () => {
    mockAxios.get.mockResolvedValue(
      upstreamOk({ response: [{ submission_url: 'http://private-content-service/a.png' }] })
    )
    const response = await agent().get('/getSubmissions?contentId=c1&type=file')
    expect(response.status).toBe(200)
    expect(response.body.response[0].submission_url).toBe('/apis/proxies/v8/a.png')
  })

  it('should return 500 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/getSubmissions?contentId=c1&type=file')
    expect(response.status).toBe(500)
  })
})

/**
 * @description Verifies the POST /postsubmission/:contentId route forwards
 * the submission on success and returns 500 on an upstream failure.
 */
describe('POST /postsubmission/:contentId', () => {
  it('should forward the submission', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ id: 's1' }))
    const response = await agent().post('/postsubmission/c1').send({ answer: 'x' })
    expect(response.status).toBe(200)
  })

  it('should return 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/postsubmission/c1').send({ answer: 'x' })
    expect(response.status).toBe(500)
  })
})

/**
 * @description Verifies the POST /createContentDirectory/:contentId route
 * returns 500 on an upstream failure; the success path is not exercised live
 * because it never completes the response (a documented hang bug).
 */
describe('POST /createContentDirectory/:contentId', () => {
  it('should return 500 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/createContentDirectory/c1').send({})
    expect(response.status).toBe(500)
  })

  // NOTE: the success path never calls res.send()/res.end() — a documented
  // hang bug — not reproduced live.
})

/**
 * @description Verifies the POST /uploadFileToContentDirectory/:contentId
 * route rejects requests with no file attached, and otherwise submits the
 * file via form-data and relays the upstream's parsed JSON body — including
 * the generic error body fallback when the upstream responds non-200.
 */
describe('POST /uploadFileToContentDirectory/:contentId', () => {
  it('should reject a request with no file attached', async () => {
    const response = await agent().post('/uploadFileToContentDirectory/c1')
    expect(response.status).toBe(500)
  })

  it('should submit the file and return the parsed JSON response on 200', async () => {
    // tslint:disable-next-line: no-any
    const submit = jest.fn((_url: string, cb: (err: any, res: any) => void) => {
      const fakeResponse = {
        // tslint:disable-next-line: no-any
        on: (event: string, listener: (data: any) => void) => {
          if (event === 'data') listener(Buffer.from(JSON.stringify({ ok: true })))
        },
        statusCode: 200,
      }
      cb(null, fakeResponse)
    })
    ;(FormData as unknown as jest.Mock).mockImplementation(() => ({ append: jest.fn(), submit }))

    const response = await agentWithFile().post('/uploadFileToContentDirectory/c1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it('should send the generic error body when the upstream responds non-200', async () => {
    // tslint:disable-next-line: no-any
    const submit = jest.fn((_url: string, cb: (err: any, res: any) => void) => {
      cb(null, { on: jest.fn(), statusCode: 400 })
    })
    ;(FormData as unknown as jest.Mock).mockImplementation(() => ({ append: jest.fn(), submit }))

    const response = await agentWithFile().post('/uploadFileToContentDirectory/c1')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ error: 'Failed due to unknown reason' })
  })

  // NOTE: `.submit()` calling back with a truthy `err` and no `response` is a
  // documented uncaught-exception risk (the callback reads response.statusCode
  // before checking err) — not reproduced live.
})
