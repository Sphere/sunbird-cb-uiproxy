jest.mock('axios')
jest.mock('./logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }))
jest.mock('./env', () => ({ CONSTANTS: { S3_BUCKET_URL: 'https://bucket.test/' } }))

import axios from 'axios'
import { jumbler } from './jumbler'

const mockAxios = axios as unknown as jest.Mock

const question = (id: string) => ({
  options: [
    { isCorrect: true, optionId: `${id}-a` },
    { isCorrect: false, optionId: `${id}-b` },
  ],
  questionId: id,
})

describe('jumbler', () => {
  beforeEach(() => mockAxios.mockReset())

  it('requests the assessment json from the configured bucket', async () => {
    mockAxios.mockResolvedValue({ data: { questions: [question('q1')] } })
    await jumbler('path/to/quiz.json')
    expect(mockAxios).toHaveBeenCalledWith({
      method: 'get',
      url: 'https://bucket.test/path/to/quiz.json',
    })
  })

  it('strips the correct-answer flag from every option', async () => {
    mockAxios.mockResolvedValue({ data: { questions: [question('q1'), question('q2')] } })
    const result = await jumbler('quiz.json')
    for (const q of result.questions) {
      for (const option of q.options) {
        expect(option.isCorrect).toBe(false)
      }
    }
  })

  it('defaults randomCount to the number of questions', async () => {
    mockAxios.mockResolvedValue({
      data: { questions: [question('q1'), question('q2'), question('q3')] },
    })
    const result = await jumbler('quiz.json')
    expect(result.randomCount).toBe(3)
    expect(result.questions).toHaveLength(3)
  })

  it('honours an explicit randomCount by sampling that many questions', async () => {
    mockAxios.mockResolvedValue({
      data: {
        questions: [question('q1'), question('q2'), question('q3'), question('q4')],
        randomCount: 2,
      },
    })
    const result = await jumbler('quiz.json')
    expect(result.randomCount).toBe(2)
    expect(result.questions).toHaveLength(2)
  })

  it('passes through assessment metadata', async () => {
    mockAxios.mockResolvedValue({
      data: {
        isAssessment: true,
        passPercentage: 60,
        questions: [question('q1')],
        timeLimit: 420000,
      },
    })
    const result = await jumbler('quiz.json')
    expect(result.isAssessment).toBe(true)
    expect(result.passPercentage).toBe(60)
    expect(result.timeLimit).toBe(420000)
  })

  it('leaves metadata undefined when absent', async () => {
    mockAxios.mockResolvedValue({ data: { questions: [question('q1')] } })
    const result = await jumbler('quiz.json')
    expect(result.isAssessment).toBeUndefined()
    expect(result.passPercentage).toBeUndefined()
    expect(result.timeLimit).toBeUndefined()
  })

  it('handles an empty question list', async () => {
    mockAxios.mockResolvedValue({ data: { questions: [] } })
    const result = await jumbler('quiz.json')
    expect(result.questions).toEqual([])
    expect(result.randomCount).toBe(0)
  })

  it('propagates a fetch failure to the caller', async () => {
    mockAxios.mockRejectedValue(new Error('boom'))
    await expect(jumbler('quiz.json')).rejects.toThrow('boom')
  })
})
