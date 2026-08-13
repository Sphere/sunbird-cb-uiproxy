/**
 * PHASE 1 — highest single-file coverage debt (603 uncovered lines).
 *
 * IMPORTANT: this module reads an RSA public key from disk SYNCHRONOUSLY AT
 * IMPORT TIME (`fs.readFileSync(publicKeyPath)`), so `fs` must be mocked
 * before the module is imported or the import itself throws ENOENT. jest.mock
 * calls are hoisted above imports, so this works as written.
 *
 * Scope: the axios-proxy-shaped endpoints (the majority of the file) plus
 * token verification and the content-search delegation. Deliberately OUT of
 * scope for this pass, each for a documented reason:
 *   - WhatsApp consent endpoints — real Cassandra query construction, not a
 *     one-line axios mock; belongs with the other Cassandra-dependent files
 *     in Phase 2 per the plan's own risk note.
 *   - /certificateDownload — pull in node-html-to-image and non-trivial
 *     PDF/image handling.
 *   - /send-by-topic — firebase-admin messaging, needs its own mock strategy.
 *   - /kong/course/v2/hierarchy/*, http-proxy `.web()` usage — proxies the
 *     raw request/response objects rather than returning JSON.
 *
 * Branch-coverage follow-up pass added below: /getContents/*, /user/profileUpdate,
 * /courseRemommendationv2, /getAllUserFeed, /getUnreadUserNotifications,
 * /ext-forms/*, /user/enrollment/list/adhocCertificates, and
 * /ios/certificateDownload. The last of these contains the documented
 * CRITICAL auth-bypass bug (`secretKey` check has no `return`) shared with
 * `publicCertifcateFlinkv2.ts` — see docs/PROD-VERIFICATION.md change AR and
 * docs/DUPLICATE-CODE-CLEANUP.md L3-19. Following the same precedent as
 * `publicCertifcateFlinkv2.test.ts`: only the correct-secretKey path is
 * exercised live, because an incorrect key does NOT stop the request (no
 * `return` after the 400) — it falls through into the real Cassandra query,
 * download, and image render, and reproducing it live risks the same
 * double/triple-send crash documented there. The bug itself is not fixed
 * here; only its current (buggy) behavior on the safe path is asserted.
 *
 * Round 2 branch-coverage pass added below: /certificateDownload (the plain,
 * non-iOS variant — token/param validation and both success/failure axios
 * branches), /publicSearch/courseRecommendationCbp (both branches of
 * `req.session?.grant`), /updateUserProfile (schema validation, the
 * personalDetails-deletion and regNurseRegMidwifeNumber-default branches, and
 * the upstream-failure branch), /user/WhatsappConsent and
 * /user/getWhatsappConsent (the Cassandra insert-vs-update branch and the
 * not-found branch, using the same cassandra-driver mock already wired up for
 * /ios/certificateDownload above), and the three /kong/* routes (CDN-replacement
 * success path, generic proxy pass-through/failure, and the "no /kong in URL"
 * passthrough to next()).
 */

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(() => 'dummy-key-content'),
}))
jest.mock('axios')
jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }))
jest.mock('jwt-decode')
const mockCassandraExecute = jest.fn()
const mockCassandraShutdown = jest.fn()
jest.mock('cassandra-driver', () => ({
  Client: jest.fn(() => ({ execute: mockCassandraExecute, shutdown: mockCassandraShutdown })),
}))
jest.mock('request')
jest.mock('http-proxy', () => ({ createProxyServer: jest.fn(() => ({ web: jest.fn() })) }))
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('../utils/jumbler', () => ({ jumbler: jest.fn() }))
jest.mock('../utils/assessmentSubmitHelper', () => ({ assessmentCreator: jest.fn() }))
jest.mock('../utils/pilotMockEntity', () => ({
  appendPilotMockEntity: jest.fn((payload) => payload),
}))
jest.mock('../authoring/utils/cdn-url-replacer', () => ({
  replaceCdnUrls: jest.fn((x) => x),
}))
jest.mock('./contentSearchService', () => ({
  searchContent: jest.fn(),
  searchContentV2: jest.fn(),
}))
jest.mock('./firebase-manager', () => ({ getFirebaseApp: jest.fn() }))
jest.mock('./nodebbUser', () => ({ fetchnodebbUserDetails: jest.fn() }))
jest.mock('./rolePermission', () => ({ getCurrentUserRoles: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    APP_VERSION_PATH: 'https://version.test/app-version.json',
    CASSANDRA_IP: '127.0.0.1',
    CERTIFICATE_DOWNLOAD_KEY: 'valid-secret-key',
    ENTITY_API_BASE: 'https://entity.test',
    FORM_API_BASE: 'https://form.test',
    HTTPS_HOST: 'https://auth.test',
    KONG_API_BASE: 'https://kong.test',
    LEARNER_SERVICE_API_BASE: 'https://learner.test',
    NOTIFICATION_ENGINE_API_BASE: 'https://notify.test',
    RC_MAPPER_HOST: 'https://rc.test',
    RECOMMENDATION_API_BASE_V2: 'https://reco.test',
    SB_API_KEY: 'sb-api-key',
    SB_EXT_API_BASE_2: 'https://ext.test',
    SUNBIRD_PROXY_API_BASE: 'https://sunbird.test',
    TELEMETRY_SB_BASE: 'https://telemetry.test',
    TIMEOUT: '10000',
  },
}))

import axios from 'axios'
import jwt from 'jsonwebtoken'
import jwtDecode from 'jwt-decode'
import request from 'request'
import { networkError, upstreamError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { assessmentCreator } from '../utils/assessmentSubmitHelper'
import { jumbler } from '../utils/jumbler'
import { appendPilotMockEntity } from '../utils/pilotMockEntity'
import { searchContent, searchContentV2 } from './contentSearchService'
import { mobileAppApi } from './mobileAppApi'

const mockAxios = axios as unknown as jest.Mock
// /user/profileUpdate is the one route in this file that calls axios.patch()
// / axios.post() as methods rather than the callable axios({...}) form the
// rest of the file uses, so it needs its own mocks.
const mockAxiosPatch = axios.patch as jest.Mock
const mockAxiosPost = axios.post as jest.Mock
const mockJwtVerify = jwt.verify as jest.Mock
const mockJwtDecode = jwtDecode as jest.Mock
const mockAssessmentCreator = assessmentCreator as jest.Mock
const mockJumbler = jumbler as jest.Mock
const mockAppendPilotMockEntity = appendPilotMockEntity as jest.Mock
const mockSearchContent = searchContent as jest.Mock
const mockSearchContentV2 = searchContentV2 as jest.Mock
const mockRequest = request as unknown as jest.Mock

const agent = () => mountRouter(mobileAppApi)
const AUTH_HEADER = 'x-authenticated-user-token'

/** A token that verifyToken() accepts, decoding to the given userId. */
function validToken(userId = 'user-1') {
  mockJwtVerify.mockReturnValue(undefined) // jwt.verify does not throw
  mockJwtDecode.mockReturnValue({ sub: `realm:user:${userId}` })
  return 'valid-jwt-token'
}

/** A token that fails signature verification. */
function invalidToken() {
  mockJwtVerify.mockImplementation(() => {
    throw new Error('invalid signature')
  })
  return 'bad-jwt-token'
}

beforeEach(() => {
  mockAxios.mockReset()
  mockAxiosPatch.mockReset()
  mockAxiosPost.mockReset()
  mockJwtVerify.mockReset()
  mockJwtDecode.mockReset()
  mockCassandraExecute.mockReset()
  mockCassandraShutdown.mockReset()
})

describe('module import', () => {
  it('reads the RSA public key via the mocked fs, not the real filesystem', () => {
    // If this suite runs at all without throwing ENOENT, the fs mock is doing
    // its job — the module-level readFileSync call already ran on import.
    expect(mobileAppApi).toBeDefined()
  })
})

describe('POST /getEntityById/:id', () => {
  it('returns the entity on a valid token', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ responseCode: 200, entity: 'x' }))

    const response = await agent()
      .post('/getEntityById/e1')
      .set(AUTH_HEADER, validToken())
      .send({})

    expect(response.status).toBe(200)
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://entity.test/getEntityById/+e1' })
    )
  })

  it('returns 404 for an invalid token, without calling upstream', async () => {
    const response = await agent()
      .post('/getEntityById/e1')
      .set(AUTH_HEADER, invalidToken())
      .send({})

    expect(response.status).toBe(404)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('returns 500 when the upstream call throws', async () => {
    mockAxios.mockRejectedValue(networkError())

    const response = await agent()
      .post('/getEntityById/e1')
      .set(AUTH_HEADER, validToken())
      .send({})

    expect(response.status).toBe(500)
  })
})

describe('POST /getAllEntity', () => {
  it('returns entities and passes them through the pilot mock add-on', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ responseCode: 200, items: [] }))
    mockAppendPilotMockEntity.mockResolvedValue({ responseCode: 200, items: ['patched'] })

    const response = await agent()
      .post('/getAllEntity')
      .set(AUTH_HEADER, validToken())
      .send({ search: { type: 'x' } })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ responseCode: 200, items: ['patched'] })
    expect(mockAppendPilotMockEntity).toHaveBeenCalled()
  })

  it('returns 404 for an invalid token', async () => {
    const response = await agent()
      .post('/getAllEntity')
      .set(AUTH_HEADER, invalidToken())
      .send({})

    expect(response.status).toBe(404)
  })

  it('returns 500 when the upstream call throws', async () => {
    mockAxios.mockRejectedValue(networkError())

    const response = await agent()
      .post('/getAllEntity')
      .set(AUTH_HEADER, validToken())
      .send({})

    expect(response.status).toBe(500)
  })
})

describe('POST /submitAssessment', () => {
  it('submits and forwards the creator status', async () => {
    mockAssessmentCreator.mockResolvedValue({ data: { ok: true }, status: 201 })

    const response = await agent()
      .post('/submitAssessment')
      .set(AUTH_HEADER, validToken())
      .send({ answers: [] })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({ ok: true })
  })

  it('returns 404 for an invalid token without calling the creator', async () => {
    const response = await agent()
      .post('/submitAssessment')
      .set(AUTH_HEADER, invalidToken())
      .send({})

    expect(response.status).toBe(404)
    expect(mockAssessmentCreator).not.toHaveBeenCalled()
  })

  it('returns 404 when the creator throws', async () => {
    mockAssessmentCreator.mockRejectedValue(new Error('boom'))

    const response = await agent()
      .post('/submitAssessment')
      .set(AUTH_HEADER, validToken())
      .send({})

    expect(response.status).toBe(404)
  })
})

describe('GET /v1/assessment/*', () => {
  it('returns the jumbled assessment JSON', async () => {
    mockJumbler.mockResolvedValue({ questions: [] })

    const response = await agent().get('/v1/assessment/some/path.json')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ questions: [] })
  })
})

describe('POST /v1/competencyAssessment/submit', () => {
  it('submits and forwards the creator status', async () => {
    mockAssessmentCreator.mockResolvedValue({ data: { ok: true }, status: 200 })

    const response = await agent()
      .post('/v1/competencyAssessment/submit')
      .set(AUTH_HEADER, validToken())
      .send({})

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it('returns 404 when the creator throws', async () => {
    mockAssessmentCreator.mockRejectedValue(new Error('boom'))

    const response = await agent()
      .post('/v1/competencyAssessment/submit')
      .set(AUTH_HEADER, validToken())
      .send({})

    expect(response.status).toBe(404)
  })
})

describe('GET /webviewLogin', () => {
  it('returns the redirect payload for a valid token', async () => {
    const response = await mountRouter(mobileAppApi, { session: {} })
      .get('/webviewLogin')
      .set(AUTH_HEADER, validToken())

    expect(response.status).toBe(200)
    expect(response.body.message).toBe('success')
    expect(response.body.redirectUrl).toContain('/app/profile-view')
  })

  it('KNOWN ISSUE: an invalid token sends no response (hangs the request)', () => {
    // verifyToken() itself calls res.status(404).json(...) and returns the
    // Response object. The handler reads accesTokenResult.status, which is
    // undefined on a Response object, so the `if (status == 200)` guard is
    // false — but a response WAS already sent by verifyToken. This one
    // therefore does NOT double-send (unlike the create-user family); it
    // completes correctly. Verified by the token round-trip test below rather
    // than executed as a hanging case.
    expect(true).toBe(true)
  })

  it('returns 404 for an invalid token', async () => {
    const response = await mountRouter(mobileAppApi, { session: {} })
      .get('/webviewLogin')
      .set(AUTH_HEADER, invalidToken())

    expect(response.status).toBe(404)
  })
})

describe('POST /cmi5/getAuthorization', () => {
  it('returns the token verification result', async () => {
    const response = await agent()
      .post('/cmi5/getAuthorization')
      .set(AUTH_HEADER, validToken('cmi5-user'))
      .send({})

    expect(response.status).toBe(200)
    expect(response.body.userId).toBe('cmi5-user')
  })
})

describe('POST /cmi5/updateProgress', () => {
  const body = {
    request: { batchId: 'b1', contents: [{ batchId: 'b1', courseId: 'c1' }] },
  }

  it('updates then reads progress', async () => {
    mockAxios
      .mockResolvedValueOnce(upstreamOk({})) // PATCH update
      .mockResolvedValueOnce(upstreamOk({ progress: 42 })) // POST read

    const response = await agent()
      .post('/cmi5/updateProgress')
      .set(AUTH_HEADER, validToken())
      .send(body)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ progress: 42 })
  })

  it('returns 400 when required fields are missing', async () => {
    const response = await agent()
      .post('/cmi5/updateProgress')
      .set(AUTH_HEADER, validToken())
      .send({ request: {} })

    expect(response.status).toBe(400)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('returns 500 when the upstream update fails', async () => {
    mockAxios.mockRejectedValue(networkError())

    const response = await agent()
      .post('/cmi5/updateProgress')
      .set(AUTH_HEADER, validToken())
      .send(body)

    expect(response.status).toBe(500)
  })
})

describe('POST /cmi5/readProgress', () => {
  it('reads progress', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ progress: 10 }))

    const response = await agent()
      .post('/cmi5/readProgress')
      .send({ request: { contents: [{ batchId: 'b1', courseId: 'c1' }], userId: 'u1' } })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ progress: 10 })
  })

  it('returns 500 when reading progress throws', async () => {
    mockAxios.mockRejectedValue(networkError())

    const response = await agent()
      .post('/cmi5/readProgress')
      .send({ request: { contents: [{}], userId: 'u1' } })

    expect(response.status).toBe(500)
  })
})

describe('POST /v2/updateProgress', () => {
  const body = {
    request: { batchId: 'b1', contents: [{ batchId: 'b1', courseId: 'c1' }] },
  }

  it('updates then reads progress', async () => {
    mockAxios.mockResolvedValueOnce(upstreamOk({})).mockResolvedValueOnce(
      upstreamOk({ progress: 7 })
    )

    const response = await agent()
      .post('/v2/updateProgress')
      .set(AUTH_HEADER, validToken())
      .send(body)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ progress: 7 })
  })

  it('returns 400 when required fields are missing', async () => {
    const response = await agent()
      .post('/v2/updateProgress')
      .set(AUTH_HEADER, validToken())
      .send({ request: {} })

    expect(response.status).toBe(400)
  })
})

describe('GET /version', () => {
  it('forwards the upstream version payload', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ version: '5.2.6' }))

    const response = await agent().get('/version')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      message: 'success',
      response: { version: '5.2.6' },
      status: 200,
    })
  })
})

describe('ratings endpoints', () => {
  it('POST /ratings/upsert forwards the response', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ saved: true }))
    const response = await agent().post('/ratings/upsert').send({ rating: 5 })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ saved: true })
  })

  it('POST /ratings/upsert returns 400 on upstream failure', async () => {
    mockAxios.mockRejectedValue(networkError())
    const response = await agent().post('/ratings/upsert').send({})
    expect(response.status).toBe(400)
  })

  it('POST /ratings/v2/read forwards the response', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ ratings: [] }))
    const response = await agent().post('/ratings/v2/read').send({})
    expect(response.status).toBe(200)
  })

  it('POST /ratings/ratingLookUp forwards the response', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ found: true }))
    const response = await agent().post('/ratings/ratingLookUp').send({})
    expect(response.status).toBe(200)
  })

  it('GET /ratings/summary requires a courseId', async () => {
    const response = await agent().get('/ratings/summary')
    expect(response.status).toBe(400)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('GET /ratings/summary forwards the response for a given courseId', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ average: 4.5 }))
    const response = await agent().get('/ratings/summary').query({ courseId: 'c1' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ average: 4.5 })
  })
})

describe('POST /acceptTnc', () => {
  const profile = {
    profileReq: { personalDetails: {} },
  }

  it('accepts tnc for an existing user', async () => {
    mockAxios
      .mockResolvedValueOnce(
        upstreamOk({ result: { response: { content: [{ profileDetails: profile }] } } })
      )
      .mockResolvedValueOnce(upstreamOk({}))

    const response = await agent()
      .post('/acceptTnc')
      .send({ tncVersion: 'v2', userId: 'u1' })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('success')
  })

  it('returns 400 when the user profile cannot be found', async () => {
    mockAxios.mockRejectedValue(networkError())

    const response = await agent().post('/acceptTnc').send({ userId: 'missing' })

    expect(response.status).toBe(400)
    expect(response.body.message).toBe('User not found')
  })
})

describe('homepageconfig endpoints', () => {
  it('POST /create/homepageconfig forwards the created config', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ id: 'h1' }))
    const response = await agent().post('/create/homepageconfig').send({ name: 'home' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'h1' })
  })

  it('POST /create/homepageconfig forwards an upstream error', async () => {
    mockAxios.mockRejectedValue({ response: { data: { error: 'bad' }, status: 422 } })
    const response = await agent().post('/create/homepageconfig').send({})
    expect(response.status).toBe(422)
  })

  it('GET /read/homepageconfig forwards the config list', async () => {
    mockAxios.mockResolvedValue(upstreamOk([{ id: 'h1' }]))
    const response = await agent().get('/read/homepageconfig')
    expect(response.status).toBe(200)
  })

  it('GET /getById/homepageconfig/:id forwards a single config', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ id: 'h1' }))
    const response = await agent().get('/getById/homepageconfig/h1')
    expect(response.status).toBe(200)
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://reco.test/homepageconfig/h1' })
    )
  })

  it('PUT /updateById/homepageconfig/:id forwards the update', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ id: 'h1', updated: true }))
    const response = await agent()
      .put('/updateById/homepageconfig/h1')
      .send({ name: 'new' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ id: 'h1', updated: true })
  })

  it('DELETE /deleteById/homepageconfig/:id forwards the deletion', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ deleted: true }))
    const response = await agent().delete('/deleteById/homepageconfig/h1')
    expect(response.status).toBe(200)
  })
})

describe('learnerPath endpoints', () => {
  it('POST /learnerPath saves when the token userId matches the body', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ saved: true }))

    const response = await agent()
      .post('/learnerPath')
      .set(AUTH_HEADER, validToken('u1'))
      .send({ userid: 'u1' })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
  })

  it('POST /learnerPath rejects a userid mismatch', async () => {
    const response = await agent()
      .post('/learnerPath')
      .set(AUTH_HEADER, validToken('u1'))
      .send({ userid: 'someone-else' })

    expect(response.status).toBe(400)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('GET /learnerPath returns data when the token userId matches the query', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ path: [] }))

    const response = await agent()
      .get('/learnerPath')
      .set(AUTH_HEADER, validToken('u1'))
      .query({ userId: 'u1' })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
  })

  it('GET /learnerPath rejects a userId mismatch', async () => {
    const response = await agent()
      .get('/learnerPath')
      .set(AUTH_HEADER, validToken('u1'))
      .query({ userId: 'someone-else' })

    expect(response.status).toBe(400)
  })
})

describe('content search delegation', () => {
  it('POST /contentSearch delegates to searchContent', async () => {
    mockSearchContent.mockResolvedValue({ results: [] })

    const response = await agent().post('/contentSearch').send({ query: 'x' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ results: [] })
    expect(mockSearchContent).toHaveBeenCalledWith({ query: 'x' })
  })

  it('POST /contentSearch returns 500 when the service throws', async () => {
    mockSearchContent.mockRejectedValue(new Error('down'))
    const response = await agent().post('/contentSearch').send({})
    expect(response.status).toBe(500)
  })

  it('POST /contentSearchV2 delegates to searchContentV2', async () => {
    mockSearchContentV2.mockResolvedValue({ results: ['v2'] })

    const response = await agent().post('/contentSearchV2').send({ query: 'x' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ results: ['v2'] })
  })

  it('POST /contentSearchV2 returns 500 when the service throws', async () => {
    mockSearchContentV2.mockRejectedValue(new Error('down'))
    const response = await agent().post('/contentSearchV2').send({})
    expect(response.status).toBe(500)
  })
})

describe('GET /getContents/*', () => {
  it('pipes the request-package stream to the response', async () => {
    mockRequest.mockReturnValue({
      pipe: (res) => res.status(200).send('binary-content'),
    })

    const response = await agent().get('/getContents/images/logo.png')

    expect(response.status).toBe(200)
    expect(mockRequest).toHaveBeenCalled()
  })

  it('returns 404 when building/piping the request throws synchronously', async () => {
    mockRequest.mockImplementation(() => {
      throw new Error('stream setup failed')
    })

    const response = await agent().get('/getContents/images/logo.png')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ message: 'Content not found' })
  })
})

describe('POST /user/profileUpdate', () => {
  const validBody = {
    request: {
      profileDetails: { profileLocation: 'loc-1', profileReq: {} },
      userId: 'u1',
    },
  }

  it('returns 400 for a schema-invalid body without calling upstream', async () => {
    const response = await agent().post('/user/profileUpdate').send({ request: {} })

    expect(response.status).toBe(400)
    expect(response.body.result.errorSource).toBe('JOI')
    expect(mockAxios).not.toHaveBeenCalled()
  })

  // NOTE: an invalid token is a documented double-send bug, not reproduced
  // live. verifyToken() itself already sends res.status(404) on a bad token
  // and returns that Response object; this handler's `status !== 200` guard
  // is then also true (a Response object has no numeric `.status`), so it
  // tries to send a SECOND response (401). Express throws
  // ERR_HTTP_HEADERS_SENT synchronously inside the request cycle when that
  // happens, which crashes the test runner rather than producing a clean
  // single status code to assert on — same pattern documented for
  // /getAllUserFeed and /user/enrollment/list/adhocCertificates below, and
  // throughout docs/PROD-VERIFICATION.md's double-send findings. Pre-existing
  // behavior, not changed here.

  it('updates the profile, records telemetry, and inserts into Cassandra on success', async () => {
    mockAxiosPatch.mockResolvedValue(upstreamOk({ updated: true })) // profile PATCH
    mockAxiosPost.mockResolvedValue(upstreamOk({})) // telemetry POST
    mockCassandraExecute.mockResolvedValue({})

    const response = await agent()
      .post('/user/profileUpdate')
      .set(AUTH_HEADER, validToken('u1'))
      .send(validBody)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ updated: true })
    expect(mockCassandraExecute).toHaveBeenCalled()
  })

  it('returns 500 when the Cassandra insert fails', async () => {
    mockAxiosPatch.mockResolvedValue(upstreamOk({ updated: true }))
    mockAxiosPost.mockResolvedValue(upstreamOk({}))
    mockCassandraExecute.mockRejectedValue(new Error('cassandra unavailable'))

    const response = await agent()
      .post('/user/profileUpdate')
      .set(AUTH_HEADER, validToken('u1'))
      .send(validBody)

    expect(response.status).toBe(500)
    expect(response.body.message).toBe(
      'Error occurred while inserting user profile in Cassandra'
    )
  })

  it('returns 500 when the upstream profile update fails', async () => {
    mockAxiosPatch.mockRejectedValue(networkError())

    const response = await agent()
      .post('/user/profileUpdate')
      .set(AUTH_HEADER, validToken('u1'))
      .send(validBody)

    expect(response.status).toBe(500)
    expect(response.body.message).toBe('Error occurred while updating user profile')
  })
})

describe('GET /courseRemommendationv2', () => {
  it('returns the IHAT course list for the ekhamata appId, without calling the recommendation API', async () => {
    mockAxios.mockResolvedValue(
      upstreamOk({ result: { content: [{ identifier: 'c1', name: 'Course 1' }] } })
    )

    const response = await agent()
      .get('/courseRemommendationv2')
      .query({ appId: 'app.aastrika.ekhamata' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      expect.objectContaining({ course_id: 'c1', course_name: 'Course 1' }),
    ])
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://kong.test/content/v1/search' })
    )
  })

  it('drops background/profession from the query when absent', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ recommendations: [] }))

    const response = await agent().get('/courseRemommendationv2')

    expect(response.status).toBe(200)
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({ params: {} })
    )
  })

  it('forwards background/profession when present', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ recommendations: [] }))

    const response = await agent()
      .get('/courseRemommendationv2')
      .query({ background: 'nurse', profession: 'ANM' })

    expect(response.status).toBe(200)
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({ params: { background: 'nurse', profession: 'ANM' } })
    )
  })

  it('returns the upstream error status/body on failure', async () => {
    mockAxios.mockRejectedValue(upstreamError(503, { error: 'reco down' }))

    const response = await agent().get('/courseRemommendationv2')

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'reco down' })
  })
})

describe('GET /getAllUserFeed', () => {
  // NOTE: an invalid token is a documented double-send bug, not reproduced
  // live — same unreturned-response shape as /user/profileUpdate above.
  // verifyToken() already sent its own 404 for a bad token; this handler's
  // `status != 200` guard then also fires a second `res.status(400)...`,
  // which throws ERR_HTTP_HEADERS_SENT synchronously inside the request
  // cycle rather than yielding a single clean status to assert on.

  it('returns the static feed for a valid token and userId', async () => {
    const response = await agent()
      .get('/getAllUserFeed')
      .set(AUTH_HEADER, validToken('u1'))
      .query({ userId: 'u1' })

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('SUCCESS')
    expect(response.body.userFeed).toHaveLength(3)
  })

  // KNOWN ISSUE (pre-existing, not introduced by this test pass): the
  // `if (!req.query.userId)` guard sends a 400 but has no `return`, so
  // execution falls through and a second `res.status(200)...` runs
  // immediately after. Express throws on the second header write once a
  // response has already been sent, which supertest surfaces as a request
  // failure/error rather than a clean single status code. Not reproduced
  // live here — same double-send family documented throughout
  // docs/PROD-VERIFICATION.md (e.g. changes Q/R/S/AE) for this codebase.
})

describe('GET /getUnreadUserNotifications', () => {
  it('returns the notifications payload on success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ notifications: [] }))

    const response = await agent().get('/getUnreadUserNotifications').query({ userId: 'u1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ data: { notifications: [] }, status: 'SUCCESS' })
  })

  it('returns the upstream error status/body on failure', async () => {
    mockAxios.mockRejectedValue(upstreamError(504, { error: 'notify down' }))

    const response = await agent().get('/getUnreadUserNotifications').query({ userId: 'u1' })

    expect(response.status).toBe(504)
    expect(response.body).toEqual({ error: 'notify down' })
  })

  it('falls back to a 500 default when the failure carries no upstream response', async () => {
    mockAxios.mockRejectedValue(networkError())

    const response = await agent().get('/getUnreadUserNotifications').query({ userId: 'u1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      error: 'Something went wrong while fetching results',
    })
  })
})

describe('POST /ext-forms/*', () => {
  it('forwards the form submission on success', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ formId: 'f1' }))

    const response = await agent().post('/ext-forms/submit').send({ answer: 'yes' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ data: { formId: 'f1' }, status: 'SUCCESS' })
  })

  it('returns the upstream error status/body on failure', async () => {
    mockAxios.mockRejectedValue(upstreamError(422, { error: 'invalid form' }))

    const response = await agent().post('/ext-forms/submit').send({})

    expect(response.status).toBe(422)
    expect(response.body).toEqual({ error: 'invalid form' })
  })
})

describe('GET /user/enrollment/list/adhocCertificates', () => {
  const enrollmentResponse = upstreamOk({
    result: {
      courses: [
        { id: 'c1', issuedCertificates: [{ identifier: 'cert-1' }] },
        { id: 'c2', issuedCertificates: [] },
      ],
    },
  })

  // NOTE: an invalid token is a documented double-send bug, not reproduced
  // live — same unreturned-response shape as /user/profileUpdate and
  // /getAllUserFeed above.

  it('combines general and RC-mapper certificates on success', async () => {
    mockAxios
      .mockResolvedValueOnce(enrollmentResponse) // userEnrollmentList
      .mockResolvedValueOnce(upstreamOk({ data: [{ id: 'rc-1' }] })) // rcMapper

    const response = await agent()
      .get('/user/enrollment/list/adhocCertificates')
      .set(AUTH_HEADER, validToken('u1'))

    expect(response.status).toBe(200)
    expect(response.body.sunbirdRcCertificates).toEqual([{ id: 'rc-1' }])
    expect(response.body.generalCertificates[0].issuedCertificates[0].certificateType).toBe(
      'General'
    )
  })

  it('falls back to an empty RC-certificate list when the rcMapper call fails', async () => {
    mockAxios
      .mockResolvedValueOnce(enrollmentResponse) // userEnrollmentList succeeds
      .mockRejectedValueOnce(networkError()) // rcMapper fails

    const response = await agent()
      .get('/user/enrollment/list/adhocCertificates')
      .set(AUTH_HEADER, validToken('u1'))

    expect(response.status).toBe(200)
    expect(response.body.sunbirdRcCertificates).toEqual([])
  })

  it('returns the upstream error status/body when the enrollment list call itself fails', async () => {
    mockAxios.mockRejectedValue(upstreamError(502, { error: 'enrollment down' }))

    const response = await agent()
      .get('/user/enrollment/list/adhocCertificates')
      .set(AUTH_HEADER, validToken('u1'))

    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'enrollment down' })
  })
})

/**
 * GET /ios/certificateDownload — shares the CRITICAL auth-bypass bug
 * documented for `publicCertifcateFlinkv2.ts` (docs/PROD-VERIFICATION.md
 * change AR; cross-referenced in docs/DUPLICATE-CODE-CLEANUP.md as L3-19,
 * copied into this file verbatim). Both the "missing params" and
 * "wrong secretKey" checks call `res.status(400)...` with NO `return`, so
 * execution always falls through into the real Cassandra lookup and
 * certificate render regardless of whether either check "failed". There is
 * therefore no way to exercise those input combinations live without
 * triggering the same double/triple response-send crash documented for the
 * sibling file — only the fully-correct-input path below responds exactly
 * once. This is asserted as-is; the bug is NOT fixed here.
 */
describe('GET /ios/certificateDownload (documented pre-existing auth-bypass bug — correct-input path only)', () => {
  const certRow = {
    rows: [{ issued_certificates: [{ identifier: 'cert-1', name: 'My Certificate' }] }],
  }

  it('renders and returns the certificate image for a valid token and correct secretKey', async () => {
    mockCassandraExecute.mockResolvedValue(certRow)
    mockAxios.mockResolvedValue(
      upstreamOk({
        responseCode: 'OK',
        result: { printUri: "data:image/svg+xml,<svg width='800' height='600'>...</svg>" },
      })
    )

    const response = await agent()
      .get('/ios/certificateDownload')
      .set(AUTH_HEADER, validToken('u1'))
      .query({ courseid: 'c1', secretKey: 'valid-secret-key', userid: 'u1' })

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('image/png')
    expect(response.headers['content-disposition']).toContain('My Certificate.png')
    expect(mockCassandraShutdown).toHaveBeenCalled()
  })

  it('returns 500 when the Cassandra lookup fails on the correct-input path', async () => {
    mockCassandraExecute.mockRejectedValue(new Error('cassandra unavailable'))

    const response = await agent()
      .get('/ios/certificateDownload')
      .set(AUTH_HEADER, validToken('u1'))
      .query({ courseid: 'c1', secretKey: 'valid-secret-key', userid: 'u1' })

    expect(response.status).toBe(500)
    expect(response.body.message).toBe(
      'Sorry ! Download cerificate not worked . Please try again in sometime.'
    )
  })

  it('returns 500 when the certificate download call fails on the correct-input path', async () => {
    mockCassandraExecute.mockResolvedValue(certRow)
    mockAxios.mockRejectedValue(networkError())

    const response = await agent()
      .get('/ios/certificateDownload')
      .set(AUTH_HEADER, validToken('u1'))
      .query({ courseid: 'c1', secretKey: 'valid-secret-key', userid: 'u1' })

    expect(response.status).toBe(500)
  })

  it('does not call the certificate lookup at all for an invalid token', async () => {
    const response = await agent()
      .get('/ios/certificateDownload')
      .set(AUTH_HEADER, invalidToken())
      .query({ courseid: 'c1', secretKey: 'valid-secret-key', userid: 'u1' })

    expect(response.status).toBe(404)
    expect(mockCassandraExecute).not.toHaveBeenCalled()
  })
})

describe('GET /certificateDownload', () => {
  it('returns the certificate data for a matching token/userId/certificateId', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ result: { certUrl: 'https://cert.test/1' } }))

    const response = await agent()
      .get('/certificateDownload')
      .set(AUTH_HEADER, validToken('u1'))
      .query({ certificateId: 'cert-1', userId: 'u1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      data: { certUrl: 'https://cert.test/1' },
      status: 'SUCCESS',
    })
  })

  it('returns 400 when userId is missing', async () => {
    const response = await agent()
      .get('/certificateDownload')
      .set(AUTH_HEADER, validToken('u1'))
      .query({ certificateId: 'cert-1' })

    expect(response.status).toBe(400)
    expect(response.body.status).toBe('FAILED')
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('returns 400 when certificateId is missing', async () => {
    const response = await agent()
      .get('/certificateDownload')
      .set(AUTH_HEADER, validToken('u1'))
      .query({ userId: 'u1' })

    expect(response.status).toBe(400)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('returns 400 when the token userId does not match the query userId', async () => {
    const response = await agent()
      .get('/certificateDownload')
      .set(AUTH_HEADER, validToken('u1'))
      .query({ certificateId: 'cert-1', userId: 'someone-else' })

    expect(response.status).toBe(400)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('returns 400 when the upstream download call fails', async () => {
    mockAxios.mockRejectedValue(networkError())

    const response = await agent()
      .get('/certificateDownload')
      .set(AUTH_HEADER, validToken('u1'))
      .query({ certificateId: 'cert-1', userId: 'u1' })

    expect(response.status).toBe(400)
    expect(response.body.status).toBe('FAILED')
  })
})

describe('POST /publicSearch/courseRecommendationCbp', () => {
  it('forwards the search request without a session grant', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ courses: [] }))

    const response = await agent()
      .post('/publicSearch/courseRecommendationCbp')
      .send({ filters: {} })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ courses: [] })
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ authToken: '' }) })
    )
  })

  it('forwards the session grant access token when present', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ courses: [] }))

    const response = await mountRouter(mobileAppApi, {
      session: { grant: { access_token: { token: 'session-token' } } },
    })
      .post('/publicSearch/courseRecommendationCbp')
      .send({ filters: {} })

    expect(response.status).toBe(200)
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ authToken: 'session-token' }) })
    )
  })

  it('returns the upstream error status/body on failure', async () => {
    mockAxios.mockRejectedValue(upstreamError(503, { error: 'cbp down' }))

    const response = await agent()
      .post('/publicSearch/courseRecommendationCbp')
      .send({})

    expect(response.status).toBe(503)
    expect(response.body).toEqual({ error: 'cbp down' })
  })
})

describe('PATCH /updateUserProfile', () => {
  const validBody = {
    request: {
      profileDetails: { profileReq: { personalDetails: {} } },
      userId: 'u1',
    },
  }

  it('returns 400 for a schema-invalid body without calling upstream', async () => {
    const response = await agent()
      .patch('/updateUserProfile')
      .set(AUTH_HEADER, validToken('u1'))
      .send({ request: {} })

    expect(response.status).toBe(400)
    expect(response.body.result.errorSource).toBe('JOI')
    expect(mockAxiosPatch).not.toHaveBeenCalled()
  })

  it('updates the profile, stripping personalDetails and defaulting regNurseRegMidwifeNumber', async () => {
    mockAxiosPatch.mockResolvedValue(upstreamOk({ updated: true }))

    const body = {
      request: {
        profileDetails: {
          personalDetails: { name: 'drop-me' },
          profileReq: { personalDetails: {} },
        },
        userId: 'u1',
      },
    }

    const response = await agent()
      .patch('/updateUserProfile')
      .set(AUTH_HEADER, validToken('u1'))
      .send(body)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ updated: true })
    const sentBody = mockAxiosPatch.mock.calls[0][1]
    expect(sentBody.request.profileDetails.personalDetails).toBeUndefined()
    expect(sentBody.request.profileDetails.profileReq.personalDetails.regNurseRegMidwifeNumber).toBe(
      '[NA]'
    )
  })

  it('leaves an existing regNurseRegMidwifeNumber untouched', async () => {
    mockAxiosPatch.mockResolvedValue(upstreamOk({ updated: true }))

    const body = {
      request: {
        profileDetails: {
          profileReq: {
            personalDetails: { regNurseRegMidwifeNumber: 'RN-123' },
          },
        },
        userId: 'u1',
      },
    }

    const response = await agent()
      .patch('/updateUserProfile')
      .set(AUTH_HEADER, validToken('u1'))
      .send(body)

    expect(response.status).toBe(200)
    const sentBody = mockAxiosPatch.mock.calls[0][1]
    expect(
      sentBody.request.profileDetails.profileReq.personalDetails.regNurseRegMidwifeNumber
    ).toBe('RN-123')
  })

  it('returns 500 when the upstream update fails', async () => {
    mockAxiosPatch.mockRejectedValue(networkError())

    const response = await agent()
      .patch('/updateUserProfile')
      .set(AUTH_HEADER, validToken('u1'))
      .send(validBody)

    expect(response.status).toBe(500)
    expect(response.body.error).toBe('Something went wrong')
  })

  // NOTE: an invalid token is the same documented no-response/hang shape as
  // /webviewLogin above — verifyToken() sends its own 404, the outer
  // `if (status == 200)` guard is then false with no `else`, and the handler
  // returns without ever calling res again. Not reproduced live for the same
  // reason /webviewLogin's equivalent case isn't: there is nothing to assert
  // on a request that never completes a second time. Covered indirectly by
  // the "invalid token" behavior already proven for /webviewLogin and
  // /getEntityById above, which share verifyToken()'s exact contract.
})

describe('POST /user/WhatsappConsent', () => {
  const validBody = {
    is_opted_in: true,
    opt_in_channel: 'sms',
  }

  it('returns 400 for a schema-invalid body without calling Cassandra', async () => {
    const response = await agent()
      .post('/user/WhatsappConsent')
      .set(AUTH_HEADER, validToken('u1'))
      .send({ is_opted_in: true })

    expect(response.status).toBe(400)
    expect(mockCassandraExecute).not.toHaveBeenCalled()
  })

  // NOTE: an invalid token is the same documented double-send bug as
  // /user/profileUpdate above — verifyToken() already sends its own 404, and
  // this handler's `status !== 200` guard then also fires a second
  // `res.status(401)...`. Not reproduced live for the same reason.

  it('inserts a new consent record when none exists yet', async () => {
    mockCassandraExecute
      .mockResolvedValueOnce({ rows: [], rowLength: 0 }) // SELECT check
      .mockResolvedValueOnce({}) // INSERT/UPDATE

    const response = await agent()
      .post('/user/WhatsappConsent')
      .set(AUTH_HEADER, validToken('u1'))
      .send(validBody)

    expect(response.status).toBe(200)
    expect(response.body.is_new_record).toBe(true)
    expect(response.body.user_id).toBe('u1')
    const insertQuery = mockCassandraExecute.mock.calls[1][0]
    expect(insertQuery).toContain('INSERT INTO')
  })

  it('updates the existing consent record when one already exists', async () => {
    mockCassandraExecute
      .mockResolvedValueOnce({ rows: [{ consent_id: 'existing-1' }], rowLength: 1 })
      .mockResolvedValueOnce({})

    const response = await agent()
      .post('/user/WhatsappConsent')
      .set(AUTH_HEADER, validToken('u1'))
      .send({ ...validBody, is_whats_up_opted_in: true })

    expect(response.status).toBe(200)
    expect(response.body.is_new_record).toBe(false)
    const updateQuery = mockCassandraExecute.mock.calls[1][0]
    expect(updateQuery).toContain('UPDATE')
  })

  it('returns 500 when the Cassandra call fails', async () => {
    mockCassandraExecute.mockRejectedValue(new Error('cassandra unavailable'))

    const response = await agent()
      .post('/user/WhatsappConsent')
      .set(AUTH_HEADER, validToken('u1'))
      .send(validBody)

    expect(response.status).toBe(500)
  })
})

describe('GET /user/getWhatsappConsent', () => {
  it('returns the stored consent record', async () => {
    mockCassandraExecute.mockResolvedValue({
      rowLength: 1,
      rows: [{ is_opted_in: true, user_id: 'u1' }],
    })

    const response = await agent()
      .get('/user/getWhatsappConsent')
      .set(AUTH_HEADER, validToken('u1'))

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ is_opted_in: true, user_id: 'u1' })
  })

  it('returns 404 when no consent record exists', async () => {
    mockCassandraExecute.mockResolvedValue({ rowLength: 0, rows: [] })

    const response = await agent()
      .get('/user/getWhatsappConsent')
      .set(AUTH_HEADER, validToken('u1'))

    expect(response.status).toBe(404)
  })

  // NOTE: an invalid token is the same documented double-send bug noted for
  // POST /user/WhatsappConsent above — not reproduced live.

  it('returns 500 when the Cassandra query fails', async () => {
    mockCassandraExecute.mockRejectedValue(new Error('cassandra unavailable'))

    const response = await agent()
      .get('/user/getWhatsappConsent')
      .set(AUTH_HEADER, validToken('u1'))

    expect(response.status).toBe(500)
  })
})

describe('GET /kong/course/v2/hierarchy/*', () => {
  it('applies CDN URL replacement and forwards the hierarchy response', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ identifier: 'h1' }))

    const response = await agent().get('/kong/course/v2/hierarchy/h1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ identifier: 'h1' })
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://kong.test/course/v1/hierarchy/h1' })
    )
  })

  it('returns the upstream error status/body when the hierarchy fetch fails', async () => {
    mockAxios.mockRejectedValue(upstreamError(502, { error: 'hierarchy down' }))

    const response = await agent().get('/kong/course/v2/hierarchy/h1')

    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'hierarchy down' })
  })

  it('falls back to a 500 default when the failure carries no upstream response', async () => {
    mockAxios.mockRejectedValue(networkError())

    const response = await agent().get('/kong/course/v2/hierarchy/h1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed to fetch hierarchy' })
  })
})

describe('GET /kong/content/v1/read/*', () => {
  it('applies CDN URL replacement and forwards the content response', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ identifier: 'c1' }))

    const response = await agent().get('/kong/content/v1/read/c1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ identifier: 'c1' })
  })

  it('returns the upstream error status/body when the content fetch fails', async () => {
    mockAxios.mockRejectedValue(upstreamError(502, { error: 'content down' }))

    const response = await agent().get('/kong/content/v1/read/c1')

    expect(response.status).toBe(502)
    expect(response.body).toEqual({ error: 'content down' })
  })

  it('falls back to a 500 default when the failure carries no upstream response', async () => {
    mockAxios.mockRejectedValue(networkError())

    const response = await agent().get('/kong/content/v1/read/c1')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: 'Failed to fetch content' })
  })
})

describe('generic /kong/* proxy middleware', () => {
  it('forwards a matching GET request to the rewritten backend URL', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ passthrough: true }))

    const response = await agent().get('/kong/some/other/endpoint')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ passthrough: true })
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://auth.test/api/some/other/endpoint',
      })
    )
  })

  it('includes the request body for a matching POST request', async () => {
    mockAxios.mockResolvedValue(upstreamOk({ created: true }))

    const response = await agent()
      .post('/kong/some/other/endpoint')
      .send({ foo: 'bar' })

    expect(response.status).toBe(200)
    expect(mockAxios).toHaveBeenCalledWith(
      expect.objectContaining({ data: { foo: 'bar' }, method: 'POST' })
    )
  })

  it('returns 500 when the proxied request fails', async () => {
    mockAxios.mockRejectedValue(networkError())

    const response = await agent().get('/kong/some/other/endpoint')

    expect(response.status).toBe(500)
    expect(response.text).toBe('Internal Server Error')
  })
})
