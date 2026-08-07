import axios from 'axios'
import { axiosRequestConfig } from '../configs/request.config'
import { API_END_POINTS } from './autoLoginSignupConstants'
import { CONSTANTS } from './env'
import { logInfo } from './logger'

// sonar-cleanup: extracted from signupWithAutoLogin.ts / signupWithAutoLoginV2.ts / appSignUpWithAutoLogin.ts's byte-identical create-user request (CHANGE 10) — updateRoles was deliberately NOT merged with these, since v1 uses axiosRequestConfig while v2/app use axiosRequestConfigLong (L2-2, left unmerged)
/**
 * Creates a Sunbird user account from the signup form data. Shared by the
 * auto-login signup flows (`signupWithAutoLogin`, `signupWithAutoLoginV2`,
 * `appSignUpWithAutoLogin`) — they all build the same create-user request.
 *
 * @param profileData - the signup form payload; must have `firstName`,
 * `lastName`, `password`, and either `email` or `phone`
 */
// tslint:disable-next-line: no-any
export const createAccount = async (profileData: any) => {
  try {
    const typeOfAccount = profileData.email ? 'email' : 'phone'
    return await axios({
      ...axiosRequestConfig,
      data: {
        request: {
          firstName: profileData.firstName,
          lastName: profileData.lastName,
          password: profileData.password,
          [typeOfAccount]: profileData[typeOfAccount],
        },
      },
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
      },
      method: 'POST',
      url: API_END_POINTS.createUserWithMobileNo,
    })
  } catch (error) {
    logInfo(JSON.stringify(error))
  }
}

// sonar-cleanup: extracted from signupWithAutoLogin.ts / signupWithAutoLoginV2.ts / appSignUpWithAutoLogin.ts's byte-identical post-signup profile-update request (CHANGE 10)
/**
 * Updates the newly created user's profile (name, default language) right
 * after signup. Shared by the same three auto-login signup flows.
 *
 * @param profileData - the signup form payload; used for `firstName`/`lastName`
 * @param userId - the id of the just-created user
 */
// tslint:disable-next-line: no-any
export const profileUpdate = async (profileData: any, userId: any) => {
  try {
    return await axios({
      ...axiosRequestConfig,
      data: {
        request: {
          profileDetails: {
            preferences: {
              language: 'en',
            },
            profileReq: {
              id: userId,
              personalDetails: {
                firstname: profileData.firstName,
                surname: profileData.lastName,
              },
              userId,
            },
          },
          userId,
        },
      },
      headers: { Authorization: CONSTANTS.SB_API_KEY },
      method: 'PATCH',
      url: API_END_POINTS.profileUpdate,
    })
  } catch (error) {
    logInfo(JSON.stringify(error))
  }
}
