import axios from 'axios'
import _ from 'lodash'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from './env'
import { logError, logInfo } from './logger'

/**
 * Checks whether a user already exists in Sunbird for the given email or
 * phone, via the `user/v1/exists/...` lookup. Shared by the auto-login
 * signup flows and the email/mobile sign-in flow — they all hit the same
 * lookup with the same request shape.
 *
 * @param searchValue - the email address or phone number to look up
 * @param searchType - `'email'` or `'phone'`, selects which endpoint is called
 */
export async function fetchUserBymobileorEmail(
  searchValue: string,
  searchType: string
) {
  const fetchUserByEmail = `${CONSTANTS.KONG_API_BASE}/user/v1/exists/email/`
  const fetchUserByMobileNo = `${CONSTANTS.KONG_API_BASE}/user/v1/exists/phone/`

  logInfo('Checking Fetch Mobile no : ', fetchUserByMobileNo + searchValue)
  try {
    const response = await axios({
      ...axiosRequestConfig,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
      },
      method: 'GET',
      url: searchType === 'email' ? fetchUserByEmail + searchValue : fetchUserByMobileNo + searchValue,
    })
    logInfo('Response Data in JSON :', JSON.stringify(response.data))
    logInfo('Response Data in Success :', response.data.responseCode)
    if (response.data.responseCode === 'OK') {
      logInfo('Response result.exists :', _.get(response, 'data.result.exists'))
      return _.get(response, 'data.result.exists')
    }
  } catch (err) {
    logError('fetchUserByMobile  failed')
  }
}
