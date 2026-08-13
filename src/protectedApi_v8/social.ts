import axios from 'axios'
import { Buffer } from 'buffer'
import { Response, Router } from 'express'
import { UploadedFile } from 'express-fileupload'
import FormData from 'form-data'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractUserIdFromRequest } from '../utils/requestExtract'
const API_END_POINTS = {
  acceptAnswer: `${CONSTANTS.NODE_API_BASE}/useractivity/acceptAnswer`,
  activityUpdate: `${CONSTANTS.NODE_API_BASE}/useractivity/create`,
  activityUsers: `${CONSTANTS.NODE_API_BASE}/post/users`,
  adminDeletePosts: `${CONSTANTS.NODE_API_BASE}/admin/deletepost`,
  adminPostsTimeline: `${CONSTANTS.NODE_API_BASE}/admin/timeline`,
  adminReactivatePost: `${CONSTANTS.NODE_API_BASE}/admin/reactivatepost`,
  authoringCatalog: `${CONSTANTS.NODE_API_BASE}/catalog/fetch`,
  autocomplete: `${CONSTANTS.NODE_API_BASE}/post/autocomplete`,
  createForum: `${CONSTANTS.NODE_API_BASE}/forum/createforum`,
  deletePost: `${CONSTANTS.NODE_API_BASE}/authtool/deletepost`,
  draftPost: `${CONSTANTS.NODE_API_BASE}/authtool/draftpost`,
  editForum: `${CONSTANTS.NODE_API_BASE}/forum/editforum`,
  editMeta: `${CONSTANTS.NODE_API_BASE}/authtool/editmeta`,
  editTags: `${CONSTANTS.NODE_API_BASE}/authtool/edittags`,
  moderatorPostsTimeline: `${CONSTANTS.NODE_API_BASE}/moderator/timeline`,
  moderatorReact: `${CONSTANTS.NODE_API_BASE}/moderator/moderatepost`,
  publishPost: `${CONSTANTS.NODE_API_BASE}/authtool/publishpost`,
  searchSocial: `${CONSTANTS.NODE_API_BASE}/search/searchv1`,
  timeline: `${CONSTANTS.NODE_API_BASE}/post/timeline`,
  timelineV2: `${CONSTANTS.NODE_API_BASE}/post/timelinev2`,
  uploadImage: `${CONSTANTS.CONTENT_API_BASE}/contentv3/upload-live`,
  viewConversation: `${CONSTANTS.NODE_API_BASE}/post/viewConversation`,
  viewConversationV2: `${CONSTANTS.NODE_API_BASE}/post/viewConversationv2`,
  viewForum: `${CONSTANTS.NODE_API_BASE}/forum/viewforum`,
  viewForumlist: `${CONSTANTS.NODE_API_BASE}/forum/forumtimeline`,
}

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

/**
 * Logs the error under `label` (when given), then responds with the
 * upstream status code (or 500) and the upstream error body (or a generic
 * error message).
 *
 * @param res - the Express response to send the error on
 * @param err - the caught error, expected to optionally carry an axios-style `response`
 * @param label - text prefixed to the logged error message; omit to skip logging
 */
// tslint:disable-next-line: no-any
function handleSocialError(res: Response, err: any, label?: string) {
  if (label) {
    logError(label, err)
  }
  res.status((err && err.response && err.response.status) || 500).send(
    (err && err.response && err.response.data) || {
      error: GENERAL_ERROR_MSG,
    }
  )
}

export const socialApi = Router()

const INVALID_ORG_MSG = ERROR.ERROR_NO_ORG_DATA

// sonar-cleanup: extracted from 23 of this file's route bodies, which all
// shared the same org/rootOrg guard, body-merge, and axios({...}) call
// shape (CHANGE 33). Genuine per-route differences are threaded through as
// explicit parameters: `extraFields` covers each route's own additional
// merged field (moderatorId/adminId/forumCreator/forumEditor/userId, with
// '/catalog's lowercase `userid` key and '/post/timelineV2's distinct
// `req.query.wid || extractUserIdFromRequest(req)` derivation preserved
// verbatim), `timeout` covers the ~9 routes that set
// `Number(CONSTANTS.SOCIAL_TIMEOUT)`, and `label` covers the 2 routes with
// their own logged error label. `/post/upload/:contentId` (multipart,
// callback-based, not axios) and `/post/autocomplete` (org/rootOrg sent as
// headers, not merged into the body) are structurally different and stay
// untouched.
/**
 * Validates the org/rootOrg headers are present, merges them (plus any
 * extra fields) into the request body, and proxies it to the given
 * upstream social-service endpoint.
 * @param req the Express request; its org/rootOrg headers and body are read
 * @param res the Express response to send the result or error to
 * @param method the HTTP method to call the upstream endpoint with
 * @param url the upstream social-service endpoint to call
 * @param options.extraFields resolves additional fields to merge into the request body
 * @param options.timeout when true, sets the axios timeout to CONSTANTS.SOCIAL_TIMEOUT
 * @param options.label text prefixed to the logged error message on failure; omit to skip logging
 */
async function proxySocialRoute(
  // tslint:disable-next-line: no-any
  req: any,
  res: Response,
  method: 'POST' | 'PUT' | 'DELETE',
  url: string,
  options?: {
    // tslint:disable-next-line: no-any
    extraFields?: (req: any) => object
    timeout?: boolean
    label?: string
  }
) {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    const data = {
      ...req.body,
      org,
      rootOrg,
      ...(options?.extraFields ? options.extraFields(req) : {}),
    }
    const response = await axios({
      ...axiosRequestConfig,
      data,
      method,
      url,
      ...(options?.timeout ? { timeout: Number(CONSTANTS.SOCIAL_TIMEOUT) } : {}),
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleSocialError(res, err, options?.label)
  }
}

socialApi.post('/post/upload/:contentId', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    const contentId = req.params.contentId
    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    if (req.files && req.files.content) {
      const url = `${rootOrg}/${org}/Public/${contentId}/artifacts`
      const file: UploadedFile = req.files.content as UploadedFile
      const formData = new FormData()
      formData.append('content', Buffer.from(file.data), {
        contentType: file.mimetype,
        filename: file.name,
      })
      formData.submit(
        `${API_END_POINTS.uploadImage}/${url.replace(/\//g, '%2F')}`,
        (err, response) => {
          if (response.statusCode === 200 || response.statusCode === 201) {
            response.on('data', (data) => {
              res.send(JSON.parse(data.toString('utf8')))
            })
          } else {
            res.send(
              (err && err.message) || {
                error: GENERAL_ERROR_MSG,
              }
            )
          }
        }
      )
    } else {
      throw new Error('File not found')
    }
  } catch (err) {
    handleSocialError(res, err)
  }
})

socialApi.post('/post/publish', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.publishPost)
})

socialApi.post('/post/draft', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.draftPost)
})

socialApi.put('/edit/tags', async (req, res) => {
  await proxySocialRoute(req, res, 'PUT', API_END_POINTS.editTags)
})
socialApi.put('/edit/meta', async (req, res) => {
  await proxySocialRoute(req, res, 'PUT', API_END_POINTS.editMeta, { label: 'EDIT META ERROR >' })
})

socialApi.post('/post/delete', async (req, res) => {
  await proxySocialRoute(req, res, 'DELETE', API_END_POINTS.deletePost, { label: 'ERROR DELETING POST' })
})

socialApi.post('/post/autocomplete', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(INVALID_ORG_MSG)
      return
    }
    const response = await axios.post(API_END_POINTS.autocomplete, req.body, {
      ...axiosRequestConfig,
      headers: {
        org,
        rootOrg,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleSocialError(res, err)
  }
})

socialApi.post('/post/viewConversation', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.viewConversation)
})

socialApi.post('/post/viewConversationV2', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.viewConversationV2)
})

socialApi.post('/post/timeline', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.timeline, { timeout: true })
})

socialApi.post('/post/timelineV2', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.timelineV2, {
    extraFields: (r) => ({ userId: r.query.wid || extractUserIdFromRequest(r) }),
    timeout: true,
  })
})
// moderator forum ends
// moderator content-approve/reject start

socialApi.post('/moderator/moderatepost', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.moderatorReact, {
    extraFields: (r) => ({ moderatorId: extractUserIdFromRequest(r) }),
    timeout: true,
  })
})

socialApi.post('/moderator/timeline', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.moderatorPostsTimeline, {
    extraFields: (r) => ({ userId: extractUserIdFromRequest(r) }),
    timeout: true,
  })
})

//// moderator content-approve end

// Admin timeline api start
socialApi.post('/admin/timeline', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.adminPostsTimeline, {
    extraFields: (r) => ({ userId: extractUserIdFromRequest(r) }),
    timeout: true,
  })
})
// admin timeline api ends
// Admin reject post start
socialApi.post('/admin/deletePost', async (req, res) => {
  await proxySocialRoute(req, res, 'DELETE', API_END_POINTS.adminDeletePosts, {
    extraFields: (r) => ({ adminId: extractUserIdFromRequest(r) }),
  })
})
// Admin reject post end
// Admin reactivate post start
socialApi.post('/admin/reactivatePost', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.adminReactivatePost, {
    extraFields: (r) => ({ adminId: extractUserIdFromRequest(r) }),
    timeout: true,
  })
})
// admin reactivate post end

socialApi.post('/viewForum', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.viewForum, {
    extraFields: (r) => ({ userId: extractUserIdFromRequest(r) }),
    timeout: true,
  })
})

// forum list view start
socialApi.post('/forum/forumtimeline', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.viewForumlist, {
    extraFields: (r) => ({ userId: extractUserIdFromRequest(r) }),
    timeout: true,
  })
})
// forum list end
// social search start
// social search end
socialApi.post('/post/activity/create', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.activityUpdate, {
    extraFields: (r) => ({ userId: extractUserIdFromRequest(r) }),
  })
})

socialApi.post('/createForum', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.createForum, {
    extraFields: (r) => ({ forumCreator: extractUserIdFromRequest(r) }),
  })
})

socialApi.post('/editForum', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.editForum, {
    extraFields: (r) => ({ forumEditor: extractUserIdFromRequest(r) }),
  })
})

socialApi.post('/post/acceptAnswer', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.acceptAnswer)
})

socialApi.post('/post/activity/users', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.activityUsers)
})

socialApi.post('/post/search', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.searchSocial, {
    extraFields: (r) => ({ userId: extractUserIdFromRequest(r) }),
  })
})

socialApi.post('/catalog', async (req, res) => {
  await proxySocialRoute(req, res, 'POST', API_END_POINTS.authoringCatalog, {
    extraFields: (r) => ({ userid: extractUserIdFromRequest(r) }),
  })
})
