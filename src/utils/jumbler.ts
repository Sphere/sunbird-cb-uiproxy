import axios from "axios";
import _ from "lodash";
import { logInfo } from "./logger";
export async function jumbler(path: string) {
  const sunbirdUrl =
    "https://sunbirdcontent.s3-ap-south-1.amazonaws.com/" + path;
  return axios({
    method: "get",
    url: sunbirdUrl,
  }).then((response) => {
    const randomCount =
      response.data.randomCount || response.data.questions.length;
    logInfo("Success IN Getting Assessment JSON >>>>>>>>>>>" + response);
    return _.sampleSize(response.data.questions, randomCount).map(falseCreator);
  });
}
// tslint:disable-next-line: no-any
const falseCreator = (nums: any) => {
  for (const value of nums.options) {
    value.isCorrect = false;
  }
  return nums;
};
