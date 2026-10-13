import axios from 'axios'
import { Router } from 'express'
import { getRootOrg } from '../../authoring/utils/header'
import { axiosRequestConfig } from '../../configs/request.config'
import {
  getUserSlug,
  getUserUID,
  getWriteApiToken,
} from '../../utils/discussionHub-helper'
import { logError, logInfo } from '../../utils/logger'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'

export const usersApi = Router()

usersApi.get('/:slug/bookmarks', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const slug = req.params.slug
    const userUid = await getUserUID(userId)
    const url = API_END_POINTS.getUserBookmarks(slug) + `?_uid=${userUid}`
    const responseSlugBookmark = await axios.get(url, {
      ...axiosRequestConfig,
      headers: { authorization: getWriteApiToken() },
    })
    res.send(responseSlugBookmark.data)
  } catch (err) {
    logError('ERROR ON GET topicsApi /:slug/bookmarks >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

usersApi.get('/:slug/downvoted', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const slug = req.params.slug
    const userUid = await getUserUID(userId)
    const url = API_END_POINTS.getUserDownvotedPosts(slug) + `?_uid=${userUid}`
    const responseSlugDownVoted = await axios.get(url, {
      ...axiosRequestConfig,
      headers: { authorization: getWriteApiToken() },
    })
    res.send(responseSlugDownVoted.data)
  } catch (err) {
    logError('ERROR ON GET topicsApi /:slug/downvoted >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

usersApi.get('/:slug/groups', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const slug = req.params.slug
    const userUid = await getUserUID(userId)
    const url = API_END_POINTS.getUserGroups(slug) + `?_uid=${userUid}`
    const responseSlugGroups = await axios.get(url, {
      ...axiosRequestConfig,
      headers: { authorization: getWriteApiToken() },
    })
    res.send(responseSlugGroups.data)
  } catch (err) {
    logError('ERROR ON GET topicsApi /:slug/groups >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

usersApi.get('/:slug/info', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const slug = req.params.slug
    const userUid = await getUserUID(userId)
    const url = API_END_POINTS.getUserInfo(slug) + `?_uid=${userUid}`
    const responseSlugInfo = await axios.get(url, {
      ...axiosRequestConfig,
      headers: { authorization: getWriteApiToken() },
    })
    res.send(responseSlugInfo.data)
  } catch (err) {
    logError('ERROR ON GET topicsApi /:slug/info >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

usersApi.get('/me', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const userSlug = await getUserSlug(userId)
    const userUid = await getUserUID(userId)
    const url = API_END_POINTS.getUserProfile(userSlug) + `?_uid=${userUid}`
    const responseMe = await axios.get(url, {
      ...axiosRequestConfig,
      headers: { authorization: getWriteApiToken() },
    })
    res.send(responseMe.data)
  } catch (err) {
    logError('ERROR ON GET User Profile /me >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

usersApi.get('/:slug/posts', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const slug = req.params.slug
    const userUid = await getUserUID(userId)
    const url = API_END_POINTS.getUserPosts(slug) + `?_uid=${userUid}`
    const responseSlugPosts = await axios.get(url, {
      ...axiosRequestConfig,
      headers: { authorization: getWriteApiToken() },
    })
    res.send(responseSlugPosts.data)
  } catch (err) {
    logError('ERROR ON GET topicsApi /:slug/posts >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

usersApi.get('/:slug/upvoted', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const slug = req.params.slug
    const userUid = await getUserUID(userId)
    const url = API_END_POINTS.getUserUpvotedPosts(slug) + `?_uid=${userUid}`
    const responseSlugUpvoted = await axios.get(url, {
      ...axiosRequestConfig,
      headers: { authorization: getWriteApiToken() },
    })
    res.send(responseSlugUpvoted.data)
  } catch (err) {
    logError('ERROR ON GET topicsApi /:slug/upvoted >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

usersApi.get('/:slug/watched', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const slug = req.params.slug
    const userUid = await getUserUID(userId)
    const url = API_END_POINTS.getUsersWatchedTopics(slug) + `?_uid=${userUid}`
    const responseSlugWatched = await axios.get(url, {
      ...axiosRequestConfig,
      headers: { authorization: getWriteApiToken() },
    })
    res.send(responseSlugWatched.data)
  } catch (err) {
    logError('ERROR ON GET topicsApi /:slug/watched >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

usersApi.get('/email/:email', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const email = req.params.email
    const responseEmail = await getUserByEmail(email)
    res.send(responseEmail.data)
  } catch (err) {
    logError('ERROR ON GET topicsApi /email/:email >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

usersApi.get('/:slug/about', async (req, res) => {
  try {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    const slug = req.params.slug
    const userUid = await getUserUID(userId)
    logInfo('called /:slug/about slug=> ', slug)
    const url = API_END_POINTS.getUserProfile(slug) + `?_uid=${userUid}`
    logInfo('called /:slug/about url=> ', url)
    const responseSlug = await axios.get(url, {
      ...axiosRequestConfig,
      headers: { authorization: getWriteApiToken() },
    })
    res.send(responseSlug.data)
  } catch (err) {
    logError('ERROR ON GET topicsApi /:slug/about >', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {})
  }
})

// tslint:disable-next-line: no-any
export async function getUserByEmail(email: any): Promise<any> {
  logInfo('Finding user in NodeBB DiscussionHub...')
  // tslint:disable-next-line: no-try-promise
  try {
    const url = API_END_POINTS.getUserByEmail(email)
    return async () => {
      const responseAPI = axios
        .get(url, { ...axiosRequestConfig })
        .catch((err) => {
          logError(
            'ERROR ON method getUserByEmail api call to nodebb DiscussionHub >',
            err
          )
          return responseAPI
        })
    }
  } catch (err) {
    logError('ERROR ON method getUserByEmail >', err)
    return err
  }
}

// tslint:disable-next-line: no-any
export async function getUserByUsername(username: any): Promise<any> {
  logInfo('Finding user in NodeBB DiscussionHub...')
  // tslint:disable-next-line: no-try-promise
  try {
    const url = API_END_POINTS.getUserByUsername(username)
    return async () => {
      axios.get(url, { ...axiosRequestConfig }).catch((err) => {
        logError(
          'ERROR ON method getUserByUsername api call to nodebb DiscussionHub >',
          err
        )
        return err
      })
    }
  } catch (err) {
    logError('ERROR ON method getUserByUsername >', err)
    return err
  }
}
