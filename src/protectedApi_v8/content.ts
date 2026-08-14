import axios from 'axios'
import { Request, Response, Router } from 'express'
import request from 'request'
import { axiosRequestConfig } from '../configs/request.config'
import { ECollectionTypes, IContent, IContentMinimal } from '../models/content.model'
import { IPaginatedApiResponse } from '../models/paginatedApi.model'
import { getMinimalContent, processContent, sendAutoCompleteSearchResponse, sendSearchResponse } from '../utils/contentHelpers'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'
import { extractUserIdFromRequest } from '../utils/requestExtract'
// sonar-cleanup: file-local requireOrgHeaders replaced with the shared import (CHANGE 43)
import { requireOrgHeaders } from '../utils/requireOrgHeaders'
import { getPlaylist } from './user/playlist'

export const VALID_HIERARCHY_TYPES = new Set(['all', 'minimal', 'detail'])
const MINIMAL_CONTENT_FIELDS = [
  'appIcon',
  'artifactUrl',
  'bannerColor',
  'children',
  'complexityLevel',
  'contentType',
  'creatorLogo',
  'description',
  'downloadUrl',
  'duration',
  'identifier',
  'lastUpdatedOn',
  'learningMode',
  'mimeType',
  'name',
  'resourceCategory',
  'size',
  'status',
  'totalLikes',
  'averageRating',
  'viewCount',
  'totalRating',
  'resourceCategory',
  'resourceType',
  'categoryType',
  'category',
  'courseType',
]
const DETAIL_CONTENT_FIELDS = [
  ...MINIMAL_CONTENT_FIELDS,
  'idealScreenSize',
  'isExternal',
  'isIframeSupported',
  'learningObjective',
  'preRequisites',
  'resourceCategory',
  'registrationInstructions',
  'resourceType',
  'skills',
  'ssoEnabled',
  'subTitles',
  'tags',
  'topics',
  'sourceName',
  'sourceShortName',
  'studyMaterials',
  'labels',
  'subTitle',
  'references',
]

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

// sonar-cleanup: extracted from content.ts's repeated per-route catch blocks — same logError(label, err) + status/body shape (CHANGE 8); getParentDetails's catch (returns instead of sending) was deliberately left untouched
/**
 * Optionally logs the error under `label`, then responds with the upstream
 * status code (or 500) and the upstream error body (or a generic error
 * message).
 *
 * @param res - the Express response to send the error on
 * @param err - the caught error, expected to optionally carry an axios-style `response`
 * @param label - text prefixed to the logged error message; omit to skip logging
 */
// tslint:disable-next-line: no-any
function handleContentError(res: Response, err: any, label?: string) {
  if (label) {
    logError(label, err)
  }
  res
    .status(err?.response?.status || 500)
    .send(err?.response?.data || {
      error: GENERAL_ERROR_MSG,
    })
}

const API_END_POINTS = {
  addHierarchy: (apiType: string) => `${CONSTANTS.AUTHORING_BACKEND}/action/content/kb/${apiType}`,
  contentParent: (contentId: string) =>
    `${CONSTANTS.SB_EXT_API_BASE_2}/v1/contents/parents/${contentId}`,
  externalContentAccess: (contentId: string, userId: string) =>
    `${CONSTANTS.SB_EXT_API_BASE_2}/v1/sources/${contentId}/users/${userId}`,
  fetchApi: (rootOrg?: string) => `${CONSTANTS.CONTENT_META_FETCH_API_BASE}/fetch/${rootOrg}`,
  hierarchy: (contentId: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/v1/content/hierarchy/${contentId}`,
  // hierarchy: (contentId: string) => `${CONSTANTS.CONTENT_HIERARCHY}/${contentId}?dt=UI_LITE`,
  likeCount: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/likes-count`,
  modifyKB: (apiType: string) => `${CONSTANTS.AUTHORING_BACKEND}/action/content/v2/kb/${apiType}`,
  multiple: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/content/metas`,
  next: `${CONSTANTS.NODE_API_BASE_3}/api/v1/moreLikeThis`,
  parent: `${CONSTANTS.SB_EXT_API_BASE}/v1`,
  removeSubset: `${CONSTANTS.GOALS_API_BASE}/v4/users/goals/resources`,
  reorderV3: `${CONSTANTS.AUTHORING_BACKEND}/action/content/v3/kb/reorder`,
  searchAutoComplete: `${CONSTANTS.ES_BASE}`,
  searchV4: `${CONSTANTS.SB_EXT_API_BASE}/search4`,
  searchV5: `${CONSTANTS.SEARCH_API_BASE}/search5`,
  searchV6: `${CONSTANTS.SEARCH_API_BASE}/v6/search`,
  setS3Cookie: `${CONSTANTS.CONTENT_API_BASE}/contentv3/cookie`,
  updateHierarchy: `${CONSTANTS.AUTHORING_BACKEND}/action/content/hierarchy/update`,
}

export const contentApi = Router()

contentApi.post('/kb/v3/reorder', async (req, res) => {
  try {
    const orgHeaders = requireOrgHeaders(req, res)
    if (!orgHeaders) {
      return
    }
    const { org, rootOrg } = orgHeaders
    const url = `${API_END_POINTS.reorderV3}?rootOrg=${rootOrg}&org=${org}`
    const response = await axios.post(url, req.body,
      {
        ...axiosRequestConfig,
        headers: {
          org,
          rootOrg,
        },
        timeout: Number(CONSTANTS.KB_TIMEOUT),
      }
    )
    res.send(response.data)
  } catch (err) {
    handleContentError(res, err)
  }
})

contentApi.post('/kb/v2/:apiType', async (req, res) => {
  try {
    const orgHeaders = requireOrgHeaders(req, res)
    if (!orgHeaders) {
      return
    }
    const { org, rootOrg } = orgHeaders
    const apiType = req.params.apiType
    const url = `${API_END_POINTS.modifyKB(apiType)}?rootOrg=${rootOrg}&org=${org}`
    const response = await axios.post(url, req.body,
      {
        ...axiosRequestConfig,
        headers: {
          org,
          rootOrg,
        },
        timeout: Number(CONSTANTS.KB_TIMEOUT),
      }
    )
    res.send(response.data)
  } catch (err) {
    handleContentError(res, err, 'CONTENT PARENT ERR -> ')
  }
})

contentApi.get('/multiple/:ids', async (req, res) => {
  try {
    const orgHeaders = requireOrgHeaders(req, res)
    if (!orgHeaders) {
      return
    }
    const { org, rootOrg } = orgHeaders
    const ids = req.params.ids.split(',')
    const response = await getMultipleContent(ids, rootOrg, org, extractUserIdFromRequest(req))
    res.json(response)
  } catch (err) {
    handleContentError(res, err, 'ERROR in MULTI GET CONTENT >')
  }
})

export async function getMultipleContent(
  ids: string[],
  rootOrg: string,
  org: string,
  userId: string
) {
  const requestBody = {
    accessCheck: false,
    fields: MINIMAL_CONTENT_FIELDS,
    fieldsPassed: true,
    identifiers: ids,
    org,
    rootOrg,
    userId,
  }
  const response = await axios({
    ...axiosRequestConfig,
    data: requestBody,
    method: 'POST',
    url: API_END_POINTS.multiple,
  })
  if (Array.isArray(response.data) && response.data.length) {
    return response.data.map((unitContent) => processContent(unitContent))
  } else {
    return []
  }
}

contentApi.get('/parents/:contentId', async (req, res) => {
  try {
    const contentId = req.params.contentId
    const response = await getParentDetails(contentId)
    res.json(response)
  } catch (err) {
    handleContentError(res, err)
  }
})
export async function getParentDetails(contentId: string) {
  try {
    const response = await axios.get(
      `${API_END_POINTS.parent}/${contentId}/parents/read`,
      axiosRequestConfig
    )
    const parents = response.data.result.response.parents
    const result: IContentMinimal[] = []
    for (const parent in parents) {
      if (parent) {
        (parents[parent] as IContent[]).forEach((content) => {
          result.push(getMinimalContent(content))
        })
      }
    }
    return result
  } catch (error) {
    logError('CONTENT PARENT FETCH ERROR >', error)
    return error
  }
}

contentApi.get('/next/:contentId', async (req, res) => {
  try {
    const orgHeaders = requireOrgHeaders(req, res)
    if (!orgHeaders) {
      return
    }
    const { org, rootOrg } = orgHeaders
    const contentId = req.params.contentId
    const response = await axios.get(`${API_END_POINTS.next}/${contentId}`, {
      ...axiosRequestConfig,
      headers: {
        org,
        rootOrg,
      },
      params: req.query,
    })
    res.json(
      response.data.result.response.map((content: IContent) => getMinimalContent(content)) || []
    )
  } catch (err) {
    handleContentError(res, err, 'WHATS NEXT API ERROR>')
  }
})

contentApi.post('/likeCount', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg')
    const response = await axios.post(API_END_POINTS.likeCount, req.body, {
      ...axiosRequestConfig,
      headers: { rootOrg },
    })
    res.send(response.data)
  } catch (err) {
    handleContentError(res, err, 'ERROR FETCHING LIKE COUNT -> ')
  }
})

contentApi.get('/searchAutoComplete', async (req, res) => {
  try {
    await sendAutoCompleteSearchResponse(req, res, API_END_POINTS.searchAutoComplete)
  } catch (err) {
    handleContentError(res, err, 'SEARCH AUTOCOMPLETE ERR -> ')
  }
})

// tslint:disable-next-line: no-any
export async function searchV5(requestBody: any) {
  const response = await axios.post(API_END_POINTS.searchV5, requestBody, axiosRequestConfig)
  const result = response.data && response.data.result && response.data.result.response
  const contents: IContent[] = result.result
  if (Array.isArray(contents)) {
    result.result = contents.map((content) => processContent(content))
  }
  return (
    result || {
      filters: [],
      filtersUsed: [],
      result: [],
      totalHits: 0,
    }
  )
}

contentApi.post('/searchV5', async (req, res) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const reqBody = {
      ...req.body,
      request: {
        ...req.body.request,
        rootOrg: req.header('rootOrg'),
        uuid: req.body.request.uuid ? req.body.request.uuid : userId,
      },
    }

    const response = await searchV5(reqBody)
    res.json(response)
  } catch (err) {
    handleContentError(res, err, 'SEARCH API ERROR >')
  }
})

contentApi.post('/searchRegionRecommendation', async (req, res) => {
  try {
    const orgHeaders = requireOrgHeaders(req, res)
    if (!orgHeaders) {
      return
    }
    const { rootOrg } = orgHeaders
    const userId = extractUserIdFromRequest(req)
    let reqBody = {
      ...req.body,
      request: {
        ...req.body.request,
        rootOrg: req.header('rootOrg'),
        uuid: userId,
      },
    }
    let response = await searchV5(reqBody)
    if (!response.totalHits && reqBody.request.defaultLabel) {
      reqBody = {
        ...reqBody,
        request: {
          ...reqBody.request,
          filters: {
            ...reqBody.request.filters,
            labels: [reqBody.request.defaultLabel],
          },
        },
      }
      response = await searchV5(reqBody)
    }
    const returnResponse: IPaginatedApiResponse = {
      contents: [],
      hasMore: false,
    }
    let children = []
    if (response.result.length) {
      children = response.result[0].children.map((content: IContent) => content.identifier)
    }
    if (children.length) {
      const data = await getContentMeta(children, rootOrg)
      returnResponse.contents = data
    }
    res.json(returnResponse)
  } catch (err) {
    handleContentError(res, err)
  }
})

contentApi.post('/searchV6', async (req, res) => {
  try {
    const body = {
      ...req.body,
      rootOrg: req.header('rootOrg'),
      uuid: extractUserIdFromRequest(req),
    }
    const response = await axios.post(API_END_POINTS.searchV6, body, axiosRequestConfig)
    sendSearchResponse(res, response)
  } catch (err) {
    handleContentError(res, err, 'SEARCH V6 API ERROR >')
  }
})

contentApi.post('/setCookie', async (req, res) => {
  try {
    const url = API_END_POINTS.setS3Cookie
    const type = req.body.type
    const rootOrg = req.header('rootOrg')
    const body = {
      json: {
        ...req.body,
        uuid: extractUserIdFromRequest(req),
      },
    }
    const bodyWithConfigRequestOptions = { ...body, ...axiosRequestConfig, headers: { rootOrg } }
    request
      .post(`${url}?type=${type}`, bodyWithConfigRequestOptions)
      .on('response', (_response) => {
        // tslint:disable-next-line: no-console
        // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>\n SET COOKIE RESPONSE HEADERS >>\n', response.headers)
      })
      .on('error', (err) => {
        // tslint:disable-next-line: no-console
        console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>\n ALERT! SET COOKIE ERROR >>\n', err)
      })
      .pipe(res)
  } catch (err) {
    handleContentError(res, err)
  }
})

contentApi.post('/setImageCookie', async (req, res) => {
  try {
    const body = req.body
    const url = `${API_END_POINTS.setS3Cookie}/images`
    const bodyInJson = {
      json: body,
    }
    const bodyWithConfigRequestOptions = { ...bodyInJson, ...axiosRequestConfig }
    request.post(url, bodyWithConfigRequestOptions).pipe(res)
  } catch (err) {
    handleContentError(res, err)
  }
})

contentApi.post('/getWebModuleManifest', async (req, res) => {
  try {
    if (!req.body.url || !req.body.url.length) {
      res.status(400).send()
    }
    const url = req.body.url
    const response = await axios.get(`${url}`, axiosRequestConfig)
    res.json(response.data)
  } catch (err) {
    handleContentError(res, err)
  }
})

contentApi.get('/getWebModuleFiles', async (req, res) => {
  try {
    const url = req.query.url
    const response = await axios.get(`${url}`, axiosRequestConfig)
    res.json(response.data)
  } catch (err) {
    handleContentError(res, err)
  }
})

contentApi.get('/collection/:collectionType/:collectionId', async (req, res) => {
  try {
    const orgHeaders = requireOrgHeaders(req, res)
    if (!orgHeaders) {
      return
    }
    const { org, rootOrg } = orgHeaders
    const userId = extractUserIdFromRequest(req)

    const { collectionType, collectionId } = req.params
    let parent = {}
    let contentIds = []
    if (collectionType === ECollectionTypes.PLAYLIST) {
      const playlist = await getPlaylist(userId, collectionId, rootOrg)
      parent = {
        appIcon: playlist.icon,
        contentType: 'Playlist',
        duration: playlist.duration,
        identifier: collectionId,
        name: playlist.name,
      }
      contentIds = playlist.contents.map((content) => content.identifier)
    } else if (collectionType === ECollectionTypes.GOAL) {
      parent = {
        appIcon: undefined,
        contentType: 'Goal',
        description: 'Dummy description for goal',
        duration: 1,
        identifier: collectionId,
        name: 'Dummy Goal',
      }
      contentIds = ['lex_auth_012795695101108224220']
    } else {
      res.status(400).send({ error: 'ERROR_INVALID_COLLECTION_TYPE' })
      return
    }

    const contents = await getMultipleContent(contentIds, rootOrg, org, userId)

    res.send({
      data: {
        ...parent,
        children: contents,
      },
      totalContents: contentIds.length,
    })
  } catch (err) {
    handleContentError(res, err)
  }
})

contentApi.post('/removeSubset', async (req, res) => {
  try {
    const response = await axios.post(
      API_END_POINTS.removeSubset,
      { goal_content_id: req.body.contentIds },
      axiosRequestConfig
    )

    res.status(response.status).send(response.data)
  } catch (err) {
    handleContentError(res, err)
  }
})

/**
 * Shared body for the two "update content hierarchy" routes below — they
 * only differ in which upstream URL they post to.
 *
 * @param req - the incoming request
 * @param res - the Express response to send the upstream result (or an error) on
 * @param url - the resolved upstream hierarchy-update endpoint to post to
 */
async function updateContentHierarchy(req: Request, res: Response, url: string) {
  try {
    const orgHeaders = requireOrgHeaders(req, res)
    if (!orgHeaders) {
      return
    }
    const { org, rootOrg } = orgHeaders
    const response = await axios.post(
      `${url}?rootOrg=${rootOrg}&org=${org}&wid=${req.header('wid')}`,
      req.body,
      {
        ...axiosRequestConfig,
        timeout: Number(CONSTANTS.KB_TIMEOUT),
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    handleContentError(res, err)
  }
}

contentApi.post('/hierarchy/update', async (req, res) => {
  await updateContentHierarchy(req, res, API_END_POINTS.updateHierarchy)
})

contentApi.post('/kb/:updateType', async (req, res) => {
  await updateContentHierarchy(req, res, API_END_POINTS.addHierarchy(req.params.updateType))
})

contentApi.post('/:contentId', async (req, res) => {
  try {
    const orgHeaders = requireOrgHeaders(req, res)
    if (!orgHeaders) {
      return
    }
    const { org, rootOrg } = orgHeaders
    const { contentId } = req.params
    const additionalFields = req.body.additionalFields
    const fetchOneLevel = req.body.fetchOneLevel || false
    const hierarchyType = req.query.hierarchyType
    const response = await getContentDetails(
      contentId,
      rootOrg,
      org,
      extractUserIdFromRequest(req),
      hierarchyType,
      additionalFields,
      fetchOneLevel
    )

    res.json(response)
  } catch (err) {
    handleContentError(res, err)
  }
})

export async function getContentDetails(
  contentId: string,
  rootOrg: string,
  org: string,
  userId: string,
  hierarchyType: string,
  additionalFields: string[] = [],
  fetchOneLevel = false
) {
  const url = API_END_POINTS.hierarchy(contentId)

  let fields: string[] = []
  let fieldsPassed = true
  if (!VALID_HIERARCHY_TYPES.has(hierarchyType)) {
    hierarchyType = 'detail'
  }
  if (hierarchyType === 'minimal') {
    fields = [...additionalFields, ...MINIMAL_CONTENT_FIELDS]
  } else if (hierarchyType === 'detail') {
    fields = [...additionalFields, ...DETAIL_CONTENT_FIELDS]
  } else {
    fieldsPassed = false
    fields = []
  }
  const requestBody = {
    fetchOneLevel,
    fields,
    fieldsPassed,
    org,
    rootOrg,
    userId,
  }
  const response = await axios({
    ...axiosRequestConfig,
    data: requestBody,
    method: 'POST',
    url,
  })
  if (response.data.identifier) {
    return processContent(response.data)
  } else {
    throw new Error('NO_CONTENT')
  }
}

export async function getContentMeta(
  identifier: string[],
  rootOrg?: string,
  sourceFields: string[] = []
) {
  const url = API_END_POINTS.fetchApi(rootOrg)

  let fields: string[] = []

  fields = [...sourceFields, ...MINIMAL_CONTENT_FIELDS]
  const requestBody = {
    filters: {
      identifier,
    },
    sourceFields: fields,
  }
  const response = await axios({
    ...axiosRequestConfig,
    data: requestBody,
    method: 'POST',
    url,
  })
  if (Array.isArray(response.data) && response.data.length) {
    return response.data.map((unitContent) => processContent(unitContent))
  } else {
    return []
  }
}

contentApi.get('/external-access/:id', async (req, res) => {
  try {
    const id = req.params.id
    const orgHeaders = requireOrgHeaders(req, res)
    if (!orgHeaders) {
      return
    }
    const { org, rootOrg } = orgHeaders
    const response = await axios.get(
      `${API_END_POINTS.externalContentAccess(id, extractUserIdFromRequest(req))}`,
      {
        ...axiosRequestConfig,
        headers: {
          org,
          rootOrg,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    handleContentError(res, err)
  }
})

contentApi.post('/:contentId/parent', async (req, res) => {
  try {
    const orgHeaders = requireOrgHeaders(req, res)
    if (!orgHeaders) {
      return
    }
    const { org, rootOrg } = orgHeaders
    const uuid = extractUserIdFromRequest(req)
    const contentId = req.params.contentId
    const response = await axios.post(API_END_POINTS.contentParent(contentId), req.body, {
      ...axiosRequestConfig,
      headers: {
        org,
        rootOrg,
        userId: uuid,
      },
    })
    res.send(response.data)
  } catch (err) {
    handleContentError(res, err, 'CONTENT PARENT ERR -> ')
  }
})
