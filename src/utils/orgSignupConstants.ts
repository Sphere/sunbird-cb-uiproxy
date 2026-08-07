import { CONSTANTS } from './env'

/**
 * Shared across the org-signup flows (UPSMF, mpNHM, BNRC): MSG91 OTP
 * endpoints plus the Sunbird user-service endpoints each of those flows
 * calls to create/assign-role/update a user.
 */
export const API_END_POINTS = {
  assignRole: `${CONSTANTS.HTTPS_HOST}/api/user/private/v1/assign/role`,
  createUser: `${CONSTANTS.HTTPS_HOST}/api/user/v3/create`,
  migrateUser: `${CONSTANTS.SB_EXT_API_BASE_2}/user/v1/migrate`,
  msg91ResendOtp: `https://control.msg91.com/api/v5/otp/retry`,
  msg91SendOtp: `https://control.msg91.com/api/v5/otp`,
  msg91VerifyOtp: `https://control.msg91.com/api/v5/otp/verify`,
  profileUpdate: `${CONSTANTS.HTTPS_HOST}/api/user/private/v1/update`,
  userSearch: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
}

export const MSG91_HEADERS = {
  accept: 'application/json',
  authkey: CONSTANTS.MSG_91_AUTH_KEY_SSO,
  'content-type': 'application/json',
}

export const INDIAN_COUNTRY_CODE = '+91'
export const REGISTRATION_SOURCE = 'Self Registration'
export const STANDARD_DOB = '01/01/1970'
export const USER_SUCCESS_REGISTRATION_MESSAGE = `Registration Successful! Kindly download e-Kshamata app - <a class="blue" target="_blank" href="https://bit.ly/E-kshamataApp">https://bit.ly/E-kshamataApp</a> and login using your given mobile number using OTP.`
