import axios from "axios";
import { Router } from "express";
import _ from "lodash";
import { axiosRequestConfig } from "../configs/request.config";
import { CONSTANTS } from "../utils/env";
import { logError, logInfo } from "../utils/logger";
const API_END_POINTS = {
  createUserWithMobileNo: `${CONSTANTS.KONG_API_BASE}/user/v1/signup`,
  fetchUserByMobileNo: `${CONSTANTS.KONG_API_BASE}/user/v3/create/`,
};

export const emailOrMobileLogin = Router();

emailOrMobileLogin.post("/signup", async (req, res) => {
  try {
    if (!req.body.phone) {
      res.status(400).json({
        msg: "Mobile no. can not be empty",
        status: "error",
        status_code: 400,
      });
    }
    const { phone, firstName, email, lastName, password } = req.body;
    // tslint:disable-next-line: no-any
    let profile: any = {};
    let isUserExist = {};
    let newUserDetails = {};
    logInfo("Req body", req.body);
    logInfo("Phone : ", phone);
    if (phone) {
      isUserExist = await fetchUserBymobileorEmail(phone);
    } else {
      isUserExist = await fetchUserBymobileorEmail(email);
    }

    if (!isUserExist) {
      logInfo("creating new  user");
      // tslint:disable-next-line: no-any
      profile = {
        emailId: email,
        fname: firstName,
        lname: lastName,
        mobile: phone,
        password: password,
      };
      newUserDetails = await createuserWithmobileOrEmail(profile).catch(
        handleCreateUserError
      );
      if (newUserDetails) {
        res.status(200).json({
          msg: "user created successfully",
          status: "success",
          status_code: 200,
        });
      }
    } else {
      logInfo("Mobile already exists.");
      res.status(400).json({
        msg: "Mobile Number already exists.",
        status: "error",
        status_code: 400,
      });
      return;
    }
  } catch (error) {
    res.status(401).send({
      error: "error while creating user !!",
    });
  }
});
// tslint:disable-next-line: no-any
const handleCreateUserError = (error: any) => {
  logInfo("Error ocurred while creating user" + error);
  if (_.get(error, "error.params")) {
    throw error.error.params;
  } else if (error instanceof Error) {
    throw error.message;
  } else {
    throw new Error("unhandled exception while getting userDetails");
  }
};
const fetchUserBymobileorEmail = async (searchValue: string) => {
  logInfo(
    "Checking Fetch Mobile no : ",
    API_END_POINTS.fetchUserByMobileNo + searchValue
  );
  try {
    const response = await axios({
      ...axiosRequestConfig,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
      },
      method: "GET",
      url: API_END_POINTS.fetchUserByMobileNo + searchValue,
    });
    logInfo("Response Data in JSON :", JSON.stringify(response.data));
    logInfo("Response Data in Success :", response.data.responseCode);
    if (response.data.responseCode === "OK") {
      logInfo(
        "Response result.exists :",
        _.get(response, "data.result.exists")
      );
      return _.get(response, "data.result.exists");
    }
  } catch (err) {
    logError("fetchUserByMobile  failed");
  }
};

// tslint:disable-next-line: no-any
const createuserWithmobileOrEmail = async (accountDetails: any) => {
  if (!accountDetails.name || accountDetails.name === "") {
    throw new Error("USER_NAME_NOT_PRESENT");
  }
  try {
    const response = await axios({
      ...axiosRequestConfig,
      data: {
        request: {
          firstName: accountDetails.fname,
          lastName: accountDetails.lname,
          password: accountDetails.password,
          phone: accountDetails.mobile,
        },
      },
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
      },
      method: "POST",
      url: API_END_POINTS.createUserWithMobileNo,
    });
    if (response.data.responseCode === "OK") {
      logInfo("Log of createuser if OK :");
      return response.data;
    } else {
      throw new Error(
        _.get(response.data, "params.errmsg") ||
          _.get(response.data, "params.err")
      );
    }
  } catch (err) {
    logError("createuserwithmobile failed");
  }
};
