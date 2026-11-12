import axios from 'axios'
import _ from 'lodash'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
import { API_END_POINTS } from './apiConstants'
export const getOTP = async (
                                userUUId: string,
                                userKey: string,
                                userType: string
                              ) => {
  logInfo('generate otp endpoints for kong', API_END_POINTS.generateOtp)
  return axios({
    ...axiosRequestConfig,
    data: {
      request: { userId: userUUId, key: userKey, type: userType },
    },
    headers: { Authorization: CONSTANTS.SB_API_KEY },
    method: 'POST',
    url: API_END_POINTS.generateOtp,
  })
}

export const validateOTP = async (
  userUUId: string,
  userKey: string,
  userType: string,
  userOtp: string
) => {
  logInfo('Entered into /validateOtp ')
  return axios({
    ...axiosRequestConfig,
    data: {
      request: {
        key: userKey,
        otp: userOtp,
        type: userType,
        userId: userUUId,
      },
    },
    headers: { Authorization: CONSTANTS.SB_API_KEY },
    method: 'POST',
    url: API_END_POINTS.verifyOtp,
  })
}
