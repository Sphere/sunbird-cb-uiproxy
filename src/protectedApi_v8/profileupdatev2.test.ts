/**
 * profileupdatev2.ts — five sibling POST routes that all share one shape:
 *   1. validate required body fields -> 400 with a route-specific message
 *   2. compare body.userId against extractUserIdFromRequest(req) -> 400
 *      'Invalid userId' on mismatch
 *   3. getUserProfile(userId)  — axios in its CALLABLE `axios({...})` form
 *      (POST to LEARNER_SERVICE_API_BASE .../search)
 *   4. mutate one field of the fetched profile
 *   5. saveUserProfile(...)    — axios.post() form (POST to HTTPS_HOST .../update)
 *   6. res.json success message, or 500 + generic message from the catch
 *
 * Every route wraps steps 2-5 in a try/catch with no early return before the
 * final res.json, so there is no double-send / zero-response / missing-catch
 * hazard here (unlike some other files in this campaign) — both the
 * getUserProfile failure and the saveUserProfile failure paths are safe to
 * exercise live, since both are awaited inside the try block.
 *
 * extractUserIdFromRequest and extractUserToken are mocked wholesale (same
 * approach as cohorts.test.ts): the former's real implementation reads
 * req.header('wid') / req.session.userId, and mountRouter() installs no
 * session middleware by default, so calling through to the real
 * implementation is irrelevant to this file's own branching logic.
 */

jest.mock('axios')
jest.mock('../utils/logger', () => ({ logInfo: jest.fn() }))
jest.mock('../utils/requestExtract', () => ({
  extractUserIdFromRequest: jest.fn(() => 'user-1'),
  extractUserToken: jest.fn(() => 'token-1'),
}))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    HTTPS_HOST: 'https://https-host.test',
    LEARNER_SERVICE_API_BASE: 'https://learner.test',
    SB_API_KEY: 'sb-api-key',
  },
}))

import axios from 'axios'
import { extractUserIdFromRequest } from '../utils/requestExtract'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { profileupdatev2 } from './profileupdatev2'

const mockAxios = axios as jest.Mocked<typeof axios>
// getUserProfile uses the callable `axios({...})` form.
const mockAxiosCallable = axios as unknown as jest.Mock
const mockExtractUserIdFromRequest = extractUserIdFromRequest as jest.Mock
const agent = () => mountRouter(profileupdatev2)

beforeEach(() => {
  mockAxiosCallable.mockReset()
  mockAxios.post.mockReset()
  mockExtractUserIdFromRequest.mockReset()
  mockExtractUserIdFromRequest.mockReturnValue('user-1')
})

describe('POST /updatePersonalDetails', () => {
  const personalDetails = {
    dob: '1990-01-01',
    firstname: 'Jane',
    pincode: '110001',
    postalAddress: '221B Baker Street',
    primaryEmail: 'jane@test.com',
    surname: 'Doe',
  }

  it('rejects a request missing userId', async () => {
    const response = await agent()
      .post('/updatePersonalDetails')
      .send({ personalDetails })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Missing userId or personalDetails',
      status: 'error',
    })
  })

  it('rejects a request missing personalDetails', async () => {
    const response = await agent()
      .post('/updatePersonalDetails')
      .send({ userId: 'user-1' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Missing userId or personalDetails',
      status: 'error',
    })
  })

  it('rejects when body userId does not match the authenticated user', async () => {
    mockExtractUserIdFromRequest.mockReturnValue('someone-else')

    const response = await agent()
      .post('/updatePersonalDetails')
      .send({ personalDetails, userId: 'user-1' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Invalid userId', status: 'error' })
  })

  it('fetches, updates and saves the profile on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ personalDetails: {} }))
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    const response = await agent()
      .post('/updatePersonalDetails')
      .send({ personalDetails, userId: 'user-1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      message: 'Personal details updated',
      status: 'success',
    })
  })

  it('returns 500 when fetching the current profile fails', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent()
      .post('/updatePersonalDetails')
      .send({ personalDetails, userId: 'user-1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error', status: 'error' })
  })

  it('returns 500 when saving the updated profile fails', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ personalDetails: {} }))
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent()
      .post('/updatePersonalDetails')
      .send({ personalDetails, userId: 'user-1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error', status: 'error' })
  })
})

describe('POST /updateProfessionalDetails', () => {
  const professionalDetails = [
    { designation: 'Nurse', orgType: 'Government', profession: 'Nursing' },
  ]

  it('rejects a request missing userId', async () => {
    const response = await agent()
      .post('/updateProfessionalDetails')
      .send({ professionalDetails })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Missing userId or professionalDetails',
      status: 'error',
    })
  })

  it('rejects a request missing professionalDetails', async () => {
    const response = await agent()
      .post('/updateProfessionalDetails')
      .send({ userId: 'user-1' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Missing userId or professionalDetails',
      status: 'error',
    })
  })

  it('rejects when body userId does not match the authenticated user', async () => {
    mockExtractUserIdFromRequest.mockReturnValue('someone-else')

    const response = await agent()
      .post('/updateProfessionalDetails')
      .send({ professionalDetails, userId: 'user-1' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Invalid userId', status: 'error' })
  })

  it('fetches, updates and saves the profile on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ professionalDetails: [] }))
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    const response = await agent()
      .post('/updateProfessionalDetails')
      .send({ professionalDetails, userId: 'user-1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      message: 'Professional details updated',
      status: 'success',
    })
  })

  it('returns 500 when fetching the current profile fails', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent()
      .post('/updateProfessionalDetails')
      .send({ professionalDetails, userId: 'user-1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error', status: 'error' })
  })

  it('returns 500 when saving the updated profile fails', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ professionalDetails: [] }))
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent()
      .post('/updateProfessionalDetails')
      .send({ professionalDetails, userId: 'user-1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error', status: 'error' })
  })
})

describe('POST /updateAcademics', () => {
  const academics = [
    {
      nameOfInstitute: 'State University',
      nameOfQualification: 'BSc Nursing',
      type: 'Degree',
      yearOfPassing: '2015',
    },
  ]

  it('rejects a request missing userId', async () => {
    const response = await agent().post('/updateAcademics').send({ academics })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Missing userId or academics',
      status: 'error',
    })
  })

  it('rejects a request missing academics', async () => {
    const response = await agent()
      .post('/updateAcademics')
      .send({ userId: 'user-1' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Missing userId or academics',
      status: 'error',
    })
  })

  it('rejects when body userId does not match the authenticated user', async () => {
    mockExtractUserIdFromRequest.mockReturnValue('someone-else')

    const response = await agent()
      .post('/updateAcademics')
      .send({ academics, userId: 'user-1' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Invalid userId', status: 'error' })
  })

  it('fetches, updates and saves the profile on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ academics: [] }))
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    const response = await agent()
      .post('/updateAcademics')
      .send({ academics, userId: 'user-1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      message: 'Academic details updated',
      status: 'success',
    })
  })

  it('returns 500 when fetching the current profile fails', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent()
      .post('/updateAcademics')
      .send({ academics, userId: 'user-1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error', status: 'error' })
  })

  it('returns 500 when saving the updated profile fails', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ academics: [] }))
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent()
      .post('/updateAcademics')
      .send({ academics, userId: 'user-1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error', status: 'error' })
  })
})

describe('POST /updateLanguage', () => {
  const preferences = { language: 'hi' }

  it('rejects a request missing userId', async () => {
    const response = await agent().post('/updateLanguage').send({ preferences })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Missing userId or language',
      status: 'error',
    })
  })

  it('rejects a request missing preferences', async () => {
    const response = await agent()
      .post('/updateLanguage')
      .send({ userId: 'user-1' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Missing userId or language',
      status: 'error',
    })
  })

  it('rejects a request with preferences.language absent', async () => {
    const response = await agent()
      .post('/updateLanguage')
      .send({ preferences: {}, userId: 'user-1' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Missing userId or language',
      status: 'error',
    })
  })

  it('rejects when body userId does not match the authenticated user', async () => {
    mockExtractUserIdFromRequest.mockReturnValue('someone-else')

    const response = await agent()
      .post('/updateLanguage')
      .send({ preferences, userId: 'user-1' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Invalid userId', status: 'error' })
  })

  it('fetches, updates and saves the profile on success', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ preferences: {} }))
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    const response = await agent()
      .post('/updateLanguage')
      .send({ preferences, userId: 'user-1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      message: 'Language preference updated',
      status: 'success',
    })
  })

  it('returns 500 when fetching the current profile fails', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent()
      .post('/updateLanguage')
      .send({ preferences, userId: 'user-1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error', status: 'error' })
  })

  it('returns 500 when saving the updated profile fails', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ preferences: {} }))
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent()
      .post('/updateLanguage')
      .send({ preferences, userId: 'user-1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error', status: 'error' })
  })
})

describe('POST /updateTnc', () => {
  it('rejects a request missing userId', async () => {
    const response = await agent()
      .post('/updateTnc')
      .send({ acceptTnc: true })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Missing userId or T&C status',
      status: 'error',
    })
  })

  it('rejects a request missing acceptTnc', async () => {
    const response = await agent()
      .post('/updateTnc')
      .send({ userId: 'user-1' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      message: 'Missing userId or T&C status',
      status: 'error',
    })
  })

  it('accepts acceptTnc: false as a present value (only undefined is rejected)', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ tnc: {} }))
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    const response = await agent()
      .post('/updateTnc')
      .send({ acceptTnc: false, userId: 'user-1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      message: 'Terms and conditions updated',
      status: 'success',
    })
  })

  it('rejects when body userId does not match the authenticated user', async () => {
    mockExtractUserIdFromRequest.mockReturnValue('someone-else')

    const response = await agent()
      .post('/updateTnc')
      .send({ acceptTnc: true, userId: 'user-1' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ message: 'Invalid userId', status: 'error' })
  })

  it('fetches, updates and saves the profile on success, defaulting timestamp when absent', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ tnc: {} }))
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    const response = await agent()
      .post('/updateTnc')
      .send({ acceptTnc: true, userId: 'user-1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      message: 'Terms and conditions updated',
      status: 'success',
    })
  })

  it('uses the provided timestamp when present', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ tnc: {} }))
    mockAxios.post.mockResolvedValue(upstreamOk({}))

    const response = await agent()
      .post('/updateTnc')
      .send({ acceptTnc: true, timestamp: '2024-01-01T00:00:00.000Z', userId: 'user-1' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      message: 'Terms and conditions updated',
      status: 'success',
    })
  })

  it('returns 500 when fetching the current profile fails', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())

    const response = await agent()
      .post('/updateTnc')
      .send({ acceptTnc: true, userId: 'user-1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error', status: 'error' })
  })

  it('returns 500 when saving the updated profile fails', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ tnc: {} }))
    mockAxios.post.mockRejectedValue(networkError())

    const response = await agent()
      .post('/updateTnc')
      .send({ acceptTnc: true, userId: 'user-1' })

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ message: 'Internal server error', status: 'error' })
  })
})
