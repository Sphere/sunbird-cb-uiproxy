import axios from 'axios'
import { Response } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from './env'
import { ERROR } from './message'
import { extractUserToken } from './requestExtract'

// sonar-cleanup: extracted from network.ts's and connections_v2.ts's 5
// identical GET-route bodies (/connections/requested, requests/received,
// established, established/:id, suggests — and their /v2/ siblings)
// (CHANGE 33). userId is passed in already-resolved rather than resolved
// here, since the two files use genuinely different extractors
// (extractUserIdFromRequest reads req.session.userId,
// connections_v2.ts's suggests route uses extractUserId which reads
// req.kauth's Keycloak claims instead) — that difference stays entirely
// in each caller. Error handling also stays in each caller, since each
// file has its own catch-handler with its own "unknown" message text.
/**
 * Validates rootOrg/userId are present, then fetches and sends a
 * connections list from the given endpoint.
 * @param req the Express request; only its rootOrg header and auth token are read
 * @param res the Express response to send the validation error or the fetched list to
 * @param endpoint the upstream connections-list URL to fetch
 * @param userId the already-resolved user id (resolution differs by caller)
 */
export async function fetchConnectionsList(
  // tslint:disable-next-line: no-any
  req: any,
  res: Response,
  endpoint: string,
  userId: string | undefined
) {
  const rootOrg = req.headers.rootorg
  if (!rootOrg) {
    res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
    return
  }
  if (!userId) {
    res.status(400).send(ERROR.GENERAL_ERR_MSG)
    return
  }
  const response = await axios.get(endpoint, {
    ...axiosRequestConfig,
    headers: {
      Authorization: CONSTANTS.SB_API_KEY,
      rootOrg,
      userId,
      // tslint:disable-next-line: all
      'x-authenticated-user-token': extractUserToken(req),
    },
  })
  res.send(response.data)
}
