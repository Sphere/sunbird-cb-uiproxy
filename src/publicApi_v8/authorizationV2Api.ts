import axios from 'axios'
import jwt_decode from 'jwt-decode'
import _ from 'lodash'
import qs from 'querystring'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
import { getCurrentUserRoles } from './rolePermission'
const API_END_POINTS = {
  generateToken: `https://aastrika-sb.idc.tarento.com/auth/realms/sunbird/protocol/openid-connect/token`,
  verfifyToken: `https://aastrika-sb.idc.tarento.com/auth/realms/sunbird/protocol/openid-connect/userinfo`,
}
// tslint:disable-next-line: no-any
export const authorizationV2Api = async (
  username: string,
  password: string,
  // tslint:disable-next-line: no-any
  request: any
) => {
  logInfo('Entered into authorizationV2Api ')

  const encodedData = qs.stringify({
    client_id: 'portal',
    client_secret: `${CONSTANTS.KEYCLOAK_CLIENT_SECRET}`,
    grant_type: 'password',
    password,
    username,
  })
  logInfo('Entered into authorization part.' + encodedData)

  try {
    const authTokenResponse = await axios({
      ...axiosRequestConfig,
      data: encodedData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
      url: API_END_POINTS.generateToken,
    })

    logInfo('Entered into authTokenResponse :' + authTokenResponse)

    const accessToken = authTokenResponse.data.access_token
    // tslint:disable-next-line: no-any
    const decodedToken: any = jwt_decode(accessToken)
    const decodedTokenArray = decodedToken.sub.split(':')
    const userId = decodedTokenArray[decodedTokenArray.length - 1]
    request.session.userId = userId
    if (accessToken) {
      const userTokenResponse = await axios({
        ...axiosRequestConfig,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        method: 'GET',

        url: API_END_POINTS.verfifyToken,
      })
      logInfo('userTokenResponse : ' + userTokenResponse)
      if (userTokenResponse.data.name) {
        logInfo('Success ! Entered into usertokenResponse..')
        await getCurrentUserRoles(request, accessToken)
      }
    }
  } catch (e) {
    logInfo('Error throwing Cookie : ' + e)
  }
  return true
}
