import axios from "axios";
import _ from "lodash";
import { logInfo } from "../utils/logger";
export async function jumbler(path: string) {
  const sunbirdUrl =
    "https://sunbirdcontent.s3-ap-south-1.amazonaws.com/" + path;
  return axios({
    method: "get",
    url: sunbirdUrl,
  }).then((response) => {
    logInfo("Success IN Getting Assessment JSON >>>>>>>>>>>" + response);
    return _.sampleSize(response.data.questions, 2).map(falseCreator);
  });
}
const falseCreator = (nums: any) => {
  for (let value of nums.options) {
    value.isCorrect = false;
  }
  return nums;
};
