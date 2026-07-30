/**
 * PHASE 2 — AIService.ts. Three routes: a file-upload proxy (`form-data`'s
 * real `FormData` class is used directly — it's pure body-building, no
 * network/module-load side effect requiring a mock), a question-generation
 * proxy, and a two-hop translation pipeline (model-pipeline lookup, then the
 * actual translate call).
 *
 * Real bug found (documented in docs/PROD-VERIFICATION.md, NOT reproduced
 * live): `POST /getQuestions`'s `if (response && response.data) { ... }` has
 * no `else` — if the upstream call succeeds with a falsy `data` (e.g. an
 * empty string body), no response is ever sent and the request hangs.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    DHURVA_BHASHINI_API_BASE: 'https://bhashini.test',
    JUGALBANDI_API_BASE: 'https://jugalbandi.test',
    MEITY_AUTH_ULCACONTRIB: 'https://meity.test',
    PIPE_LINE_ID: 'pipeline-1',
    PIPE_LINE_USER_ID: 'pipeline-user-1',
    ULC_API_KEY: 'ulca-key',
  },
}))

import axios from 'axios'
import { networkError, upstreamError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { aiServiceAPI } from './AIService'

const mockAxios = axios as jest.Mocked<typeof axios>
const agent = () => mountRouter(aiServiceAPI)

function agentWithFile() {
  return mountRouter(aiServiceAPI, {
    // tslint:disable-next-line: no-any
    requestProps: {
      files: { file: { data: Buffer.from('hello'), mimetype: 'text/plain', name: 'a.txt' } },
    } as any,
  })
}

const detailError = () => {
  const error = upstreamError(422, {
    detail: [{ loc: ['body', 'file'], msg: 'field required' }],
  })
  return error
}

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
})

describe('POST /uploadFileAndGetUUID', () => {
  it('uploads the file and returns the generated UUID', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ uuid_number: 'uuid-1' }))
    const response = await agentWithFile().post('/uploadFileAndGetUUID')
    expect(response.status).toBe(200)
    expect(response.body.data).toBe('uuid-1')
  })

  it('rejects a request with no file attached', async () => {
    const response = await agent().post('/uploadFileAndGetUUID')
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('returns 400 with a joined message for a structured upstream validation error', async () => {
    mockAxios.post.mockRejectedValue(detailError())
    const response = await agentWithFile().post('/uploadFileAndGetUUID')
    expect(response.status).toBe(400)
    expect(response.body.error).toContain('body.file field required')
  })

  it('returns 500 for an unstructured upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agentWithFile().post('/uploadFileAndGetUUID')
    expect(response.status).toBe(500)
  })
})

describe('POST /getQuestions', () => {
  it('parses and returns generated questions', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ answer: JSON.stringify({ questions: [{ text: 'Q1?' }] }) }))
    const response = await agent().post('/getQuestions').send({ numQuestions: 3, uuid: 'uuid-1' })
    expect(response.status).toBe(200)
    expect(response.body.data).toEqual([{ text: 'Q1?' }])
  })

  it('rejects a request missing uuid or numQuestions', async () => {
    const response = await agent().post('/getQuestions').send({ uuid: 'uuid-1' })
    expect(response.status).toBe(400)
    expect(mockAxios.get).not.toHaveBeenCalled()
  })

  it('returns 500 when the upstream answer is not valid JSON', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ answer: 'not json' }))
    const response = await agent().post('/getQuestions').send({ numQuestions: 3, uuid: 'uuid-1' })
    expect(response.status).toBe(500)
  })

  it('returns 400 with a joined message for a structured upstream validation error', async () => {
    mockAxios.get.mockRejectedValue(detailError())
    const response = await agent().post('/getQuestions').send({ numQuestions: 3, uuid: 'uuid-1' })
    expect(response.status).toBe(400)
  })

  // NOTE: response.data resolving falsy (e.g. an empty-string body) is a
  // documented hang bug — `if (response && response.data)` has no `else`.
  // Not reproduced live.
})

describe('POST /translate', () => {
  it('runs the pipeline lookup then the translate call', async () => {
    mockAxios.post.mockImplementation((url: string) => {
      if (url.includes('getModelsPipeline')) {
        return Promise.resolve(
          upstreamOk({
            pipelineInferenceAPIEndPoint: { inferenceApiKey: { value: 'auth-token' } },
            pipelineResponseConfig: [{ config: [{ serviceId: 'svc-1' }] }],
          })
        )
      }
      return Promise.resolve(upstreamOk({ translated: true }))
    })
    const response = await agent()
      .post('/translate')
      .send({ source: 'hello', sourceLanguage: 'en', targetLanguage: 'hi' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ translated: true })
  })

  it('rejects a request missing required fields', async () => {
    const response = await agent().post('/translate').send({ source: 'hello' })
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('sends an empty 200 body when the pipeline lookup resolves with no data', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk(''))
    const response = await agent()
      .post('/translate')
      .send({ source: 'hello', sourceLanguage: 'en', targetLanguage: 'hi' })
    expect(response.status).toBe(200)
  })

  it('returns 500 when the pipeline lookup fails', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent()
      .post('/translate')
      .send({ source: 'hello', sourceLanguage: 'en', targetLanguage: 'hi' })
    expect(response.status).toBe(500)
  })

  it('returns 500 when the pipeline response is malformed', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ pipelineInferenceAPIEndPoint: {} }))
    const response = await agent()
      .post('/translate')
      .send({ source: 'hello', sourceLanguage: 'en', targetLanguage: 'hi' })
    expect(response.status).toBe(500)
  })
})
