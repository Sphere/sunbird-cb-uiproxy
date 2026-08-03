/**
 * PHASE 1 — certifications.ts (183 uncovered).
 *
 * Dominant shape: axios.get/post/delete/patch(...).then(r => r.data), status
 * default 400 (not 500) on failure. No org/rootOrg header guard here, unlike
 * most other files in this codebase.
 */

jest.mock('axios')
jest.mock('../utils/requestExtract', () => ({
  extractUserEmailFromRequest: jest.fn(() => 'user@Example.com'),
}))
jest.mock('../utils/env', () => ({ CONSTANTS: { LEARNING_HUB_API_BASE: 'https://lhub.test' } }))

import axios from 'axios'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { certificationApi } from './certifications'

const mockAxios = axios as jest.Mocked<typeof axios>
// The booking route calls axios as a callable (`axios({...})`) rather than
// via .get/.post/etc, matching the pattern used in assessment.test.ts.
const mockAxiosCallable = axios as unknown as jest.Mock
const agent = () => mountRouter(certificationApi)

beforeEach(() => {
  mockAxios.get.mockReset()
  mockAxios.post.mockReset()
  mockAxios.delete.mockReset()
  mockAxios.patch.mockReset()
  mockAxiosCallable.mockReset()
})

describe('GET /:certificationId/bookingInfo', () => {
  it('returns booking info, using only the local part of the email', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ slot: 's1' }))
    const response = await agent().get('/cert-1/bookingInfo')
    expect(response.status).toBe(200)
    // getEmailLocalPart('user@Example.com') -> 'user'
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/users/user/certifications/cert-1/booking-information'),
      expect.anything()
    )
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/cert-1/bookingInfo')
    expect(response.status).toBe(400)
  })
})

describe('GET /:certificationId/testCenters', () => {
  it('returns test centers', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'tc1' }]))
    const response = await agent().get('/cert-1/testCenters')
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/cert-1/testCenters')
    expect(response.status).toBe(400)
  })
})

describe('GET /:certificationId/locations/:location/testCenters/:testCenter/slots', () => {
  it('returns ACC slots for the given location and test center', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ slot: 'morning' }]))
    const response = await agent().get('/cert-1/locations/loc-1/testCenters/tc-1/slots')
    expect(response.status).toBe(200)
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining(
        '/certifications/cert-1/locations/loc-1/test-centers/tc-1/slots'
      ),
      expect.anything()
    )
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/cert-1/locations/loc-1/testCenters/tc-1/slots')
    expect(response.status).toBe(400)
  })
})

describe('POST /:certificationId/booking/:slotNo', () => {
  it('books/updates an ACC slot, using only the local part of the email', async () => {
    mockAxiosCallable.mockResolvedValue(upstreamOk({ booked: true }))
    const response = await agent().post('/cert-1/booking/3').send({})
    expect(response.status).toBe(200)
    // getEmailLocalPart('user@Example.com') -> 'user'
    expect(mockAxiosCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: expect.stringContaining('/users/user/certifications/cert-1/booking/3'),
      })
    )
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxiosCallable.mockRejectedValue(networkError())
    const response = await agent().post('/cert-1/booking/3').send({})
    expect(response.status).toBe(400)
  })
})

describe('GET /countries', () => {
  it('returns countries', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk(['IN']))
    const response = await agent().get('/countries')
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/countries')
    expect(response.status).toBe(400)
  })
})

describe('GET /countries/:countryCode/locations', () => {
  it('returns locations', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk(['Delhi']))
    const response = await agent().get('/countries/IN/locations')
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/countries/IN/locations')
    expect(response.status).toBe(400)
  })
})

describe('GET /slots', () => {
  it('returns available slots', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ slot: 1 }]))
    const response = await agent().get('/slots')
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/slots')
    expect(response.status).toBe(400)
  })
})

describe('POST /:certificationId/atDeskBooking', () => {
  it('books an at-desk slot', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ booked: true }))
    const response = await agent().post('/cert-1/atDeskBooking').send({})
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/cert-1/atDeskBooking').send({})
    expect(response.status).toBe(400)
  })
})

describe('DELETE /:certificationId/slots/:slotNo', () => {
  it('cancels the slot', async () => {
    mockAxios.delete.mockResolvedValue(upstreamOk({ cancelled: true }))
    const response = await agent().delete('/cert-1/slots/3')
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.delete.mockRejectedValue(networkError())
    const response = await agent().delete('/cert-1/slots/3')
    expect(response.status).toBe(400)
  })
})

describe('GET /currencies', () => {
  it('returns currencies', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk(['INR']))
    const response = await agent().get('/currencies')
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/currencies')
    expect(response.status).toBe(400)
  })
})

describe('POST /:certificationId/budgetRequest', () => {
  it('submits a budget request', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ requested: true }))
    const response = await agent().post('/cert-1/budgetRequest').send({})
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/cert-1/budgetRequest').send({})
    expect(response.status).toBe(400)
  })
})

describe('DELETE /:certificationId/budgetRequest', () => {
  it('withdraws the budget request', async () => {
    mockAxios.delete.mockResolvedValue(upstreamOk({ withdrawn: true }))
    const response = await agent().delete('/cert-1/budgetRequest')
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.delete.mockRejectedValue(networkError())
    const response = await agent().delete('/cert-1/budgetRequest')
    expect(response.status).toBe(400)
  })
})

describe('POST /:certificationId/result', () => {
  it('rejects a request with no file attached', async () => {
    const response = await agent().post('/cert-1/result').send({})
    expect(response.status).toBe(400)
    expect(mockAxios.post).not.toHaveBeenCalled()
  })

  it('uploads the result file, base64-encoded', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ uploaded: true }))

    const response = await mountRouter(certificationApi, {
      requestProps: {
        files: { file: { data: Buffer.from('scan-bytes'), name: 'result.pdf' } },
      },
    })
      .post('/cert-1/result')
      .send({ examDate: '2026-01-01', result: 'pass' })

    expect(response.status).toBe(200)
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        exam_date: '2026-01-01',
        file: Buffer.from('scan-bytes').toString('base64'),
        fileName: 'result.pdf',
        result: 'pass',
      }),
      expect.anything()
    )
  })
})

describe('PATCH /:certificationId/result', () => {
  it('submits a result verification action', async () => {
    mockAxios.patch.mockResolvedValue(upstreamOk({ submitted: true }))
    const response = await agent().patch('/cert-1/result').query({ action: 'submit' }).send({})
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.patch.mockRejectedValue(networkError())
    const response = await agent().patch('/cert-1/result').query({ action: 'submit' }).send({})
    expect(response.status).toBe(400)
  })
})

describe('GET /submittedDocument', () => {
  it('returns the submitted document', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ url: 'https://doc.test' }))
    const response = await agent().get('/submittedDocument')
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/submittedDocument')
    expect(response.status).toBe(400)
  })
})

describe('DELETE /:certificationId/document', () => {
  it('removes the submitted document', async () => {
    mockAxios.delete.mockResolvedValue(upstreamOk({ removed: true }))
    const response = await agent().delete('/cert-1/document')
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.delete.mockRejectedValue(networkError())
    const response = await agent().delete('/cert-1/document')
    expect(response.status).toBe(400)
  })
})

describe('GET /certificationApprovals', () => {
  it('returns pending approvals', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'a1' }]))
    const response = await agent().get('/certificationApprovals')
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/certificationApprovals')
    expect(response.status).toBe(400)
  })
})

describe('POST /atDeskRequests/:icfdId', () => {
  it('creates an at-desk request', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ id: 'req1' }))
    const response = await agent().post('/atDeskRequests/icfd-1').send({})
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/atDeskRequests/icfd-1').send({})
    expect(response.status).toBe(400)
  })
})

describe('POST /:certificationId/budgetRequestApproval', () => {
  it('approves the budget request', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ approved: true }))
    const response = await agent().post('/cert-1/budgetRequestApproval').send({})
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/cert-1/budgetRequestApproval').send({})
    expect(response.status).toBe(400)
  })
})

describe('POST /:certificationId/resultVerificationRequests', () => {
  it('submits a result verification request', async () => {
    mockAxios.post.mockResolvedValue(upstreamOk({ id: 'rv1' }))
    const response = await agent().post('/cert-1/resultVerificationRequests').send({})
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.post.mockRejectedValue(networkError())
    const response = await agent().post('/cert-1/resultVerificationRequests').send({})
    expect(response.status).toBe(400)
  })
})

describe('GET /', () => {
  it("returns the user's certifications", async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'cert-1' }]))
    const response = await agent().get('/')
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/')
    expect(response.status).toBe(400)
  })
})

describe('GET /certificationRequests', () => {
  it('returns certification requests', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'req1' }]))
    const response = await agent().get('/certificationRequests')
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/certificationRequests')
    expect(response.status).toBe(400)
  })
})

describe('GET /:certificationId/submissions', () => {
  it('returns submissions', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk([{ id: 'sub1' }]))
    const response = await agent().get('/cert-1/submissions')
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/cert-1/submissions')
    expect(response.status).toBe(400)
  })
})

describe('GET /:emailId/privileges', () => {
  it('returns the privileges for the given emailId', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ canApprove: true }))
    const response = await agent().get('/someone@example.com/privileges')
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/someone@example.com/privileges')
    expect(response.status).toBe(400)
  })
})

describe('GET /defaultProctor', () => {
  it('returns the default proctor', async () => {
    mockAxios.get.mockResolvedValue(upstreamOk({ proctor: 'p1' }))
    const response = await agent().get('/defaultProctor')
    expect(response.status).toBe(200)
  })

  it('returns 400 on an upstream failure', async () => {
    mockAxios.get.mockRejectedValue(networkError())
    const response = await agent().get('/defaultProctor')
    expect(response.status).toBe(400)
  })
})
