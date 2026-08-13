import axios from 'axios'
import { CONSTANTS } from './env'
import { logError, logInfo } from './logger'
import { API_END_POINTS, INDIAN_COUNTRY_CODE, MSG91_HEADERS } from './orgSignupConstants'

// sonar-cleanup: extracted from upsmfUser.ts / mpNHMUser.ts / bnrcUser.ts's
// byte-identical getUserDetails(phone) (CHANGE 30) — searches the Sunbird
// user service by phone, same request/response shape in all three org-signup
// flows since they all share the API_END_POINTS.userSearch endpoint already
// (utils/orgSignupConstants.ts)
/**
 * Looks up a user by phone number via the Sunbird user-search endpoint,
 * returning the first matching user record if one exists.
 * @param phone phone number to search for
 */
export async function getUserDetails(phone: number) {
  try {
    const userDetails = await axios({
      data: {
        request: {
          filters: {
            phone: phone.toString(),
          },
        },
      },
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      url: API_END_POINTS.userSearch,
    })
    // tslint:disable-next-line: all
    if (userDetails.data.result.response.content.length > 0) return { message: 'success', userDetails: userDetails.data.result.response.content[0] }
    return { message: 'success', userDetails: '' }
  } catch (error) {
    logError('Error while user search', JSON.stringify(error))
    return { message: 'failed' }
  }
}

// sonar-cleanup: extracted from upsmfUser.ts / mpNHMUser.ts / bnrcUser.ts's
// near-identical createUser (CHANGE 30). orgLabel carries the per-org log
// message (`'Create user upsmf body'` / `'Create user MP body'` /
// `'Create user bnrc body'`); timeoutMs carries mpNHMUser.ts's
// mpNHM-only `timeout: 60000` (upsmf/bnrc pass no timeout, matching their
// original calls exactly); getOrgName resolves the channel name, since each
// org's role-to-org mapping lives in a separate, genuinely different util
// (upsmfUtils.ts / mpUtils.ts / bnrcUser.ts's own local function).
/**
 * Creates a Sunbird user account for an org-signup flow.
 * @param userDetails the submitted registration form data
 * @param orgLabel org name used in the "Create user &lt;org&gt; body" log message
 * @param getOrgName resolves the Sunbird channel name from userDetails, per this org's role mapping
 * @param timeoutMs optional axios timeout in milliseconds (only mpNHMUser.ts's flow sets one)
 */
export async function createOrgSignupUser<T extends { firstName: string; lastName?: string; phone: number }>(
  userDetails: T,
  orgLabel: string,
  getOrgName: (userDetails: T) => string,
  timeoutMs?: number
) {
  try {
    logInfo(`Create user ${orgLabel} body`, JSON.stringify(userDetails))
    const userChannel = getOrgName(userDetails)
    const userCreationData = {
      request: {
        channel: userChannel,
        firstName: userDetails.firstName,
        lastName: userDetails.lastName || userDetails.firstName,
        password: CONSTANTS.BNRC_USER_DEFAULT_PASSWORD,
        phone: JSON.stringify(userDetails.phone),
      },
    }
    const userCreationResponse = await axios({
      data: userCreationData,
      headers: {
        authorization: CONSTANTS.SB_API_KEY,
      },
      method: 'POST',
      ...(timeoutMs ? { timeout: timeoutMs } : {}),
      url: API_END_POINTS.createUser,
    })
    if (userCreationResponse.data.result.userId) {
      return {
        message: 'success',
        userId: userCreationResponse.data.result.userId,
      }
    }
  } catch (error) {
    logError('Error while user creation', JSON.stringify(error))
    return {
      message: 'failed',
      userId: '',
    }
  }
}

// sonar-cleanup: extracted from upsmfUser.ts / mpNHMUser.ts / bnrcUser.ts's
// near-identical assignRoleToUser (CHANGE 30). Same timeoutMs/getOrgId
// parameterization as createOrgSignupUser above.
/**
 * Assigns the PUBLIC role to a newly created Sunbird user within their org.
 * @param userId the Sunbird user id returned by user creation
 * @param userDetails the submitted registration form data
 * @param getOrgId resolves the Sunbird organisation id from userDetails, per this org's role mapping
 * @param timeoutMs optional axios timeout in milliseconds (only mpNHMUser.ts's flow sets one)
 */
export async function assignOrgSignupUserRole<T>(
  userId: string,
  userDetails: T,
  getOrgId: (userDetails: T) => string,
  timeoutMs?: number
) {
  try {
    const userOrgId = getOrgId(userDetails)
    const userRoleAssignData = {
      request: {
        organisationId: userOrgId,
        roles: ['PUBLIC'],
        userId,
      },
    }
    const roleAssignResponse = await axios({
      data: userRoleAssignData,
      headers: {
        authorization: CONSTANTS.SB_API_KEY,
      },
      method: 'POST',
      ...(timeoutMs ? { timeout: timeoutMs } : {}),
      url: API_END_POINTS.assignRole,
    })
    if (roleAssignResponse.data.result.response == 'SUCCESS') {
      return true
    }
  } catch (error) {
    logError('Error while assigning user role', JSON.stringify(error))
    return false
  }
}

// sonar-cleanup: extracted from upsmfUser.ts / mpNHMUser.ts / bnrcUser.ts's
// '/otp/sendOtp' handlers (CHANGE 30). Only the raw MSG91 axios call is
// shared here — the surrounding logging/response text in each of the 9 OTP
// handlers across these 3 files differs in ways that include real
// pre-existing copy-paste bugs (some UPSMF/MP-NHM log lines still say
// "for BNRC"), so those were deliberately left untouched in each file
// rather than risk silently "fixing" or losing them in a forced merge.
/**
 * Sends an OTP to the given phone number via MSG91.
 * @param phone phone number (without country code) to send the OTP to
 */
export async function sendMsg91Otp(phone: string) {
  return axios({
    headers: MSG91_HEADERS,
    method: 'POST',
    params: {
      mobile: `${INDIAN_COUNTRY_CODE}${phone}`,
      template_id: CONSTANTS.MSG_91_TEMPLATE_ID_SEND_OTP_SSO,
    },
    url: API_END_POINTS.msg91SendOtp,
  })
}

// sonar-cleanup: extracted from upsmfUser.ts / mpNHMUser.ts / bnrcUser.ts's
// '/otp/resendOtp' handlers (CHANGE 30) — same rationale as sendMsg91Otp above.
/**
 * Requests MSG91 resend an OTP to the given phone number.
 * @param phone phone number (without country code) to resend the OTP to
 */
export async function resendMsg91Otp(phone: string) {
  return axios({
    headers: MSG91_HEADERS,
    method: 'POST',
    params: {
      mobile: `${INDIAN_COUNTRY_CODE}${phone}`,
      retrytype: 'text',
    },
    url: API_END_POINTS.msg91ResendOtp,
  })
}

// sonar-cleanup: extracted from upsmfUser.ts / mpNHMUser.ts / bnrcUser.ts's
// '/otp/validateOtp' handlers (CHANGE 30) — same rationale as sendMsg91Otp above.
/**
 * Verifies an OTP against the given phone number via MSG91.
 * @param phone phone number (without country code) the OTP was sent to
 * @param otp the OTP code to verify
 */
export async function verifyMsg91Otp(phone: string, otp: string) {
  return axios({
    headers: MSG91_HEADERS,
    method: 'GET',
    params: {
      mobile: `${INDIAN_COUNTRY_CODE}${phone}`,
      otp,
    },
    url: API_END_POINTS.msg91VerifyOtp,
  })
}

// sonar-cleanup: extracted from upsmfUser.ts's migrateUserToUpsmf /
// mpNHMUser.ts's migrateUserToMp / bnrcUser.ts's migrateUserToBnrc (CHANGE 30).
// getOrgName/getDesignation resolve per this org's own role-mapping (each
// lives in a separate, genuinely different util/local object); stateLabel
// carries the one other real difference in the happy path — the
// postal-address state literal baked into each org's original code
// ('Uttar Pradesh' / '' / 'Bihar'); orgLabel reproduces each org's distinct
// catch-block log message ('Error while migrating user to UPSMF org' / '...
// to MP org' / '...to BNRC org') verbatim.
/**
 * Migrates a user's org during org-signup, then updates their professional
 * details and postal address to reflect the new org.
 * @param userDetails the existing user record returned from the earlier user-exists lookup
 * @param userFormDetails the submitted registration form data
 * @param getOrgName resolves the Sunbird channel name from userFormDetails, per this org's role mapping
 * @param getDesignation resolves the designation string from userFormDetails.role, per this org's role mapping
 * @param stateLabel the postal-address state text for this org (empty string if none)
 * @param orgLabel org name used in the "Error while migrating user to &lt;org&gt; org" log message
 */
interface MigratingUserProfileDetails {
  profileReq: {
    professionalDetails: Array<{ designation?: string }>
    personalDetails: { postalAddress?: string }
  }
}

export async function migrateOrgSignupUser<T extends { role: string; district?: string }>(
  userDetails: { userId: string; id: string; profileDetails: MigratingUserProfileDetails },
  userFormDetails: T,
  getOrgName: (userFormDetails: T) => string,
  getDesignation: (role: string) => string,
  stateLabel: string,
  orgLabel: string
) {
  try {
    const migrateUserData = {
      request: {
        channel: getOrgName(userFormDetails),
        forceMigration: true,
        notifyMigration: false,
        softDeleteOldOrg: true,
        userId: userDetails.userId,
      },
    }
    const migrateUserResponse = await axios({
      data: migrateUserData,
      headers: {
        'X-Authenticated-User-Token': '',
        authorization: CONSTANTS.SB_API_KEY,
      },
      method: 'PATCH',
      url: API_END_POINTS.migrateUser,
    })
    const userProfileDetails = userDetails.profileDetails
    const updatedProfessionalDetails = { ...userProfileDetails.profileReq.professionalDetails[0], ...userFormDetails }
    userProfileDetails.profileReq.professionalDetails[0] = updatedProfessionalDetails
    userProfileDetails.profileReq.personalDetails.postalAddress = `India, ${stateLabel}, ${userFormDetails.district}`
    userProfileDetails.profileReq.professionalDetails[0].designation = getDesignation(userFormDetails.role)
    const userProfileUpdateBody = {
      request: {
        profileDetails: userProfileDetails,
        userId: userDetails.id,
      },
    }
    await axios({
      data: userProfileUpdateBody,
      headers: {
        authorization: CONSTANTS.SB_API_KEY,
      },
      method: 'PATCH',
      url: API_END_POINTS.profileUpdate,
    })
    if (migrateUserResponse.data.result.response == 'success') {
      return true
    }
  } catch (error) {
    logError(`Error while migrating user to ${orgLabel} org`, JSON.stringify(error))
    return false
  }
}
