import axios from 'axios'
import _ from 'lodash'
import { CONSTANTS } from './env'
import { logInfo } from './logger'
const S3_BUCKET_URL = `${CONSTANTS.S3_BUCKET_URL}`

export async function jumbler(path: string) {
  const sunbirdUrl = S3_BUCKET_URL + path
  return axios({
    method: 'get',
    url: sunbirdUrl,
  }).then((response) => {
    const randomCount =
      response.data.randomCount || response.data.questions.length
    logInfo('Success IN Getting Assessment JSON >>>>>>>>>>>' + response)
    const sampledQuestions = _.sampleSize(
      response.data.questions,
      randomCount
    )
    // Practice quizzes are scored on the client, so they need the real `isCorrect`
    // flags. Only graded assessments hide the answers via falseCreator (server-side
    // scoring). Applying falseCreator to a quiz strips every isCorrect, which breaks
    // the client-side checkAnswer (filter(options,'isCorrect')[0] becomes undefined).
    const questionArray = response?.data?.isAssessment
      ? sampledQuestions.map(falseCreator)
      : sampledQuestions
    const questionObject = {
      isAssessment: response?.data?.isAssessment,
      passPercentage: response?.data?.passPercentage,
      questions: questionArray,
      randomCount,
      timeLimit: response?.data?.timeLimit,
    }
    logInfo('Question format....' + questionObject)
    return questionObject
  })
}
// tslint:disable-next-line: no-any
const falseCreator = (nums: any) => {
  for (const value of nums.options) {
    value.isCorrect = false
  }
  return nums
}
