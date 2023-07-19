import axios from "axios";
import { Router } from "express";
import { CONSTANTS } from "../utils/env";
import { logInfo } from "../utils/logger";

const API_END_POINTS = {
  // tslint:disable-next-line: no-any
  recommendationAPI: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/course/recommendation`,
};
const unknownError = "Failed due to unknown reason";

export const recommendationEngineV2 = Router();
recommendationEngineV2.get("/", async (req, res) => {
  try {
    /* tslint:disable-next-line */
    let responseObject = {
      background: req.query.background,
      profession: req.query.profession,
    };
    if (!req.query.background) {
      delete responseObject.background;
    }
    if (!req.query.profession) {
      delete responseObject.profession;
    }
    console.log(responseObject);
    const response = await axios({
      method: "GET",
      params: responseObject,
      url: API_END_POINTS.recommendationAPI,
    });
    logInfo(response.data, "response from recommendation engine");
    res.status(response.status).send(response.data);
  } catch (err) {
    console.log(err);
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    );
  }
});
