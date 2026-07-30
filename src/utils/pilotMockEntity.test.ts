// Boundaries only: axios (network), env (config) and logger (side effects).
// The unit under test is never mocked.
jest.mock('axios')
jest.mock('./logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('./env', () => ({
  CONSTANTS: {
    PILOT_MOCK_ENTITY_ENABLED: 'true',
    PILOT_MOCK_ENTITY_URL: 'https://example.test/mock.json',
  },
}))

import axios from 'axios'
import { CONSTANTS } from './env'
import { appendPilotMockEntity } from './pilotMockEntity'

const mockAxios = axios as unknown as jest.Mock
// tslint:disable-next-line: no-any
const constants = CONSTANTS as any

const liveRow = { id: 'live-1', name: 'Live', type: 'position' }
const mockRow = { id: 'mock-1', name: 'Mock', type: 'position' }

// tslint:disable-next-line: no-any
const payloadWith = (rows: any[], responseCode: any = 200) => ({
  responseCode,
  result: { response: rows },
})

const requestBody = { search: { type: 'position' } }

describe('appendPilotMockEntity', () => {
  beforeEach(() => {
    constants.PILOT_MOCK_ENTITY_ENABLED = 'true'
    constants.PILOT_MOCK_ENTITY_URL = 'https://example.test/mock.json'
    mockAxios.mockReset()
  })

  describe('returns the payload untouched when', () => {
    it('the feature is disabled', async () => {
      constants.PILOT_MOCK_ENTITY_ENABLED = ''
      const payload = payloadWith([liveRow])
      expect(await appendPilotMockEntity(payload, requestBody)).toBe(payload)
      expect(mockAxios).not.toHaveBeenCalled()
    })

    it('no url is configured', async () => {
      constants.PILOT_MOCK_ENTITY_URL = ''
      const payload = payloadWith([liveRow])
      expect(await appendPilotMockEntity(payload, requestBody)).toBe(payload)
    })

    it('the response code is not 200', async () => {
      const payload = payloadWith([liveRow], 500)
      expect(await appendPilotMockEntity(payload, requestBody)).toBe(payload)
    })

    it('the entity list is not an array', async () => {
      const payload = payloadWith('not-an-array' as never)
      expect(await appendPilotMockEntity(payload, requestBody)).toBe(payload)
    })

    it('no entity type was requested', async () => {
      const payload = payloadWith([liveRow])
      expect(await appendPilotMockEntity(payload, {})).toBe(payload)
    })

    it('the fetch fails (errors are swallowed, never break the api)', async () => {
      mockAxios.mockRejectedValue(new Error('network down'))
      const payload = payloadWith([liveRow])
      expect(await appendPilotMockEntity(payload, requestBody)).toBe(payload)
    })

    it('the mock row is of a different type', async () => {
      mockAxios.mockResolvedValue({ data: [{ ...mockRow, type: 'other' }] })
      const payload = payloadWith([liveRow])
      expect(await appendPilotMockEntity(payload, requestBody)).toBe(payload)
    })

    it('the mock row id already exists upstream', async () => {
      mockAxios.mockResolvedValue({ data: [{ ...mockRow, id: 'live-1' }] })
      const payload = payloadWith([liveRow])
      expect(await appendPilotMockEntity(payload, requestBody)).toBe(payload)
    })

    it('the mock payload is not a plain object', async () => {
      mockAxios.mockResolvedValue({ data: ['just-a-string'] })
      const payload = payloadWith([liveRow])
      expect(await appendPilotMockEntity(payload, requestBody)).toBe(payload)
    })
  })

  describe('appends the mock row when everything matches', () => {
    it('adds it after the live rows', async () => {
      mockAxios.mockResolvedValue({ data: [mockRow] })
      const result = await appendPilotMockEntity(payloadWith([liveRow]), requestBody)
      expect(result.result.response).toEqual([liveRow, mockRow])
    })

    it('accepts a single object as well as an array', async () => {
      mockAxios.mockResolvedValue({ data: mockRow })
      const result = await appendPilotMockEntity(payloadWith([liveRow]), requestBody)
      expect(result.result.response).toHaveLength(2)
    })

    it('parses a JSON string body', async () => {
      mockAxios.mockResolvedValue({ data: JSON.stringify([mockRow]) })
      const result = await appendPilotMockEntity(payloadWith([liveRow]), requestBody)
      expect(result.result.response).toEqual([liveRow, mockRow])
    })

    it('matches the requested type case-insensitively', async () => {
      mockAxios.mockResolvedValue({ data: [{ ...mockRow, type: 'POSITION' }] })
      const result = await appendPilotMockEntity(payloadWith([liveRow]), {
        search: { type: '  Position  ' },
      })
      expect(result.result.response).toHaveLength(2)
    })

    it('does NOT mutate the upstream payload', async () => {
      mockAxios.mockResolvedValue({ data: [mockRow] })
      const payload = payloadWith([liveRow])
      const result = await appendPilotMockEntity(payload, requestBody)
      expect(payload.result.response).toEqual([liveRow])
      expect(result).not.toBe(payload)
    })

    it('works with an empty live list', async () => {
      mockAxios.mockResolvedValue({ data: [mockRow] })
      const result = await appendPilotMockEntity(payloadWith([]), requestBody)
      expect(result.result.response).toEqual([mockRow])
    })
  })
})
