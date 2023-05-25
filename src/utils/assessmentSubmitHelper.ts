import axios from "axios";
import _ from "lodash";
import { CONSTANTS } from "./env";
import { logError, logInfo } from "./logger";
const API_END_POINTS = {
  assessmentSubmitV2: `${CONSTANTS.SB_EXT_API_BASE_2}/v2/user`,
  updateAssessmentContent: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/course/v1/content/state/update`,
};

export async function assessmentCreator(
  // tslint:disable-next-line: no-any
  assessmentReqData: any,
  // tslint:disable-next-line: no-any
  userToken: any,
  // tslint:disable-next-line: no-any
  userId: any
) {
  const statusMessage = {
    data: {},
    message: "Assessment submitted successfully",
    status: 200,
  };
  try {
    const batchId = assessmentReqData.batchId;
    const courseId = assessmentReqData.courseId;
    const assessmentId = assessmentReqData.contentId;
    const assessmentQuestions = await fetchAssessment(
      assessmentReqData.artifactUrl
    );
    let passPercentage = 60;
    if (assessmentReqData.passPercentage == 0) {
      passPercentage = 0;
    } else if (assessmentReqData.passPercentage) {
      passPercentage = assessmentReqData.passPercentage;
    }
    logInfo(JSON.stringify(passPercentage), "passPercentage");
    if (assessmentQuestions) {
      const formatedRequest = getFormatedRequest(
        assessmentQuestions,
        assessmentReqData
      );
      const url = `${API_END_POINTS.assessmentSubmitV2}/assessment/submit`;
      const response = await axios({
        data: formatedRequest,
        headers: {
          Authorization: CONSTANTS.SB_API_KEY,
          rootOrg: "aastar",
          userId,
          "x-authenticated-user-token": userToken,
        },
        method: "POST",
        url,
      });
      logInfo("Submit assessment response", response.data);
      const revisedData = {
        request: {
          contents: [
            {
              batchId,
              completionPercentage: 100,
              contentId: assessmentId,
              courseId,
              status: 2,
            },
          ],
          userId,
        },
      };
      logInfo("response.data.result", response.data.result);
      if (response.data.result >= passPercentage) {
        response.data.passPercent = passPercentage;
        logInfo("Came inside if condition");
        await axios({
          data: revisedData,
          headers: {
            Authorization: CONSTANTS.SB_API_KEY,
            "x-authenticated-user-token": userToken,
          },
          method: "PATCH",
          url: API_END_POINTS.updateAssessmentContent,
        });
      }
      statusMessage.data = response.data;
      return statusMessage;
    }
  } catch (err) {
    statusMessage.status = 404;
    statusMessage.message = "Error occured while submit in cb-ext";
    return statusMessage;
  }
}
const fetchAssessment = async (artifactUrl: string) => {
  logInfo("Checking fetchAssessment : ", artifactUrl);
  try {
    const response = await axios({
      method: "GET",
      url: artifactUrl,
    });
    logInfo("Response Data in JSON :", response.data);
    if (response.data.questions) {
      logInfo("Response questions :", _.get(response, "data"));
      return _.get(response, "data");
    }
  } catch (err) {
    logError("fetchAssement  failed");
  }
};
// tslint:disable-next-line: no-any
const getFormatedRequest = (data: any, requestBody: any) => {
  logInfo(
    "Response of questions in in getFormated method JSON :",
    JSON.stringify(data.questions)
  );

  _.forEach(data.questions, (qkey) => {
    _.forEach(requestBody.questions, (reqKey) => {
      if (
        qkey.questionType === "mcq-sca" ||
        qkey.questionType === "fitb" ||
        qkey.questionType === "mcq-mca"
      ) {
        _.forEach(qkey.options, (qoptKey) => {
          _.forEach(reqKey.options, (optKey) => {
            if (optKey.optionId === qoptKey.optionId) {
              if (
                qkey.questionType === "mcq-sca" ||
                qkey.questionType === "fitb" ||
                qkey.questionType === "mcq-mca"
              ) {
                _.set(optKey, "isCorrect", _.get(qoptKey, "isCorrect"));
                _.set(optKey, "text", _.get(qoptKey, "text"));
              } else if (qkey.questionType === "mtf") {
                _.set(optKey, "isCorrect", _.get(qoptKey, "isCorrect"));
                _.set(optKey, "match", _.get(qoptKey, "match"));
              }
            }
          });
        });
      }
    });
  });
  logInfo("requestBody to submit the assessment ", JSON.stringify(requestBody));
  return requestBody;
};
