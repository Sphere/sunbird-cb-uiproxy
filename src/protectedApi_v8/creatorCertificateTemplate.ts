import axios from "axios";
import express from "express";
import { CONSTANTS } from "../utils/env";
import { logInfo } from "../utils/logger";
import { extractUserToken } from "../utils/requestExtract";
import { Logic } from "keycloak-admin/lib/defs/policyRepresentation";

export const creatorCertificateTemplate = express.Router();
const templateAddEndpoint = `${CONSTANTS.HTTPS_HOST}/api/course/batch/cert/v1/template/add`;
creatorCertificateTemplate.patch("/template/add", async (req, res) => {
  try {
    const templateBody = req.body.request.batch;
    logInfo("URL", templateAddEndpoint);
    logInfo("template body", JSON.stringify(templateBody));
    const courseId = templateBody.courseId;
    const batchId = templateBody.batchId;
    const template = templateBody.template;
    if (!courseId || !batchId || !template) {
      res.status(400).json({
        message: "Either courseId, batchId, template missing",
        status: "FAILED",
      });
      return;
    }
    const templateAddResponse = await axios({
      data: req.body,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        "x-authenticated-user-token": extractUserToken(req),
      },
      method: "PATCH",
      url: templateAddEndpoint,
    });
    logInfo("add response", JSON.stringify(templateAddResponse.data));
    logInfo("templateAddResponse", JSON.stringify(templateAddResponse));
    res.status(200).json({
      message: "SUCCESS",
      response: templateAddResponse.data,
    });
  } catch (error) {
    logInfo(JSON.stringify(error));
    res.status(400).json({
      message: "FAILED",
      response: "Error occurred while template add",
    });
  }
});
