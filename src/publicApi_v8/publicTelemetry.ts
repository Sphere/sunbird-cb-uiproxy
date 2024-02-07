import axios from "axios";
import { Request, Response, Router } from "express";
import { axiosRequestConfig } from "../configs/request.config";
import { CONSTANTS } from "../utils/env";
import { logInfo } from "../utils/logger";

const API_END_POINTS = {
  telemetry: `${CONSTANTS.TELEMETRY_SB_BASE}/v1/telemetry`,
};

export const publicTelemetry = Router();

publicTelemetry.post("/", async (req: Request, res: Response) => {
  logInfo("Reuest Body for TELEMETRY -", JSON.stringify(req.body));
  try {
    const response = await axios.post(
      API_END_POINTS.telemetry,
      req.body,
      axiosRequestConfig
    );

    res.status(response.status).send(response.data);
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: "Failed due to unknown reason",
      }
    );
  }
});


publicTelemetry.post("/telemetry", async (req: Request, res: Response) => {
  logInfo("Reuest Body for TELEMETRY -", JSON.stringify(req.body));
  try {
    const response = await axios.post(
      API_END_POINTS.telemetry,
      req.body,
      axiosRequestConfig
    );

    res.status(response.status).send(response.data);
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: "Failed due to unknown reason",
      }
    );
  }
});