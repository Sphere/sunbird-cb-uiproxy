/**
 * src/authoring/utils/upload-meta-and-json/assessment.ts is NOT an Express-
 * route file — it exports one plain async function, `uploadAssessmentData`,
 * which fans out to two `uploadToS3` calls (key file + question file) and
 * combines their results. `processAssessmentData` and `shuffle` are private
 * (unexported) helpers exercised indirectly through `uploadAssessmentData`
 * by inspecting the second `uploadToS3` call's arguments.
 *
 * assessment.ts itself imports no CONSTANTS/logger — only `uploadToS3` from
 * `../S3/upload`, which is mocked wholesale below so its own axios/CONSTANTS
 * internals never run. No jest.mock('express') or mountRouter needed, per
 * the plain-function style in src/utils/keycloak-user-creation.test.ts and
 * src/service/goals.test.ts.
 *
 * No try/catch, res.send, or Router involved anywhere in this file, so none
 * of the documented hang/crash/bypass patterns (A-F) apply here — every
 * branch below is safe to exercise live.
 */

import { IUploadS3Request } from '../../models/response/custom-s3-upload'
import { IQuiz } from '../../models/quiz'
import { uploadAssessmentData } from './assessment'

const mockUploadToS3 = jest.fn()
jest.mock('../S3/upload', () => ({
  uploadToS3: (...args: unknown[]) => mockUploadToS3(...args),
}))

/**
 * @description Verifies uploadAssessmentData uploads an untouched key file
 * and a processed question file (answers stripped per question type, mtf
 * match values shuffled) via two uploadToS3 calls, and that it surfaces the
 * correct error/artifact result when either upload fails.
 */
describe('uploadAssessmentData', () => {
  const buildQuiz = (): IQuiz => ({
    isAssessment: true,
    questions: [
      {
        multiSelection: false,
        options: [
          { optionId: 'o1', text: 'a', isCorrect: true },
          { optionId: 'o2', text: 'b', isCorrect: false },
        ],
        question: 'Single choice?',
        questionId: 'q1',
        questionType: 'mcq-sca',
      },
      {
        multiSelection: true,
        options: [
          { optionId: 'o1', text: 'c', isCorrect: true },
          { optionId: 'o2', text: 'd', isCorrect: true },
        ],
        question: 'Multi choice?',
        questionId: 'q2',
        questionType: 'mcq-mca',
      },
      {
        multiSelection: false,
        options: [
          { optionId: 'o1', text: 'fill1', isCorrect: true },
          { optionId: 'o2', text: 'fill2', isCorrect: false },
        ],
        question: 'Fill in the blank?',
        questionId: 'q3',
        questionType: 'fitb',
      },
      {
        multiSelection: false,
        options: [
          { optionId: 'o1', text: 'm1', isCorrect: true, match: 'match1' },
          { optionId: 'o2', text: 'm2', isCorrect: false, match: 'match2' },
          { optionId: 'o3', text: 'm3', isCorrect: false, match: 'match3' },
        ],
        question: 'Match the following?',
        questionId: 'q4',
        questionType: 'mtf',
      },
    ],
    timeLimit: 60,
  })

  const buildRequest = (): IUploadS3Request<IQuiz> => ({
    categoryType: 'assessment',
    data: buildQuiz(),
    identfier: 'do_123',
    mimeType: 'application/json',
    path: 'assessment/do_123',
  })

  // uploadToS3 is invoked twice per uploadAssessmentData call: once for the
  // (untouched) key file and once for the processed question file. Resolve
  // based on the fileName argument so ordering assumptions aren't needed.
  const mockUploadToS3Impl = (
    keyResult: { artifactUrl: string | null; downloadUrl: string | null; error: {} | null },
    questionResult: { artifactUrl: string | null; downloadUrl: string | null; error: {} | null }
  ) => {
    mockUploadToS3.mockImplementation((_data: unknown, _path: string, fileName: string) => {
      if (fileName === 'assessment-key.json') {
        return Promise.resolve(keyResult)
      }
      return Promise.resolve(questionResult)
    })
  }

  it('should return the question report when both uploads succeed', async () => {
    mockUploadToS3Impl(
      { artifactUrl: 'http://cdn/key', downloadUrl: 'http://cdn/key/dl', error: null },
      { artifactUrl: 'http://cdn/question', downloadUrl: 'http://cdn/question/dl', error: null }
    )
    const request = buildRequest()

    const result = await uploadAssessmentData(request)

    expect(result).toEqual({
      artifactUrl: 'http://cdn/question',
      downloadUrl: 'http://cdn/question/dl',
      error: null,
    })
    expect(mockUploadToS3).toHaveBeenCalledTimes(2)
  })

  it('should call uploadToS3 for the key file with the original, unmodified data', async () => {
    mockUploadToS3Impl(
      { artifactUrl: 'a', downloadUrl: 'b', error: null },
      { artifactUrl: 'c', downloadUrl: 'd', error: null }
    )
    const request = buildRequest()

    await uploadAssessmentData(request)

    const keyCall = mockUploadToS3.mock.calls.find((call) => call[2] === 'assessment-key.json')
    expect(keyCall).toBeDefined()
    expect(keyCall[0]).toEqual(request.data)
    expect(keyCall[1]).toBe(request.path)
    // Original request data must be untouched by processAssessmentData.
    expect((request.data.questions[0] as { options: Array<{ isCorrect: boolean }> }).options[0].isCorrect).toBe(
      true
    )
  })

  it('should strip answers from mcq-sca/mcq-mca options for the question file', async () => {
    mockUploadToS3Impl(
      { artifactUrl: 'a', downloadUrl: 'b', error: null },
      { artifactUrl: 'c', downloadUrl: 'd', error: null }
    )
    const request = buildRequest()

    await uploadAssessmentData(request)

    const questionCall = mockUploadToS3.mock.calls.find((call) => call[2] === 'assessment.json')
    const processed = questionCall[0] as IQuiz
    const mcqSca = processed.questions[0] as { options: Array<{ isCorrect: boolean; text: string }> }
    const mcqMca = processed.questions[1] as { options: Array<{ isCorrect: boolean; text: string }> }

    expect(mcqSca.options.every((o) => o.isCorrect === false)).toBe(true)
    expect(mcqSca.options.map((o) => o.text)).toEqual(['a', 'b'])
    expect(mcqMca.options.every((o) => o.isCorrect === false)).toBe(true)
    expect(mcqMca.options.map((o) => o.text)).toEqual(['c', 'd'])
  })

  it('should strip answers and text for fitb options', async () => {
    mockUploadToS3Impl(
      { artifactUrl: 'a', downloadUrl: 'b', error: null },
      { artifactUrl: 'c', downloadUrl: 'd', error: null }
    )
    const request = buildRequest()

    await uploadAssessmentData(request)

    const questionCall = mockUploadToS3.mock.calls.find((call) => call[2] === 'assessment.json')
    const processed = questionCall[0] as IQuiz
    const fitb = processed.questions[2] as { options: Array<{ isCorrect: boolean; text: string }> }

    expect(fitb.options.every((o) => o.isCorrect === false && o.text === '')).toBe(true)
  })

  it('should strip answers and shuffle match values for mtf options', async () => {
    mockUploadToS3Impl(
      { artifactUrl: 'a', downloadUrl: 'b', error: null },
      { artifactUrl: 'c', downloadUrl: 'd', error: null }
    )
    const request = buildRequest()

    await uploadAssessmentData(request)

    const questionCall = mockUploadToS3.mock.calls.find((call) => call[2] === 'assessment.json')
    const processed = questionCall[0] as IQuiz
    const mtf = processed.questions[3] as { options: Array<{ isCorrect: boolean; match: string }> }

    expect(mtf.options.every((o) => o.isCorrect === false)).toBe(true)
    // Shuffle must be a permutation of the original match values, not a
    // mutation/loss of any of them.
    expect(mtf.options.map((o) => o.match).sort()).toEqual(['match1', 'match2', 'match3'])
  })

  it('should return a null-artifact error object when the key upload fails', async () => {
    mockUploadToS3Impl(
      { artifactUrl: null, downloadUrl: null, error: 'key upload failed' },
      { artifactUrl: 'http://cdn/question', downloadUrl: 'http://cdn/question/dl', error: null }
    )

    const result = await uploadAssessmentData(buildRequest())

    expect(result).toEqual({
      artifactUrl: null,
      downloadUrl: null,
      error: 'key upload failed',
    })
  })

  it('should return a null-artifact error object when the question upload fails', async () => {
    mockUploadToS3Impl(
      { artifactUrl: 'http://cdn/key', downloadUrl: 'http://cdn/key/dl', error: null },
      { artifactUrl: null, downloadUrl: null, error: 'question upload failed' }
    )

    const result = await uploadAssessmentData(buildRequest())

    expect(result).toEqual({
      artifactUrl: null,
      downloadUrl: null,
      error: 'question upload failed',
    })
  })

  it('should prefer the key error when both uploads fail', async () => {
    mockUploadToS3Impl(
      { artifactUrl: null, downloadUrl: null, error: 'key failed' },
      { artifactUrl: null, downloadUrl: null, error: 'question failed' }
    )

    const result = await uploadAssessmentData(buildRequest())

    expect(result.error).toBe('key failed')
  })
})
