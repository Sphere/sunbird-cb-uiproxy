import axios from "axios";
import _ from "lodash";
import { CONSTANTS } from "./env";
import { logInfo } from "./logger";
const S3_BUCKET_URL = `${CONSTANTS.S3_BUCKET_URL}`;

export async function jumbler(path: string) {
  const sunbirdUrl = S3_BUCKET_URL + path;
  return axios({
    method: "get",
    url: sunbirdUrl,
  }).then((response) => {
    const randomCount =
      response.data.randomCount || response.data.questions.length;
    logInfo("Success IN Getting Assessment JSON >>>>>>>>>>>" + response);
    const questionArray = _.sampleSize(
      response.data.questions,
      randomCount
    ).map(falseCreator);
    const questionObject = {
      isAssessment: true,
      questions: questionArray,
      randomCount,
      timeLimit: response.data.timeLimit,
    };
    logInfo("Question format...." + questionObject);
    return questionObject;
  });
}
// tslint:disable-next-line: no-any
const falseCreator = (nums: any) => {
  for (const value of nums.options) {
    value.isCorrect = false;
  }
  return nums;
};
