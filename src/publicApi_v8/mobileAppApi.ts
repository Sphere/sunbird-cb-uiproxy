import axios from "axios";
import { Router } from "express";
import jwt_decode from "jwt-decode";
import request from "request";
import { assessmentCreator } from "../utils/assessmentSubmitHelper";
import { CONSTANTS } from "../utils/env";
import { jumbler } from "../utils/jumbler";
import { logError, logInfo } from "../utils/logger";
import { getCurrentUserRoles } from "./rolePermission";

const API_END_POINTS = {
  CERTIFICATE_DOWNLOAD: `${CONSTANTS.HTTPS_HOST}/api/certreg/v2/certs/download`,
  GET_ALL_ENTITY: `${CONSTANTS.ENTITY_API_BASE}/getAllEntity`,
  GET_ENTITY_BY_ID: `${CONSTANTS.ENTITY_API_BASE}/getEntityById/`,
  READ_PROGRESS: `${CONSTANTS.HTTPS_HOST}/api/course/v1/content/state/read`,
  RECOMMENDATION_API: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/course/recommendation`,
  UPDATE_PROGRESS: `${CONSTANTS.HTTPS_HOST}/api/course/v1/content/state/update`,
};

const GET_ENTITY_BY_ID_FAIL =
  "Sorry ! couldn't get entity for the respective ID.";
const GET_ALL_ENTITY_FAIL = "Sorry ! couldn't get all the entity";

const authenticatedToken = "x-authenticated-user-token";
const contenyTypeHeader = { "Content-Type": "application/json" };
// tslint:disable-next-line: no-any
const getHeaders = (req: any) => {
  return {
    Authorization: CONSTANTS.SB_API_KEY,
    contenyTypeHeader,
    "x-authenticated-user-token": req.headers[authenticatedToken],
  };
};
export const mobileAppApi = Router();

// tslint:disable-next-line: no-any
const verifyToken = (req: any, res: any) => {
  try {
    const accessToken = req.headers[authenticatedToken];
    // tslint:disable-next-line: no-any
    const decodedToken: any = jwt_decode(accessToken.toString());
    const decodedTokenArray = decodedToken.sub.split(":");
    const userId = decodedTokenArray[decodedTokenArray.length - 1];
    return {
      accessToken,
      decodedToken,
      status: 200,
      userId,
    };
  } catch (error) {
    return res.status(404).json({
      message: "User token missing or invalid",
      redirectUrl: "https://sphere.aastrika.org/public/home",
    });
  }
};
mobileAppApi.get("/getContents/*", (req, res) => {
  try {
    const path = removePrefix(
      "/public/v8/mobileApp/getContents/",
      req.originalUrl
    );
    const sunbirdUrl = CONSTANTS.S3_BUCKET_URL + path;
    logInfo(
      "New getcontents sunbird URL for Mobile APP >>>>>>>>>>> ",
      sunbirdUrl
    );
    return request(sunbirdUrl).pipe(res);
  } catch (err) {
    res.status(404).json({
      message: "Content not found",
    });
  }
});

mobileAppApi.post("/submitAssessment", async (req, res) => {
  try {
    const accesTokenResult = verifyToken(req, res);
    if (accesTokenResult.status == 200) {
      const accessToken = accesTokenResult.accessToken;
      const userId = accesTokenResult.userId;
      const assessmentSubmitStatus = await assessmentCreator(
        req.body,
        accessToken,
        userId
      );
      res
        .status(assessmentSubmitStatus.status)
        .json(assessmentSubmitStatus.data);
    }
  } catch (err) {
    res.status(404).json({
      message: "Error occured while submit",
    });
  }
});
mobileAppApi.get("/v1/assessment/*", async (req, res) => {
  try {
    const path = removePrefix(
      "/public/v8/mobileApp/v1/assessment/",
      req.originalUrl
    );
    jumbler(path).then((response) => {
      return res.send(response);
    });
    logInfo("New getAssessments competency mobile APP >>>>>>>>>>> ", path);
  } catch (err) {
    res.status(404).json({
      message: "Error occured while get assessment",
    });
  }
});
mobileAppApi.post("/v1/competencyAssessment/submit", async (req, res) => {
  try {
    const accesTokenResult = verifyToken(req, res);
    const accessToken = accesTokenResult.accessToken;
    const userId = accesTokenResult.userId;
    const assessmentData = req.body;
    const assessmentSubmitStatus = await assessmentCreator(
      assessmentData,
      accessToken,
      userId
    );
    res.status(assessmentSubmitStatus.status).json(assessmentSubmitStatus.data);
  } catch (err) {
    res.status(404).json({
      message: "Error occured while submit assessment",
    });
  }
});
// tslint:disable-next-line: no-any
mobileAppApi.get("/webviewLogin", async (req: any, res) => {
  const accesTokenResult = verifyToken(req, res);
  const accessToken = accesTokenResult.accessToken;
  const decodedToken = accesTokenResult.decodedToken;
  const userId = accesTokenResult.userId;
  if (accesTokenResult.status == 200) {
    req.session.userId = userId;
    logInfo(userId, "userid......................");
    req.kauth = {
      grant: {
        access_token: { content: decodedToken, token: accessToken },
      },
    };
    req.session.grant = {
      access_token: { content: decodedToken, token: accessToken },
    };
    logInfo("Success ! Entered into usertokenResponse..");
    await getCurrentUserRoles(req, accessToken);
    res.status(200).json({
      message: "success",
      redirectUrl: "https://sphere.aastrika.org/app/profile-view",
    });
  }
});
mobileAppApi.post("/getEntityById/:id", async (req, res) => {
  try {
    const accesTokenResult = verifyToken(req, res);
    if (accesTokenResult.status == 200) {
      const response = await axios({
        data: req.body,
        headers: {
          authenticatedToken: req.headers[authenticatedToken],
          contenyTypeHeader,
        },
        method: "POST",
        url: `${API_END_POINTS.GET_ENTITY_BY_ID}+${req.params.id}`,
      });
      logInfo("Check req body of getEntityByID >> " + req.body);
      res.status(response.data.responseCode).send(response.data);
    }
  } catch (error) {
    logError("Error in getEntityById  >>>>>>" + error);
    res.status(500).send({
      message: GET_ENTITY_BY_ID_FAIL,
      status: "failed",
    });
  }
});
mobileAppApi.post("/getAllEntity", async (req, res) => {
  try {
    const accesTokenResult = verifyToken(req, res);
    if (accesTokenResult.status == 200) {
      const response = await axios({
        data: req.body,
        headers: {
          authenticatedToken: req.headers[authenticatedToken],
          contenyTypeHeader,
        },
        method: "POST",
        url: API_END_POINTS.GET_ALL_ENTITY,
      });
      logInfo("Check req body of getAllEntity >> " + req.body);
      res.status(response.data.responseCode).send(response.data);
    }
  } catch (error) {
    logError("Error in GET_ALL_ENTITY  >>>>>>" + error);
    res.status(500).send({
      message: GET_ALL_ENTITY_FAIL,
      status: "failed",
    });
  }
});
function removePrefix(prefix: string, s: string) {
  return s.substr(prefix.length);
}
mobileAppApi.post("/v2/updateProgress", async (req, res) => {
  try {
    const accesTokenResult = verifyToken(req, res);
    if (accesTokenResult.status == 200) {
      await axios({
        data: req.body,
        headers: getHeaders(req),
        method: "PATCH",
        url: API_END_POINTS.UPDATE_PROGRESS,
      });
      logInfo("Check req body of getAllEntity >> " + req.body);
      const stateReadBody = {
        request: {
          batchId: req.body.request.contents[0].batchId,
          contentIds: [],
          courseId: req.body.request.contents[0].courseId,
          fields: ["progressdetails"],
          userId: req.body.request.userId,
        },
      };
      const responseProgressRead = await axios({
        data: stateReadBody,
        headers: getHeaders(req),
        method: "POST",
        url: API_END_POINTS.READ_PROGRESS,
      });
      logInfo("Check req body of update progress v2 >> " + req.body);
      res.status(200).json(responseProgressRead.data);
    }
  } catch (error) {
    logError("Error in update progress v2  >>>>>>" + error);
    res.status(500).send({
      message: "Something went wrong during progress update",
      status: "failed",
    });
  }
});
mobileAppApi.get("/version", async (_req, res) => {
  try {
    const filePath = CONSTANTS.APP_VERSION_PATH;
    const response = await axios({
      headers: {},
      method: "GET",
      url: filePath,
    });
    const filteredData = response.data;
    res.status(200).json({
      message: "success",
      response: filteredData,
      status: 200,
    });
  } catch (err) {
    res.status(404).json({
      message: "Content not found",
    });
  }
});
mobileAppApi.get("/courseRemommendationv2", async (req, res) => {
  try {
    /* tslint:disable-next-line */
    let responseObject = {
      background: req.query.background || "",
      profession: req.query.profession || "",
    };
    if (!req.query.background) {
      delete responseObject.background;
    }
    if (!req.query.profession) {
      delete responseObject.profession;
    }
    const response = await axios({
      method: "GET",
      params: responseObject,
      url: API_END_POINTS.RECOMMENDATION_API,
    });
    res.status(response.status).send(response.data);
  } catch (err) {
    logInfo(JSON.stringify(err));
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: "Exception occured in recommendation service",
      }
    );
  }
});
mobileAppApi.get("/certificateDownload", async (req, res) => {
  try {
    let { userId, certificateId } = req.query;
    const accesTokenResult = verifyToken(req, res);
    if (!userId || !certificateId || accesTokenResult.userId != userId) {
      return res.status(400).json({
<<<<<<< HEAD
        status: "FAILED",
        message: "Token, Userid or Certificate missing or invalid",
      });
    }
    const certificateDownloadResponse = await axios({
      method: "GET",
      params: userId,
      headers: { Authorization: CONSTANTS.SB_API_KEY },
      url: `${API_END_POINTS.CERTIFICATE_DOWNLOAD}/${certificateId}`,
    });
    res.status(200).json({
      status: "SUCCESS",
      data: certificateDownloadResponse.data.result,
    });
  } catch (error) {
    res.status(400).json({
      status: "FAILED",
      message: "Error occurred while certificate download",
=======
        message: "Token, Userid or Certificate missing or invalid",
        status: "FAILED",
      });
    }
    const certificateDownloadResponse = await axios({
      headers: { Authorization: CONSTANTS.SB_API_KEY },
      method: "GET",
      params: userId,
      url: `${API_END_POINTS.CERTIFICATE_DOWNLOAD}/${certificateId}`,
    });
    res.status(200).json({
      data: certificateDownloadResponse.data.result,
      status: "SUCCESS",
    });
  } catch (error) {
    res.status(400).json({
      message: "Error occurred while certificate download",
      status: "FAILED",
>>>>>>> 640b17bc4fac7999c2cda42bfddab929d0dad3d3
    });
  }
});
