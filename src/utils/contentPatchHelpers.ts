import axios from 'axios'
import { Request, Response } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { logError } from './logger'
import { ERROR } from './message'

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

// sonar-cleanup: extracted from goals.ts / playlist.ts PATCH routes (CHANGE 18) — identical two-call rename flow, both callers' title-builder passed in as a parameter
/**
 * Patches a content item's title, then updates its child-content hierarchy
 * in a second call — the two-step "rename" flow both goals and playlists
 * use. Each caller supplies its own title-patch request builder, since
 * goals and playlists read the new title from different request fields.
 *
 * @param req - the incoming request
 * @param res - the Express response to send the result (or an error) on
 * @param contentId - the goal or playlist id being updated
 * @param formUpdateObj - builds the title-patch request body for this caller
 * @param buildHierarchyPatch - builds the hierarchy-update request body for this caller
 */
export async function patchContentViaHierarchyUpdate(
  req: Request,
  res: Response,
  contentId: string,
  // tslint:disable-next-line: no-any
  formUpdateObj: (request: any) => any,
  // tslint:disable-next-line: no-any
  buildHierarchyPatch: (request: any, contentId: string) => any
) {
  try {
    const request = req.body
    const rootOrg = req.header('rootOrg')
    const auth = req.header('Authorization')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const url = `https://igot-dev.in/apis/proxies/v8/action/content/v3/update/${contentId}`
    const response = await axios({
      ...axiosRequestConfig,
      data: formUpdateObj(request),
      headers: {
        Authorization: auth,
        org: 'dopt',
        rootOrg: 'igot',
      },
      method: 'PATCH',
      url,
    })

    const urll = `https://igot-dev.in/apis/proxies/v8/action/content/v3/hierarchy/update`

    const response1 = await axios({
      ...axiosRequestConfig,
      data: buildHierarchyPatch(request, contentId),
      headers: {
        Authorization: auth,
        org: 'dopt',
        rootOrg: 'igot',
      },
      method: 'PATCH',
      url: urll,
    })
    res.status(response.status || response1.status).send()
  } catch (err) {
    logError(err)
    res
      .status(err?.response?.status || 500)
      .send(err?.response?.data || {
        error: GENERAL_ERROR_MSG,
      })
  }
}
