import axios from 'axios'
import jwt_decode from 'jwt-decode'
import qs from 'querystring'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
import { getCurrentUserRoles } from './rolePermission'

// sonar-cleanup: extracted from tnaiAuth.ts / tnnmcAuth.ts / sashaktAuth.ts /
// maternityFoundationAuth.ts's near-identical Keycloak password-grant
// token-exchange block (CHANGE 31). Deliberately scoped to ONLY this
// middle section (build the grant request, exchange it, decode the token,
// establish the session, fetch roles) — the surrounding auth-fail status
// code (302 in 3 files, 400 in maternityFoundationAuth.ts), catch-block
// behavior, and final response shape genuinely differ per file (including
// a documented pre-existing double-send bug in 3 of the 4 when the token
// exchange resolves falsy — see docs/PROD-VERIFICATION.md), so those stay
// entirely in each caller, untouched. Returns the access token on success
// or `undefined` on a falsy token response, matching every caller's own
// `if (authTokenResponse.data)` check exactly.
/**
 * Exchanges partner-SSO credentials for a Keycloak access token via the
 * password grant, then establishes the Express session and fetches the
 * user's current roles.
 * @param req the Express request; session/kauth are mutated on success
 * @param clientId the Keycloak client id for this partner org
 * @param clientSecret the Keycloak client secret for this partner org
 * @param username the identifier (phone or email) to authenticate as
 * @returns the access token on success, or `undefined` if the token exchange itself failed
 */
export async function exchangeSsoKeycloakToken(
  // tslint:disable-next-line: no-any
  req: any,
  clientId: string,
  clientSecret: string,
  username: string
): Promise<string | undefined> {
  const encodedData = qs.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'password',
    scope: 'offline_access',
    username,
  })
  logInfo('Entered into authorization part.' + encodedData)

  const authTokenResponse = await axios({
    ...axiosRequestConfig,
    data: encodedData,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
    url: `${CONSTANTS.HTTPS_HOST}/auth/realms/sunbird/protocol/openid-connect/token`,
  })

  if (!authTokenResponse.data) {
    return undefined
  }

  const accessToken = authTokenResponse.data.access_token
  // tslint:disable-next-line: no-any
  const decodedToken: any = jwt_decode(accessToken)
  const decodedTokenArray = decodedToken.sub.split(':')
  const userId = decodedTokenArray[decodedTokenArray.length - 1]
  req.session.userId = userId
  logInfo(userId, 'userid......................')
  req.kauth = {
    grant: {
      access_token: { content: decodedToken, token: accessToken },
    },
  }
  req.session.grant = {
    access_token: { content: decodedToken, token: accessToken },
  }
  logInfo('Success ! Entered into usertokenResponse..')
  await getCurrentUserRoles(req, accessToken)

  return accessToken
}
