import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { IContent } from '../models/content.model'
import { searchV5 } from '../protectedApi_v8/content'
import { logError } from '../utils/logger'
const GENERAL_ERROR_MSG = 'Failed due to unknown reason'
import { processContent } from '../utils/contentHelpers'

import { getContentDetails} from '../protectedApi_v8/content'
import { getFilters } from '../service/catalog'
import { CONSTANTS } from '../utils/env'
import { ERROR } from '../utils/message'
import { API_END_POINTS } from './apiConstants'

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
    const contents: IContent[] = response.data.result
    if (Array.isArray(contents)) {
      response.data.result = contents.map((content) => processContent(content))
    }
    res.json(
      response.data || {
        filters: [],
        filtersUsed: [],
        notVisibleFilters: [],
        result: [],
        totalHits: 0,
      }
    )
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
    const rootOrg = req.header('rootOrg')
    const org = req.header('org')
    const query = req.query.q
    const lang = req.query.l
    // tslint:disable-next-line: no-any
    const body: any = {
      _source: ['searchTerm'],
      query: {
        bool: {
          filter: [
            {
              term: {
                rootOrg,
              },
            },
            {
              term: {
                org,
              },
            },
          ],
          should: !query.length
            ? undefined
            : [
              {
                prefix: {
                  'searchTermAnalysed.keyword': {
                    boost: 4,
                    value: query,
                  },
                },
              },
              {
                prefix: {
                  searchTermAnalysed: {
                    boost: 2,
                    value: query,
                  },
                },
              },
            ],
        },
      },
      size: 20,
    }
    const isSuggestedTerm = {
      term: {
        isSuggested: true,
      },
    }
    if (!query.length) {
      body.query.bool.filter.push(isSuggestedTerm)
    }
    const response = await axios.request({
      auth: {
        password: CONSTANTS.ES_PASSWORD,
        username: CONSTANTS.ES_USERNAME,
      },
      data: body,
      method: 'POST',
      ...axiosRequestConfig,
      url: `${API_END_POINTS.searchAutoComplete}/searchautocomplete_${lang}/autocomplete/_search`,
    })
    let data = []
    if (response.data && response.data.hits && response.data.hits.hits) {
      data = response.data.hits.hits.filter((result: { _source: { searchTerm: string } }) => {
        return result._source.searchTerm.length
      })
    }
    res.json(data)
  } catch (err) {
    logError('SEARCH AUTOCOMPLETE ERR -> ', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})
