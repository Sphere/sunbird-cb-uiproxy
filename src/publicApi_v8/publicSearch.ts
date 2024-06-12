import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { Pool } from 'pg'
import { axiosRequestConfigLong } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'

export const publicSearch = Router()

const API_END_POINTS = {
  search: `${CONSTANTS.HTTPS_HOST}/apis/public/v8/publicContent/v1/search`,
  searchv1: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/content/v1/search`,

}
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
const headers = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  org: 'aastar',
  rootorg: 'aastar',
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

publicSearch.post('/getCourses', async (request, response) => {
  try {
    const facetsDataDefault = ['duration', 'lastUpdatedOn']
    const courseSearchRequestData = request.body
    const filters = courseSearchRequestData.request.filters
    filters.contentType = [
      'Course', 'CourseUnit',
    ]
    const facets = courseSearchRequestData.request.facets
    const sortMethod = courseSearchRequestData.request.sort_by || {
      lastUpdatedOn: 'desc',
    }
    if (!courseSearchRequestData.request.query) {
      const requestBodyForSearch = JSON.stringify({
        request: {
          facets: facets || facetsDataDefault,
          filters,
          limit: 200,
          sort_by: sortMethod,
        },
        sort: [
          {
            lastUpdatedOn: 'desc',
          },
        ],
      })
      const searchResponseES = await axios({
        ...axiosRequestConfigLong,
        data: requestBodyForSearch,
        headers,
        method: 'post',
        url: API_END_POINTS.searchv1,
      })
      if (searchResponseES.data.result.count == 0) {
        return response.status(200).json(nullResponseStatus)
      }
      let searchFilteredData = []
      if (!courseSearchRequestData.request.filters.competency) {
        // tslint:disable-next-line: no-any
        searchResponseES.data.result.content.forEach((element: any) => {
          if (!element.competency) {
            searchFilteredData.push(element)
          }
        })
      } else {
        searchFilteredData = searchResponseES.data.result.content
      }
      return response.status(200).json({
        responseCode: 'OK',
        result: {
          content: searchFilteredData,
          count: searchFilteredData.length,
          facets: searchResponseES.data.result.facets,
        },
        status: 200,
      })
    }
    // .................................For search button with query on home page..............................
    if (courseSearchRequestData.request.query) {
      const courseSearchPrimaryData = {
        request: {
          facets,
          fields: [],
          filters,
          limit: 100,
          query: `${courseSearchRequestData.request.query}`,
          sort_by: sortMethod,
        },
        sort: [
          {
            lastUpdatedOn: 'asc',
          },
        ],
      }
      const esResponsePrimaryCourses = await axios({
        ...axiosRequestConfigLong,
        data: courseSearchPrimaryData,
        headers,
        method: 'post',
        url: API_END_POINTS.searchv1,
      })
      logInfo('courseDataPrimary', esResponsePrimaryCourses.data.result.content)
      let courseDataPrimary = esResponsePrimaryCourses.data.result.content
      const facetsData = esResponsePrimaryCourses.data.result.facets
      try {
        let finalConcatenatedData = []
        // tslint:disable-next-line: no-any

        const result = await pool.query(
          `SELECT id FROM public.data_node where type=$1 and name ILIKE $2`,
          ['Competency', '%' + courseSearchRequestData.request.query + '%']
        )
        // tslint:disable-next-line: no-any
        const postgresResponseData = result.rows.map((val: any) => val.id)
        let courseDataSecondary = []
        if (postgresResponseData.length > 0) {
          const elasticSearchData = []
          for (const postgresResponse of postgresResponseData) {
            // adding Competency Level Ids to search for all the competencies in ES
            for (const value of [1, 2, 3, 4, 5]) {
              elasticSearchData.push(`${postgresResponse}-${value}`)
            }
          }
          const courseSearchSecondaryData = {
            limit: 50,
            request: {
              filters,
              sort_by: sortMethod,
            },
            sort: [{ lastUpdatedOn: 'desc' }],
          }
          logInfo('Competency search postgres collection', JSON.stringify(elasticSearchData))
          courseSearchSecondaryData.request.filters.competencySearch =
            elasticSearchData
          try {
            const elasticSearchResponseSecond = await axios({
              ...axiosRequestConfigLong,
              data: courseSearchSecondaryData,
              headers,
              method: 'post',
              url: API_END_POINTS.searchv1,
            })
            logInfo('elasticSearchResponseSecond', elasticSearchResponseSecond.data)
            courseDataSecondary =
              elasticSearchResponseSecond.data.result.content || []
          } catch (error) {
            logInfo(JSON.stringify(error))
            return response.status(500).json({
              message: 'Something went wrong while fetching competency filtered data',
            })
          }

        }
        if (!courseDataPrimary) courseDataPrimary = []
        const finalFilteredData = []
        finalConcatenatedData = courseDataPrimary.concat(courseDataSecondary)
        logInfo('finalConcatenatedData', JSON.stringify(finalConcatenatedData))
        if (finalConcatenatedData.length == 0) {
          response.status(200).json(nullResponseStatus)
          return
        }
        finalConcatenatedData.forEach((element) => {
          if (!element.competency) {
            finalFilteredData.push(element)
          }
        })
        const uniqueCourseData = _.uniqBy(finalFilteredData, 'identifier')

        response.status(200).json({
          responseCode: 'OK',
          result: {
            content: uniqueCourseData,
            count: uniqueCourseData.length,
            facets: facetsData,
          },
          status: 200,
        })
      } catch (error) {
        response.status(400).json({
          message: 'Something went wrong while connecting search service',
        })
      }
    }
  } catch (err) {
    logInfo(JSON.stringify(err))
    response.status(400).json({
      message: 'Error while public search',
    })
  }
})
