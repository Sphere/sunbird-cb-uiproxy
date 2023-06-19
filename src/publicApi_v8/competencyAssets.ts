import axios from "axios";
import { Router } from "express";
import { CONSTANTS } from "../utils/env";
export const competencyAssets = Router();
competencyAssets.get("/roleWiseCompetencyData", async (_req, res) => {
  try {
    const filePath = CONSTANTS.COMPETENCY_ROLES_DATA_PATH;
    const response = await axios({
      headers: {},
      method: "GET",
      url: filePath,
    });
    res.status(200).json({
      status: 200,
      response: response.data,
    });
  } catch (err) {
    res.status(404).json({
      status: 404,
      message: "Error while competency data fetch",
    });
  }
});
competencyAssets.get("/rolesMappingData", async (_req, res) => {
  try {
    const filePath = CONSTANTS.COMPETENCY_ROLES_MAPPING_PATH;
    const response = await axios({
      headers: {},
      method: "GET",
      url: filePath,
    });
    res.status(200).json({
      status: 200,
      response: response.data,
    });
  } catch (err) {
    res.status(404).json({
      status: 404,
      message: "Error while competency mapping fetch ",
    });
  }
});
