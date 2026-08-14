const _                 = require('lodash')
import request from 'request'
import { CONSTANTS } from './env'
import { logInfo } from './logger'

const ROLE = [
     'CBC_ADMIN', 'CBC_MEMBER', 'CONTENT_CREATOR', 'CONTENT_PUBLISHER', 'CONTENT_REVIEWER', 'EDITOR', 'FRAC_COMPETENCY_MEMBER',
    'FRAC_ADMIN', 'FRAC_COMPETENCY_REVIEWER', 'FRAC_REVIEWER_L1', 'FRAC_REVIEWER_L2', 'IFU_MEMBER', 'MDO_ADMIN', 'PUBLIC',
    'SPV_ADMIN', 'WAT_MEMBER']

export const PERMISSION_HELPER = {
    // tslint:disable-next-line: no-any
    setRolesData(reqObj: any, callback: any, body: any) {
        // tslint:disable-next-line: no-any
        const userData: any = JSON.parse(body)
        if (reqObj.session) {
            reqObj.session.userId = userData.result.response.id ?? userData.result.response.userId
            reqObj.session.userName = userData.result.response.userName
            // reqObj.session.userRoles = userData.result.response.roles
            reqObj.session.userRoles = ROLE || []
            reqObj.session.orgs = userData.result.response.organisations
            reqObj.session.rootOrgId = userData.result.response.rootOrgId
            // userData.roles.push(ROLE)
            if (!_.includes(reqObj.session.userRoles, 'PUBLIC')) {
                reqObj.session.userRoles.push('PUBLIC')
            }
            // tslint:disable-next-line: no-any
            reqObj.session.save((error: any) => {
                logInfo('Entered into permission helper reobj.session:')
                if (error) {
                    logInfo('Entered into permission helper reobj.session error section:')
                    callback(error, null)
                } else {
                    logInfo('Entered into permission helper reobj.session passing section:' + userData)
                    callback(null, userData)
                }
            })
        }
    },
    // tslint:disable-next-line: no-any
    getCurrentUserRoles(reqObj: any, callback: any) {
        // console.log('Step 3: Get user roles function')
        const userId = reqObj.session.userId
        logInfo('Entered into permission helper userId:' + userId)
        // console.log(userId)
        const readUrl = `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/v2/read/` + userId
        const options = {
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                'X-Channel-Id': CONSTANTS.X_Channel_Id,
                'x-authenticated-user-token': reqObj.kauth.grant.access_token.token,
                'x-authenticated-userid': userId,
            },
            url: readUrl,
        }
        // tslint:disable-next-line: no-any
        request.get(options, (_err: any, _httpResponse: any, body: any) => {
            if (body) {
                this.setRolesData(reqObj, callback, body)
            }
        })
    },
}
