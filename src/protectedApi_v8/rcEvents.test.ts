/**
 * PHASE 1 — second-highest single-file coverage debt (382 uncovered).
 *
 * Scope: the Cassandra CRUD endpoints (create/edit/get/list events, link users
 * to an event). Deliberately OUT of scope for this pass:
 *   - POST /events/generateCertificates (~430 lines) — retry loop with real
 *     exponential backoff (setTimeout), RC mapper HTTP calls, S3 interaction.
 *   - GET /downloadCertificates/:eventId — AWS S3 + archiver zip streaming.
 * Both need dedicated timer/stream handling, not a one-line mock; scheduled for
 * Phase 2 alongside the plan's other Cassandra-heavy files.
 *
 * `mockExecute` is named with the `mock` prefix required by Jest's hoisting
 * rules, so the jest.mock factory below (which runs before any other code due
 * to hoisting) is allowed to reference it.
 */

const mockExecute = jest.fn()
jest.mock('cassandra-driver', () => ({
  default: { Client: jest.fn(() => ({ execute: mockExecute })) },
  Client: jest.fn(() => ({ execute: mockExecute })),
}))
jest.mock('axios')
jest.mock('aws-sdk', () => ({ S3: jest.fn(() => ({})) }))
jest.mock('archiver', () => jest.fn())
jest.mock('../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
// Not used by any endpoint under test here. Mocked because the real module
// transitively imports emailHashPasswordGenerator.ts, which reads AES config
// at IMPORT TIME and throws if it is not present.
jest.mock('../utils/rcPasswordGenerator', () => ({ getRCPassword: jest.fn() }))
jest.mock('../utils/env', () => ({
  CONSTANTS: {
    CASSANDRA_IP: '127.0.0.1',
    LEARNER_SERVICE_API_BASE: 'https://learner.test',
    RC_S3_ACCESS_KEY_ID: 'key',
    RC_S3_BUCKET_NAME: 'bucket',
    RC_S3_SECRET_ACCESS_KEY: 'secret',
  },
}))

import axios from 'axios'
import { networkError, upstreamOk } from '../test-support/mockAxios'
import { mountRouter } from '../test-support/mountRouter'
import { sunbirdrRcCertificate } from './rcEvents'

const mockAxios = axios as unknown as jest.Mock
const agent = () => mountRouter(sunbirdrRcCertificate)

const validCreateBody = {
  createdBy: 'admin',
  eventDate: '2026-01-01',
  eventDescription: 'desc',
  eventName: 'Health Camp',
  eventPlace: 'Delhi',
  eventType: 'registred with sphere',
}

const cassandraRow = {
  createdat: new Date('2026-01-01'),
  createdby: 'admin',
  eventdate: '2026-01-01',
  eventdescription: 'desc',
  eventid: 'evt-1',
  eventname: 'Health Camp',
  eventplace: 'Delhi',
  eventtype: 'registred with sphere',
  templateid: null,
  updatedat: new Date('2026-01-01'),
  updatedby: 'admin',
}

beforeEach(() => {
  mockExecute.mockReset()
  mockAxios.mockReset()
})

describe('POST /events', () => {
  it('creates an event and returns 201 with a generated eventId', async () => {
    mockExecute.mockResolvedValue({})

    const response = await agent().post('/events').send(validCreateBody)

    expect(response.status).toBe(201)
    expect(response.body.eventId).toEqual(expect.any(String))
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sunbird.rc_events'),
      expect.arrayContaining(['Health Camp', 'desc', '2026-01-01', 'Delhi']),
      { prepare: true }
    )
  })

  it('rejects a request missing required fields', async () => {
    const response = await agent().post('/events').send({ eventName: 'x' })
    expect(response.status).toBe(400)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it('returns 500 when the insert fails', async () => {
    mockExecute.mockRejectedValue(new Error('cassandra down'))
    const response = await agent().post('/events').send(validCreateBody)
    expect(response.status).toBe(500)
  })
})

describe('POST /events/edit', () => {
  it('updates an existing event', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [cassandraRow] }) // getEventQuery lookup
      .mockResolvedValueOnce({}) // update

    const response = await agent()
      .post('/events/edit')
      .send({ eventId: 'evt-1', eventName: 'Updated Name' })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ eventId: 'evt-1', message: 'Event updated successfully' })
  })

  it('rejects a request with no eventId', async () => {
    const response = await agent().post('/events/edit').send({})
    expect(response.status).toBe(400)
  })

  it('returns 404 when the event does not exist', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] })
    const response = await agent().post('/events/edit').send({ eventId: 'missing' })
    expect(response.status).toBe(404)
  })

  it('returns 500 when the update query fails', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [cassandraRow] })
      .mockRejectedValueOnce(new Error('down'))

    const response = await agent().post('/events/edit').send({ eventId: 'evt-1' })
    expect(response.status).toBe(500)
  })
})

describe('GET /events/:id', () => {
  it('returns the event', async () => {
    mockExecute.mockResolvedValue({ rowLength: 1, rows: [cassandraRow] })

    const response = await agent().get('/events/evt-1')

    expect(response.status).toBe(200)
    expect(response.body.eventId).toBe('evt-1')
    expect(response.body.eventName).toBe('Health Camp')
  })

  it('returns 404 when the event does not exist', async () => {
    mockExecute.mockResolvedValue({ rowLength: 0, rows: [] })
    const response = await agent().get('/events/missing')
    expect(response.status).toBe(404)
  })

  it('returns 500 when the query fails', async () => {
    mockExecute.mockRejectedValue(new Error('down'))
    const response = await agent().get('/events/evt-1')
    expect(response.status).toBe(500)
  })
})

describe('GET /events', () => {
  it('returns the list of events', async () => {
    mockExecute.mockResolvedValue({
      rowLength: 2,
      rows: [cassandraRow, { ...cassandraRow, eventid: 'evt-2' }],
    })

    const response = await agent().get('/events')

    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(2)
  })

  it('returns 404 when there are no events', async () => {
    mockExecute.mockResolvedValue({ rowLength: 0, rows: [] })
    const response = await agent().get('/events')
    expect(response.status).toBe(404)
  })

  it('returns 500 when the query fails', async () => {
    mockExecute.mockRejectedValue(new Error('down'))
    const response = await agent().get('/events')
    expect(response.status).toBe(500)
  })
})

describe('POST /events/users', () => {
  it('returns 404 when the event does not exist', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] }) // getEventDetails

    const response = await agent()
      .post('/events/users')
      .send({ eventId: 'missing', users: [{ phone: '9876543210' }] })

    expect(response.status).toBe(404)
  })

  it('rejects an empty users array', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [cassandraRow] })

    const response = await agent().post('/events/users').send({ eventId: 'evt-1', users: [] })

    expect(response.status).toBe(400)
  })

  it('links an existing sphere user to the event', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [cassandraRow] }) // getEventDetails
      .mockResolvedValueOnce({}) // insertUserEventLink
    mockAxios.mockResolvedValue(
      upstreamOk({
        result: {
          response: {
            content: [{ firstName: 'A', id: 'sunbird-user-1', lastName: 'B' }],
            count: 1,
          },
        },
      })
    )

    const response = await agent()
      .post('/events/users')
      .send({ eventId: 'evt-1', users: [{ phone: '9876543210', place: 'Delhi' }] })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      eventId: 'evt-1',
      failed: 0,
      message: 'Users linking completed. Success: 1, Failed: 0',
      success: 1,
      total: 1,
    })
  })

  it('records a failure when the sphere user lookup finds nobody', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [cassandraRow] })
      .mockResolvedValueOnce({}) // insertUserEventLink for the failed row
    mockAxios.mockResolvedValue(upstreamOk({ result: { response: { content: [], count: 0 } } }))

    const response = await agent()
      .post('/events/users')
      .send({ eventId: 'evt-1', users: [{ phone: '0000000000' }] })

    expect(response.status).toBe(200)
    expect(response.body.failed).toBe(1)
    expect(response.body.success).toBe(0)
  })

  it('links a non-sphere user using the supplied name directly', async () => {
    const nonSphereEvent = { ...cassandraRow, eventtype: 'registred without sphere' }
    mockExecute.mockResolvedValueOnce({ rows: [nonSphereEvent] }).mockResolvedValueOnce({})

    const response = await agent()
      .post('/events/users')
      .send({
        eventId: 'evt-1',
        users: [{ firstName: 'Direct', lastName: 'User', phone: '9876543210' }],
      })

    expect(response.status).toBe(200)
    // Non-sphere users get userId 'Non-QR-User', which is truthy, so they
    // still count as a success without ever calling the search API.
    expect(response.body.success).toBe(1)
    expect(mockAxios).not.toHaveBeenCalled()
  })

  it('continues processing remaining users when one insert throws', async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [cassandraRow] }) // getEventDetails
      .mockRejectedValueOnce(new Error('insert failed')) // user 1 insert throws
      .mockResolvedValueOnce({}) // user 2 insert succeeds
    mockAxios.mockResolvedValue(
      upstreamOk({
        result: { response: { content: [{ id: 'u1' }], count: 1 } },
      })
    )

    const response = await agent()
      .post('/events/users')
      .send({
        eventId: 'evt-1',
        users: [{ phone: '1111111111' }, { phone: '2222222222' }],
      })

    expect(response.status).toBe(200)
    expect(response.body.total).toBe(2)
    expect(response.body.failed).toBe(1)
  })

  it('returns 500 when the initial event lookup throws', async () => {
    mockExecute.mockRejectedValueOnce(new Error('down'))
    const response = await agent()
      .post('/events/users')
      .send({ eventId: 'evt-1', users: [{ phone: '123' }] })
    expect(response.status).toBe(500)
  })
})

describe('GET /events/:eventId/users', () => {
  it('returns the users linked to an event', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          certificategenerationstatus: 'inProgress',
          eventid: 'evt-1',
          firstname: 'A',
          lastname: 'B',
          linkid: 'link-1',
          userid: 'u1',
        },
      ],
    })

    const response = await agent().get('/events/evt-1/users')

    expect(response.status).toBe(200)
    expect(response.body[0].userId).toBe('u1')
  })

  it('returns 404 when no users are linked', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    const response = await agent().get('/events/evt-1/users')
    expect(response.status).toBe(404)
  })
})

describe('GET /users/:userId/events', () => {
  it("returns the user's events", async () => {
    mockExecute.mockResolvedValue({ rows: [{ eventid: 'evt-1' }] })
    const response = await agent().get('/users/u1/events')
    expect(response.status).toBe(200)
    expect(response.body).toEqual([{ eventid: 'evt-1' }])
  })

  it('returns 404 when the user has no events', async () => {
    mockExecute.mockResolvedValue({ rows: [] })
    const response = await agent().get('/users/u1/events')
    expect(response.status).toBe(404)
  })

  it('returns 500 when the query fails', async () => {
    mockExecute.mockRejectedValue(networkError())
    const response = await agent().get('/users/u1/events')
    expect(response.status).toBe(500)
  })
})
