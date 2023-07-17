import axios from "axios";
import { Router } from "express";
import { CONSTANTS } from "../utils/env";
import { logInfo } from "../utils/logger";

const API_END_POINTS = {
  // tslint:disable-next-line: no-any
  recommendationAPI: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/recom/`,
};
const unknownError = "Failed due to unknown reason";

export const recommendationEngineV2 = Router();
recommendationEngineV2.get("/", async (req, res) => {
  try {
    if (!req.query.background || !req.query.profession) {
      res.status(400).json({
        message: "Background or profession missing",
      });
    }
    logInfo(req.query.params, "params from recommendation engine");
    /* tslint:disable-next-line */
    const response = await axios({
      method: "GET",
      params: {
        background: req.query.background,
        profession: req.query.profession,
      },
      url: API_END_POINTS.recommendationAPI,
    });
    logInfo(response.data, "response from recommendation engine");
    res.status(response.status).send(response.data);
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    );
  }
});
