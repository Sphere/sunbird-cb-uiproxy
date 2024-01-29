import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { Pool } from 'pg'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'

const API_END_POINTS = {
  // tslint:disable-next-line: no-any
  recommendationAPI: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/course/recommendation`,
  search: `${CONSTANTS.HTTPS_HOST}/apis/public/v8/publicContent/v1/search`,
  searchAPI: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/publicSearch/getcourse`,
}
const nullResponseStatus = {
  responseCode: 'OK',
  result: {
    content: [],
    count: 0,
    facets: [],
  },
  status: 200,
}
const headers = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  org: 'aastar',
  rootorg: 'aastar',
}
const unknownError = 'Failed due to unknown reason'
const postgresConnectionDetails = {
  database: CONSTANTS.POSTGRES_DATABASE,
  host: CONSTANTS.POSTGRES_HOST,
  password: CONSTANTS.POSTGRES_PASSWORD,
  port: CONSTANTS.POSTGRES_PORT,
  user: CONSTANTS.POSTGRES_USER,
}

const pool = new Pool({
  database: postgresConnectionDetails.database,
  host: postgresConnectionDetails.host,
  password: postgresConnectionDetails.password,
  port: Number(postgresConnectionDetails.port),
  user: postgresConnectionDetails.user,
})

export const recommendationEngineV2 = Router()
recommendationEngineV2.get('/', async (req, res) => {
  try {
    /* tslint:disable-next-line */
    let responseObject = {
      background: req.query.background || '',
      profession: req.query.profession || '',
    }
    if (!req.query.background) {
      delete responseObject.background
    }
    if (!req.query.profession) {
      delete responseObject.profession
    }
    const response = await axios({
      method: 'GET',
      params: responseObject,
      url: API_END_POINTS.recommendationAPI,
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    logInfo(JSON.stringify(err))
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})
recommendationEngineV2.post('/publicSearch/getcourse', async (req, res) => {
  try {
    logInfo('Inside recommendation search course route')
    /* tslint:disable-next-line */
    let searchRequestBody = req.body
    const searchServiceResponse = await axios({
      data: searchRequestBody,
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      url: API_END_POINTS.searchAPI,
    })
    let finalConcatenatedData = []

    let courseDataPrimary = searchServiceResponse.data.results.content
    logInfo('coursedataprimary', courseDataPrimary)
    const result = await pool.query(
      `SELECT id FROM public.data_node where type=$1 and name ILIKE $2`,
      ['Competency', '%' + searchRequestBody.search_text + '%']
    )
    // tslint:disable-next-line: no-any
    const postgresResponseData = result.rows.map((val: any) => val.id)
    logInfo('postgresResponseData', JSON.stringify(postgresResponseData))
    let courseDataSecondary = []
    if (postgresResponseData.length > 0) {
      const elasticSearchData = []
      for (const postgresResponse of postgresResponseData) {
        // adding Competency Level Ids to search for all the competencies in ES
        for (const value of [1, 2, 3, 4, 5]) {
          elasticSearchData.push(`${postgresResponse}-${value}`)
        }
      }
      logInfo('elasticSearchData', JSON.stringify(elasticSearchData))
      const courseSearchSecondaryData = {
        request: {
          filters: {
            competencySearch: elasticSearchData
          }
        },
        sort: [{ lastUpdatedOn: 'desc' }],
      }
      const elasticSearchResponseSecond = await axios({
        data: courseSearchSecondaryData,
        headers,
        method: 'post',
        url: API_END_POINTS.search,
      })
      courseDataSecondary =
        elasticSearchResponseSecond.data.result.content || []
    }
    if (!courseDataPrimary) courseDataPrimary = []
    const finalFilteredData = []
    finalConcatenatedData = courseDataPrimary.concat(courseDataSecondary)
    logInfo('finalConcatenatedData 1', JSON.stringify(finalConcatenatedData))
    if (finalConcatenatedData.length == 0) {
      res.status(200).json(nullResponseStatus)
      return
    }

    finalConcatenatedData.forEach((element) => {
      if (!element.competency) {
        finalFilteredData.push(element)
      }
    })
    logInfo('finalFilteredData', JSON.stringify(finalFilteredData))

    const uniqueCourseData = _.uniqBy(finalFilteredData, 'identifier')

    res.status(200).json({
      responseCode: 'OK',
      result: {
        content: uniqueCourseData,
        count: uniqueCourseData.length,
        // facets: facetsData,
      },
      status: 200,
    })
  } catch (err) {
    logInfo(JSON.stringify(err))
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})
