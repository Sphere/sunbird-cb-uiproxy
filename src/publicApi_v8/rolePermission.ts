import axios from 'axios'
import _ from 'lodash'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { fetchnodebbUserDetails } from './nodebbUser'
const ROLE = [
  'CBC_ADMIN',
  'CBC_MEMBER',
  'CONTENT_CREATOR',
  'CONTENT_PUBLISHER',
  'CONTENT_REVIEWER',
  'EDITOR',
  'FRAC_COMPETENCY_MEMBER',
  'FRAC_ADMIN',
  'FRAC_COMPETENCY_REVIEWER',
  'FRAC_REVIEWER_L1',
  'FRAC_REVIEWER_L2',
  'IFU_MEMBER',
  'MDO_ADMIN',
  'PUBLIC',
  'SPV_ADMIN',
  'WAT_MEMBER',
]

// tslint:disable-next-line: no-any
export const setRolesData = async (reqObj: any, body: any) => {
  // tslint:disable-next-line: no-any
  const userData: any = body
  const fullName = userData.result.response.firstName + ' ' + userData.result.response.lastName
  const userName = userData.result.response.userName
  const userId = userData.result.response.id

  let nodebbUid = ''

  // Try to get NodeBB UID but don't block authentication if it fails
  try {
    const result = await fetchnodebbUserDetails(userId, userName, fullName, userData.result.response, reqObj.session)
    if (result) {
      nodebbUid = result
    }
  } catch (err) {
    logError('Failed to fetch NodeBB user: ' + JSON.stringify(err))
    // Continue with empty UID - discussion won't work but auth still succeeds
  }

  // logInfo('>>>> userData >>>>>>>>>>>> ' + JSON.stringify(userData))

  if (reqObj.session) {
    reqObj.session.userId = userId || userData.result.response.userId
    reqObj.session.userName = userData.result.response.userName
    // reqObj.session.userRoles = userData.result.response.roles
    reqObj.session.userRoles = ROLE ? ROLE : []
    reqObj.session.orgs = userData.result.response.organisations
    reqObj.session.rootOrgId = userData.result.response.rootOrgId
    reqObj.session.nodebbUid = nodebbUid || '' // Will have value if NodeBB succeeded
    // userData.roles.push(ROLE)
    if (!_.includes(reqObj.session.userRoles, 'PUBLIC')) {
      reqObj.session.userRoles.push('PUBLIC')
    }
    logInfo('reqObj.session >>>>>>>', JSON.stringify(reqObj.session))
    // tslint:disable-next-line: no-any
    reqObj.session.save((error: any) => {
      if (error) {
        logError('Error while saving the roles')
      } else {
        logInfo('Session saved successfully')
      }
    })
  }
}
// tslint:disable-next-line: no-any
export const getCurrentUserRoles = async (reqObj: any, accessToken: any) => {
  // console.log('Step 3: Get user roles function')
  logInfo('calling getCurrentUserRoles >>>>')
  const userId = reqObj.session.userId
  logInfo('get userId from session >>>>' + userId)
  // console.log(userId)
  const readUrl = `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/v2/read/` + userId
  const authTokenResponse = await axios({
    ...axiosRequestConfig,

    headers: {
      Authorization: CONSTANTS.SB_API_KEY,
      'X-Channel-Id': CONSTANTS.X_Channel_Id,
      'x-authenticated-user-token': accessToken,
      'x-authenticated-userid': userId,
    },
    method: 'GET',
    url: readUrl,
  })
  // tslint:disable-next-line: no-any
  logInfo('getAuthTokenResponse :' + authTokenResponse)
  if (authTokenResponse) {
    setRolesData(reqObj, authTokenResponse.data)
  }
}
