/**
 * PHASE 1 — user/code.ts.
 *
 * Two axios call shapes: axios.post() (execute()) and the callable
 * `axios({...})` form (verifySubmit(), viewLastSubmission()). All three
 * helpers SWALLOW their own axios errors internally (catch -> logError ->
 * return {}) rather than rethrowing, so the routes' own catch/500-fallback
 * blocks are unreachable via an upstream failure — the request still
 * succeeds with 200 and an empty body. That's documented per-route below
 * rather than treated as a bug: it's safe to exercise live (each helper
 * resolves exactly once, so there is no double-send risk), it just means
 * those catch branches show as uncovered.
 *
 * checkForBlockedStatement() is a pure function tested directly as well as
 * through both routes that call it (POST /execute and
 * POST /:group/:action/:contentId) — in both routes it runs BEFORE any
 * header validation, and returns via an explicit `return` after
 * res.status(200).send(...), so no double-send risk there either.
 */

jest.mock('axios')
jest.mock('../../utils/logger', () => ({ logError: jest.fn() }))
jest.mock('../../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
}))
jest.mock('../../utils/env', () => ({
  CONSTANTS: {
    IAP_CLIENT_SECRET: 'secret',
    IAP_CODE_API_BASE: 'https://code.test',
    SUBMISSION_API_BASE: 'https://submission.test',
  },
  RESTRICTED_PYTHON_STMT: ['os\\.system'],
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../../test-support/mockAxios'
import { mountRouter } from '../../test-support/mountRouter'
import { checkForBlockedStatement, codeApi, execute, verifySubmit, viewLastSubmission } from './code'

const mockAxiosMethods = axios as jest.Mocked<typeof axios>
const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(codeApi)
const withOrgHeaders = (req: ReturnType<typeof agent>) => req.set('org', 'o1').set('rootOrg', 'r1')

beforeEach(() => {
  mockAxiosMethods.post.mockReset()
  mockAxiosCallable.mockReset()
})

// execute()/verifySubmit() type their body param as `Response['body']` (the
// DOM Response's ReadableStream body) rather than a request-body shape —
// almost certainly a copy/paste type error in the source, but code.ts is
// off-limits here, so the test casts through `any` to supply a plain object.
// tslint:disable: no-any

describe('execute (exported helper)', () => {
  it('returns the upstream response data', async () => {
    mockAxiosMethods.post.mockResolvedValue(upstreamOk({ output: 'hello' }))
    await expect(execute({ code: 'print(1)' } as any)).resolves.toEqual({ output: 'hello' })
  })

  it('resolves to {} when the upstream call fails', async () => {
    mockAxiosMethods.post.mockRejectedValue(networkError())
    await expect(execute({ code: 'print(1)' } as any)).resolves.toEqual({})
  })

  it('resolves to {} when the upstream response has no data', async () => {
    mockAxiosMethods.post.mockResolvedValue(upstreamOk(undefined))
    await expect(execute({ code: 'print(1)' } as any)).resolves.toEqual({})
  })
})

describe('verifySubmit (exported helper)', () => {
  it('posts to the resolved verify/submit endpoint and returns the response data', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: 'ok' }))
    await expect(
      verifySubmit('fpVerify', 'lex1', 'u1', { code: 'x' } as any, 'r1')
    ).resolves.toEqual({
      result: 'ok',
    })
  })

  it('resolves to {} when the upstream call fails', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    await expect(verifySubmit('fpVerify', 'lex1', 'u1', {} as any, 'r1')).resolves.toEqual({})
  })
})

describe('viewLastSubmission (exported helper)', () => {
  it('rewrites submission_url on each item in the response', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({ response: [{ submission_url: 'http://private-abc/file.zip' }] })
    )
    // tslint:disable-next-line: no-any
    const result = (await viewLastSubmission('lex1', 'u1', 'r1')) as any
    expect(result.response[0].submission_url).toBe('/apis/proxies/v8/file.zip')
  })

  it('resolves to {} when the upstream call fails', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    await expect(viewLastSubmission('lex1', 'u1', 'r1')).resolves.toEqual({})
  })

  it('resolves to {} when the response payload has no .response array (forEach throws, caught internally)', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({}))
    await expect(viewLastSubmission('lex1', 'u1', 'r1')).resolves.toEqual({})
  })
})

describe('checkForBlockedStatement', () => {
  it('returns null when the language is not the restricted one (16)', () => {
    expect(checkForBlockedStatement({ body: { code: 'os.system("ls")', language: 1 } })).toBeNull()
  })

  it('returns null when the code contains no restricted statements', () => {
    expect(checkForBlockedStatement({ body: { code: 'print(1)', language: 16 } })).toBeNull()
  })

  it('returns a forbidden-statement payload when the code matches a restricted pattern', () => {
    const result = checkForBlockedStatement({ body: { code: 'os.system("ls")', language: 16 } })
    expect(result).toMatchObject({
      code: 'os.system("ls")',
      errors: 'Forbidden statements found in the code',
      langid: 16,
    })
  })
})

describe('POST /execute', () => {
  it('rejects code with a forbidden statement without calling upstream', async () => {
    const response = await agent().post('/execute').send({ code: 'os.system("ls")', language: 16 })
    expect(response.status).toBe(200)
    expect(response.body.errors).toBe('Forbidden statements found in the code')
    expect(mockAxiosMethods.post).not.toHaveBeenCalled()
  })

  it('executes and returns the upstream result', async () => {
    mockAxiosMethods.post.mockResolvedValue(upstreamOk({ output: '1' }))
    const response = await agent().post('/execute').send({ code: 'print(1)', language: 1 })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ output: '1' })
  })

  // execute() swallows axios errors internally and resolves to {} — see file
  // header comment. Safe to run live.
  it('still responds 200 with {} when the upstream call fails', async () => {
    mockAxiosMethods.post.mockRejectedValue(networkError())
    const response = await agent().post('/execute').send({ code: 'print(1)', language: 1 })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({})
  })
})

describe('GET /viewLastSubmission/:contentId', () => {
  it('rejects a request missing org/rootOrg headers', async () => {
    const response = await agent().get('/viewLastSubmission/c1')
    expect(response.status).toBe(400)
  })

  it('returns the last submission with rewritten submission urls', async () => {
    mockAxiosCallable.mockResolvedValue(
      upstreamOk({ response: [{ submission_url: 'http://private-abc/f.zip' }] })
    )
    const response = await withOrgHeaders(agent().get('/viewLastSubmission/c1'))
    expect(response.status).toBe(200)
    expect(response.body.response[0].submission_url).toBe('/apis/proxies/v8/f.zip')
  })

  // viewLastSubmission() swallows axios errors internally and resolves to {}
  // — see file header comment. Safe to run live.
  it('still responds 200 with {} when the upstream call fails', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await withOrgHeaders(agent().get('/viewLastSubmission/c1'))
    expect(response.status).toBe(200)
    expect(response.body).toEqual({})
  })
})

describe('POST /:group/:action/:contentId', () => {
  it('rejects code with a forbidden statement before checking headers', async () => {
    const response = await agent().post('/fp/verify/c1').send({ code: 'os.system("ls")', language: 16 })
    expect(response.status).toBe(200)
    expect(response.body.errors).toBe('Forbidden statements found in the code')
  })

  it('rejects a request missing org/rootOrg headers', async () => {
    const response = await agent().post('/fp/verify/c1').send({ code: 'print(1)', language: 1 })
    expect(response.status).toBe(400)
  })

  it('verifies fp code and returns the upstream result', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: 'pass' }))
    const response = await withOrgHeaders(agent().post('/fp/verify/c1')).send({
      code: 'print(1)',
      language: 1,
    })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ result: 'pass' })
  })

  it('submits ce code and returns the upstream result', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ result: 'submitted' }))
    const response = await withOrgHeaders(agent().post('/ce/submit/c1')).send({})
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ result: 'submitted' })
  })

  // verifySubmit() swallows axios errors internally and resolves to {} —
  // see file header comment. Safe to run live.
  it('still responds 200 with {} when the upstream call fails', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await withOrgHeaders(agent().post('/fp/verify/c1')).send({
      code: 'print(1)',
      language: 1,
    })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({})
  })
})
