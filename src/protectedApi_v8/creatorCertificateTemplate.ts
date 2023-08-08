import axios from "axios";
import express from "express";
import { CONSTANTS } from "../utils/env";
import { extractUserToken } from "../utils/requestExtract";
import { logInfo } from "src/utils/logger";

export const creatorCertificateTemplate = express.Router();
const templateAddEndpoint = `${CONSTANTS.HTTPS_HOST}/api/course/batch/cert/v1/template/add`;
creatorCertificateTemplate.patch("/template/add", async (req, res) => {
  try {
    const templateBody = req.body.request.batch;
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
        "Content-Type": "application/json",
      },
      method: "PATCH",
      url: templateAddEndpoint,
    });
    logInfo(JSON.stringify(templateAddResponse.data));
    res.status(200).json({
      message: "SUCCESS",
      response: templateAddResponse,
    });
  } catch (error) {
    res.status(400).json({
      message: "FAILED",
      response: "Error while adding template",
    });
  }
});
