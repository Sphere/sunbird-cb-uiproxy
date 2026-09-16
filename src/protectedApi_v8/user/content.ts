import axios from 'axios'
import { Response, Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { IContent } from '../../models/content.model'
import { IPaginatedApiResponse } from '../../models/paginatedApi.model'
import { processContent } from '../../utils/contentHelpers'
import { CONSTANTS } from '../../utils/env'
import { getStringifiedQueryParams } from '../../utils/helpers'
import { logError } from '../../utils/logger'
import { ERROR } from '../../utils/message'
import { extractUserIdFromRequest, IAuthorizedRequest } from '../../utils/requestExtract'
// sonar-cleanup: file-local requireOrgHeaders replaced with the shared import (CHANGE 43)
import { requireOrgHeaders } from '../../utils/requireOrgHeaders'
import { getMultipleContent } from '../content'

const API_END_POINTS = {
  assignedContent: (userId: string) =>
    `${CONSTANTS.SB_EXT_API_BASE_2}/v1/users/${userId}/assigned-content`,
  contentLikeNumber: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/likes-count`,
  like: (userId: string) => `${CONSTANTS.LIKE_API_BASE}/v1/user/${userId}/likes`,
}

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

export const userContentApi = Router()

// sonar-cleanup: extracted from this file's repeated per-route catch blocks — same
// logError(label, err) + status/body shape (CHANGE 41); /assigned-content's catch
// (res.status(500).json(error), no upstream-status forwarding) is a different
// shape and was left untouched
/**
 * Logs the error under `label`, then responds with the upstream status code
 * (or 500) and the upstream error body (or a generic error message).
 *
 * @param res - the Express response to send the error on
 * @param err - the caught error, expected to optionally carry an axios-style `response`
 * @param label - text prefixed to the logged error message
 */
// tslint:disable-next-line: no-any
function handleUserContentError(res: Response, err: any, label: string) {
  logError(label, err)
  res.status((err && err.response && err.response.status) || 500).send(
    (err && err.response && err.response.data) || {
      error: GENERAL_ERROR_MSG,
    }
  )
}

userContentApi.post('/contentLikes', async (req, res) => {
  try {
    const orgHeaders = requireOrgHeaders(req, res)
    if (!orgHeaders) {
      return
    }
    const { rootOrg } = orgHeaders

    const response = await axios.post(API_END_POINTS.contentLikeNumber, req.body, {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleUserContentError(res, err, 'ERROR FETCHING CONTENT LIKES >')
  }
})

userContentApi.get('/like', async (req, res) => {
  try {
    const orgHeaders = requireOrgHeaders(req, res)
    if (!orgHeaders) {
      return
    }
    const { org, rootOrg } = orgHeaders
    const response = await fetchLikedIdsResponse(req, rootOrg, org)
    res.json(response)
  } catch (err) {
    handleUserContentError(res, err, 'ERROR FETCHING LIKES >')
  }
})
export async function fetchLikedIdsResponse(req: IAuthorizedRequest, rootOrg: string, org: string) {
  try {
    const response = await axios({
      ...axiosRequestConfig,
      headers: {
        org,
        rootOrg,
      },
      method: 'GET',
      url: `${API_END_POINTS.like(extractUserIdFromRequest(req))}`,
    })
    return response.data
  } catch (e) {
    throw new Error(e)
  }
}
userContentApi.get('/like/contents', async (req, res) => {
  try {
    const orgHeaders = requireOrgHeaders(req, res)
    if (!orgHeaders) {
      return
    }
    const { org, rootOrg } = orgHeaders
    const likedIdsResponse = await fetchLikedIdsResponse(req, rootOrg, org)
    const likedIds = likedIdsResponse || []
    if (!Array.isArray(likedIds) || !likedIds.length) {
      res.send([])
    }
    const response = await getMultipleContent(likedIds, rootOrg, org, extractUserIdFromRequest(req))
    const result: IPaginatedApiResponse = {
      contents: response || [],
      hasMore: false,
    }
    res.json(result)
  } catch (err) {
    handleUserContentError(res, err, 'ERROR in LIKE GET CONTENTS >')
  }
})

// sonar-cleanup: extracted from the /like/:contentId and /unlike/:contentId route
// bodies — identical apart from the HTTP method and the logged error label,
// surfaced once the org/rootOrg guard above was collapsed into requireOrgHeaders
// (CHANGE 41)
/**
 * Sends or removes a like for `contentId` on behalf of the requesting
 * user, forwarding the request body as-is.
 *
 * @param req - the incoming request, carrying the content id as a route param and the like body
 * @param res - the Express response to send the upstream result or error on
 * @param rootOrg - the caller's already-validated rootOrg header
 * @param method - 'POST' to like, 'DELETE' to unlike
 * @param label - text prefixed to the logged error message on failure
 */
async function likeOrUnlikeContent(
  req: IAuthorizedRequest,
  res: Response,
  rootOrg: string,
  method: 'POST' | 'DELETE',
  label: string
) {
  try {
    const response = await axios({
      ...axiosRequestConfig,
      data: req.body,
      headers: {
        rootOrg,
      },
      method,
      url: `${API_END_POINTS.like(extractUserIdFromRequest(req))}?content_id=${
        req.params.contentId
      }`,
    })
    res.json(response.data)
  } catch (err) {
    handleUserContentError(res, err, label)
  }
}

userContentApi.post('/like/:contentId', async (req, res) => {
  const orgHeaders = requireOrgHeaders(req, res)
  if (!orgHeaders) {
    return
  }
  await likeOrUnlikeContent(req, res, orgHeaders.rootOrg, 'POST', 'ERROR LIKING >')
})
// tslint:disable-next-line: no-identical-functions
userContentApi.delete('/unlike/:contentId', async (req, res) => {
  const orgHeaders = requireOrgHeaders(req, res)
  if (!orgHeaders) {
    return
  }
  await likeOrUnlikeContent(req, res, orgHeaders.rootOrg, 'DELETE', 'ERROR UN-LIKING >')
})

userContentApi.get('/assigned-content', async (req, res) => {
  try {
    const { isInIntranet, isExternal, isStandAlone, pageSize, sourceFields } = req.query
    const queryParams = getStringifiedQueryParams({
      isExternal,
      isInIntranet,
      isStandAlone,
      pageSize,
      sourceFields,
    })
    const userId = extractUserIdFromRequest(req)
    const rootOrg = req.header('rootOrg')
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios({
      ...axiosRequestConfig,
      headers: {
        rootOrg,
      },
      method: 'GET',
      url: `${API_END_POINTS.assignedContent(userId)}?${queryParams}`,
    })
    let contents: IContent[] = []
    if (Array.isArray(response.data.assignedContents)) {
      contents = response.data.assignedContents.map((content: IContent) => processContent(content))
    }
    const result: IPaginatedApiResponse = {
      contents,
      hasMore: false,
    }
    res.json(result)
  } catch (error) {
    logError('ASSIGNED CONTENT FETCH ERROR >', error)
    res.status(500).json(error)
  }
})
