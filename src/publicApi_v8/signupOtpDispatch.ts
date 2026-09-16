import axios from 'axios'
import { Response } from 'express'
import {
  API_END_POINTS,
  INDIAN_COUNTRY_CODE as indianCountryCode,
  MSG91_HEADERS as msg91Headers,
} from '../utils/autoLoginSignupConstants'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { getOTP, validateOTP } from './otp'

// sonar-cleanup: extracted from signupWithAutoLogin.ts's, signupWithAutoLoginV2.ts's,
// and appSignUpWithAutoLogin.ts's byte-identical post-registration OTP-dispatch
// tail (CHANGE 33). appSignUpWithAutoLogin.ts's success responses include one
// extra field (`userUUId: userId`) that the other two don't — preserved via
// the optional `extraSuccessFields` parameter, defaulting to none.
/**
 * Sends a registration OTP by phone (if given) or by email otherwise, and
 * responds with the outcome.
 * @param res the Express response to send the result to
 * @param userPhone the phone number to send an OTP to, if present
 * @param userEmail the email address to send an OTP to, used only when userPhone is empty
 * @param userId the id of the just-created user
 * @param extraSuccessFields additional fields merged into the success response body
 */
export async function sendRegistrationOtp(
  res: Response,
  userPhone: string,
  userEmail: string,
  userId: string,
  // tslint:disable-next-line: no-any
  extraSuccessFields?: object
) {
  if (userPhone) {
    try {
      logInfo('Autologin send otp through phone', userPhone)
      await axios({
        headers: msg91Headers,
        params: {
          mobile: `${indianCountryCode}${userPhone}`,
          template_id: CONSTANTS.MSG_91_TEMPLATE_ID_SEND_OTP_SSO,
        },

        method: 'POST',
        url: API_END_POINTS.msg91SendOtp,
      })
      return res.status(200).json({
        data: `OTP successfully sent on email ${userPhone}`,
        message: 'User successfully created',
        status: 200,
        userId,
        ...extraSuccessFields,
      })
    } catch (error) {
      logError('Error while sending mobile OTP', JSON.stringify(error))
      return res.status(500).send({
        message: `OTP generation fail for phone ${userPhone}`,
        status: 'failed',
      })
    }

  }
  if (userEmail) {
    try {
      logInfo('Autologin send otp through email', userEmail)
      await getOTP(
        userId,
        userEmail,
        'email'
      )
      res.status(200).json({
        data: `OTP successfully sent on email ${userEmail}`,
        message: 'User successfully created',
        status: 200,
        userId,
        ...extraSuccessFields,
      })
    } catch (error) {
      logError('Error while sending email OTP', JSON.stringify(error))
      res.status(500).send({
        message: `OTP generation fail for email ${userEmail}`,
        status: 'failed',
      })
    }
  }
}

// sonar-cleanup: extracted from signupWithAutoLogin.ts's and
// signupWithAutoLoginV2.ts's byte-identical OTP-verify block (CHANGE 33).
// The original code used `return res.status(400)...` on a verification
// failure, which exits the WHOLE route handler immediately — including
// skipping signupWithAutoLoginV2.ts's `else` branch that fires its own 400
// when neither phone nor email is provided. A plain boolean return here
// would lose that early-exit: the caller's own `if (verified) {...} else
// {...}` would then run the else branch too, double-sending a response.
// So this returns `undefined` specifically for "already responded, caller
// must return immediately" — distinct from `false`, which means "neither
// phone nor email was provided, continue with your own existing
// true/false handling" (signupWithAutoLoginV2.ts's else branch handles
// that case; signupWithAutoLogin.ts has no else — a pre-existing gap
// where that case sends no response at all — preserved, not fixed).
/**
 * Verifies a registration OTP by phone (via MSG91) and/or by email (via
 * validateOTP), sending a 400 response itself if either check fails.
 * @param res the Express response to send a 400 to on verification failure
 * @param mobileNumber the phone number to verify an OTP for, if present
 * @param email the email address to verify an OTP for, if present
 * @param userUUId the user id passed through to the email verification call
 * @param validOtp the OTP code to verify
 * @returns `undefined` if a 400 was already sent (caller must return immediately); otherwise true if verification succeeded, false if neither phone nor email was provided
 */
export async function verifyRegistrationOtp(
  res: Response,
  mobileNumber: string,
  email: string,
  userUUId: string,
  validOtp: string
): Promise<boolean | undefined> {
  let userOtpVerified = false
  if (mobileNumber) {
    logInfo('VALIDATE_OTP: for phone', mobileNumber, validOtp)
    const verifyOtpResponse = await axios({
      headers: msg91Headers,
      method: 'GET',
      params: {
        mobile: `${indianCountryCode}${mobileNumber}`,
        otp: validOtp,
      },
      url: API_END_POINTS.msg91VerifyOtp,
    })
    logInfo('VALIDATE_OTP: response phone', JSON.stringify(verifyOtpResponse.data))
    if (verifyOtpResponse.data.type !== 'success') {
      res.status(400).json({
        message: 'Phone OTP validation failed try again',
      })
      return undefined
    }
    userOtpVerified = true
  }
  if (email) {
    logInfo('VALIDATE_OTP: for email')
    const verifyOtpResponse = await validateOTP(
      userUUId,
      email,
      'email',
      validOtp
    )
    logInfo('VALIDATE_OTP: response email', JSON.stringify(verifyOtpResponse.data))
    if (verifyOtpResponse.data.result.response !== 'SUCCESS') {
      res.status(400).json({
        message: 'Email OTP validation failed try again',
      })
      return undefined
    }
    userOtpVerified = true
  }
  return userOtpVerified
}
