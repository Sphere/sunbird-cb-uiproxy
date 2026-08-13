import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { getContentDetails, searchV5 } from '../protectedApi_v8/content'
import { logError } from '../utils/logger'
const GENERAL_ERROR_MSG = 'Failed due to unknown reason'
import { sendAutoCompleteSearchResponse, sendSearchResponse } from '../utils/contentHelpers'

import { getFilters } from '../service/catalog'
import { CONSTANTS } from '../utils/env'
import { ERROR } from '../utils/message'
const API_END_POINTS = {
  searchAutoComplete: `${CONSTANTS.ES_BASE}`,
  searchV6: `${CONSTANTS.SEARCH_API_BASE}/v6/search`,

}

export const homePage = Router()

const adminId = 'ec2687b9-7b86-4321-bbc7-8c9509b834ee'
homePage.get('/latestCourses', async (req, res) => {
  try {
    const filters = {
      request:
      {
        didYouMean: true,
        filters: {
          contentType: ['Course', 'Program'],
          lastUpdatedOn: ['month'],
          locale: ['en'],
        },
        pageSize: 20,
        query: '',
      },
    }

    const reqBody = {
      ...req.body,
      request: {
        ...filters.request,
        rootOrg: req.header('rootOrg'),
        uuid: adminId,
      },
    }

    const response = await searchV5(reqBody)
    res.json(response)
  } catch (err) {
    logError('SEARCH API ERROR >', err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

// searchv6

homePage.post('/searchV6', async (req, res) => {
  try {
    const body = {
      ...req.body,
      rootOrg: req.header('rootOrg'),
      uuid: adminId,
    }
    const response = await axios.post(API_END_POINTS.searchV6, body, axiosRequestConfig)
    sendSearchResponse(res, response)
  } catch (err) {
    logError('SEARCH V6 API ERROR >', err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

// catalog

homePage.get('/catalog', async (req, res) => {
  try {
    const userId = adminId
    const rootOrg = req.headers.rootorg
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    if (typeof rootOrg === 'string') {
      const filters = await getFilters(userId, rootOrg, 'catalogPaths')
      res.send(filters)
      return
    }

    res.status(400).send({ error: ERROR.ERROR_NO_ORG_DATA })
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {

        error: 'Failed due to unknown reason',
      }
    )
  }
})

homePage.post('/:contentId', async (req, res) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const { contentId } = req.params
    const additionalFields = req.body.additionalFields
    const fetchOneLevel = req.body.fetchOneLevel || false
    const hierarchyType = req.query.hierarchyType
    const response = await getContentDetails(
      contentId,
      rootOrg,
      org,
      adminId,
      hierarchyType,
      additionalFields,
      fetchOneLevel
    )

    res.json(response)
  } catch (err) {
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

homePage.get('/searchAutoComplete', async (req, res) => {
  try {
    await sendAutoCompleteSearchResponse(req, res, API_END_POINTS.searchAutoComplete)
  } catch (err) {
    logError('SEARCH AUTOCOMPLETE ERR -> ', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})
