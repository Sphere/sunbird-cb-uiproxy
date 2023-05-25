import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { Pool } from 'pg'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'

export const publicSearch = Router()

const facets = [
  'learningMode',
  'duration',
  'complexityLevel',
  'catalogPaths',
  'sourceShortName',
  'region',
  'concepts',
  'lastUpdatedOn',
]
const API_END_POINTS = {
  search: `${CONSTANTS.HTTPS_HOST}/apis/public/v8/publicContent/v1/search`,
}
const elasticSearchConnectionDetails = {
  database: CONSTANTS.POSTGRES_DATABASE,
  host: CONSTANTS.POSTGRES_HOST,
  password: CONSTANTS.POSTGRES_PASSWORD,
  port: CONSTANTS.POSTGRES_PORT,
  user: CONSTANTS.POSTGRES_USER,
}

const pool = new Pool({
  database: elasticSearchConnectionDetails.database,
  host: elasticSearchConnectionDetails.host,
  password: elasticSearchConnectionDetails.password,
  port: Number(elasticSearchConnectionDetails.port),
  user: elasticSearchConnectionDetails.user,
})
const headers = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  org: 'aastar',
  rootorg: 'aastar',
}
// tslint:disable-next-line: no-any
const competencySearchController = async (courseSearchRequestData: any) => {
  const requestBodyForCompetencyLevel = JSON.stringify({
    request: {
      filters: {
        competencySearch:
          courseSearchRequestData.request.filters.competencySearch,
        contentType: ['Course'],
        primaryCategory: ['Course'],
        status: ['Live'],
      },
      sort_by: {
        lastUpdatedOn: 'desc',
      },
    },
    sort: [
      {
        lastUpdatedOn: 'desc',
      },
    ],
  })
  return axios({
    data: requestBodyForCompetencyLevel,
    headers,
    method: 'post',
    url: API_END_POINTS.search,
  })
}
// tslint:disable-next-line: no-any
const homePageCourseController = async (
  // tslint:disable-next-line: no-any
  sortMethod: any,
  // tslint:disable-next-line: no-any
  languageSelected: any,
  // tslint:disable-next-line: no-any
  sourceName: any
) => {
  const requestBodyHomePageCourseData = {
    query: '',
    request: {
      facets: [
        'learningMode',
        'duration',
        'complexityLevel',
        'catalogPaths',
        'sourceShortName',
        'region',
        'concepts',
        'lastUpdatedOn',
      ],
      filters: {
        contentType: ['Course'],
        lang: [languageSelected] || '',
        primaryCategory: ['Course'],
        sourceName,
        status: ['Live'],
      },
      sort_by: {
        lastUpdatedOn: sortMethod,
      },
    },
    sort: [
      {
        lastUpdatedOn: 'desc',
      },
    ],
  }
  if (!languageSelected) {
    delete requestBodyHomePageCourseData.request.filters.lang
  }
  if (!sourceName) {
    delete requestBodyHomePageCourseData.request.filters.sourceName
  }
  return axios({
    data: requestBodyHomePageCourseData,
    headers,
    method: 'post',
    url: API_END_POINTS.search,
  })
}
// tslint:disable-next-line: no-any
const selfAssessmentController = async (courseSearchRequestData: any) => {
  const requestBodyForCompetencySelfAssessment = {
    request: {
      filters: {
        competency: [true],
        contentType: ['Course'],
        lang: courseSearchRequestData.request.filters.lang || '',
        primaryCategory: ['Course'],
        status: ['Live'],
      },
    },
    sort: [
      {
        lastUpdatedOn: 'desc',
      },
    ],
  }
  if (!courseSearchRequestData.request.filters.lang) {
    delete requestBodyForCompetencySelfAssessment.request.filters.lang
  }
  return axios({
    data: requestBodyForCompetencySelfAssessment,
    headers,
    method: 'post',
    url: API_END_POINTS.search,
  })
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
    const courseSearchRequestData = request.body
    const languageSelected = courseSearchRequestData.request.filters.lang || ''
    const sourceName = courseSearchRequestData.request.filters.sourceName || ''
    if (courseSearchRequestData.request.filters.competencySearch) {
      const competencySearchControllerData = await competencySearchController(
        courseSearchRequestData
      )
      if (competencySearchControllerData.data.result.count == 0) {
        response.status(200).json(nullResponseStatus)
        return
      }
      const responseForCompetencyLevel =
        competencySearchControllerData.data.result.content
      const competencyLevelCourseFiltered = []
      // tslint:disable-next-line: no-any
      responseForCompetencyLevel.forEach((element: any) => {
        if (!element.competency) {
          competencyLevelCourseFiltered.push(element)
        }
      })
      response.status(200).json({
        responseCode: 'OK',
        result: {
          content: competencyLevelCourseFiltered,
          count: competencyLevelCourseFiltered.length,
        },
        status: 200,
      })
      return
    } // ................................For home page courses........................................
    if (
      !courseSearchRequestData.request.filters.competency &&
      !courseSearchRequestData.request.filters.competencySearch &&
      !courseSearchRequestData.request.query
    ) {
      const sortMethod = courseSearchRequestData.request.sort_by
        ? courseSearchRequestData.request.sort_by.lastUpdatedOn
        : 'asc'
      const homePageCourseControllerData = await homePageCourseController(
        sortMethod,
        languageSelected,
        sourceName
      )
      const responseForHomePageCourseData =
        homePageCourseControllerData.data.result.content
      const homePageCourseFiltered = []
      // tslint:disable-next-line: no-any
      responseForHomePageCourseData.forEach((element: any) => {
        if (!element.competency) {
          homePageCourseFiltered.push(element)
        }
      })
      response.status(200).json({
        responseCode: 'OK',
        result: {
          content: homePageCourseFiltered,
          count: homePageCourseFiltered.length,
          facets: homePageCourseControllerData.data.result.facets,
        },
        status: 200,
      })
      return
    } // ............................. For Self assessment courses.............................
    if (courseSearchRequestData.request.filters.competency) {
      const selfAssessmentCourseControllerData = await selfAssessmentController(
        courseSearchRequestData
      )
      const responseForCompetencySelfAssessmentController =
        selfAssessmentCourseControllerData.data.result.content
      response.status(200).json({
        responseCode: 'OK',
        result: {
          content: responseForCompetencySelfAssessmentController,
          count: responseForCompetencySelfAssessmentController.length,
        },
        status: 200,
      })
      return
    } // .................................For search button with query on home page..............................
    if (courseSearchRequestData.request.query) {
      const courseSearchPrimaryData = {
        request: {
          facets,
          fields: [],
          filters: {
            contentType: ['Course'],
            lang: [languageSelected] || '',
            status: ['Live'],
          },
          query: `${courseSearchRequestData.request.query}`,
          sort_by: {
            lastUpdatedOn: '',
          },
        },
      }
      if (!languageSelected) {
        delete courseSearchPrimaryData.request.filters.lang
      }
      const esResponsePrimaryCourses = await axios({
        data: courseSearchPrimaryData,
        headers,
        method: 'post',
        url: API_END_POINTS.search,
      })
      let courseDataPrimary = esResponsePrimaryCourses.data.result.content
      const facetsData = esResponsePrimaryCourses.data.result.facets
      try {
        let finalConcatenatedData = []
        // tslint:disable-next-line: no-any
        pool.connect((err: any, client: any, release: any) => {
          logError(err)
          client.query(
            `SELECT id FROM public.data_node where type=$1 and name ILIKE $2`,
            ['competency', courseSearchRequestData.request.query],
            // tslint:disable-next-line: no-any
            async (_err: any, res: any) => {
              // tslint:disable-next-line: no-any
              const postgresResponseData = res.rows.map((val: any) => val.id)
              release()
              let courseDataSecondary = []
              if (postgresResponseData.length > 0) {
                const elasticSearchData = []
                for (const postgresResponse of postgresResponseData) {
                  for (const value of [1, 2, 3, 4, 5]) {
                    elasticSearchData.push(`${postgresResponse}-${value}`)
                  }
                }
                const courseSearchSecondaryData = {
                  request: {
                    filters: {
                      competencySearch: elasticSearchData,
                      contentType: ['Course'],
                      lang: [languageSelected] || '',
                      primaryCategory: ['Course'],
                      status: ['Live'],
                    },
                    sort_by: { lastUpdatedOn: 'desc' },
                  },
                  sort: [{ lastUpdatedOn: 'desc' }],
                }
                if (!languageSelected) {
                  delete courseSearchSecondaryData.request.filters.lang
                }
                const elasticSearchResponseSecond = await axios({
                  data: courseSearchSecondaryData,
                  headers,
                  method: 'post',
                  url: API_END_POINTS.search,
                })
                courseDataSecondary =
                  elasticSearchResponseSecond.data.result.content
              }
              if (!courseDataPrimary) courseDataPrimary = []
              const finalFilteredData = []
              finalConcatenatedData =
                courseDataPrimary.concat(courseDataSecondary)
              finalConcatenatedData.forEach((element) => {
                if (!element.competency) {
                  finalFilteredData.push(element)
                }
              })
              const uniqueCourseData = _.uniqBy(
                finalFilteredData,
                'identifier'
              )
              if (finalConcatenatedData.length == 0) {
                response.status(200).json(nullResponseStatus)
                return
              }
              response.status(200).json({
                responseCode: 'OK',
                result: {
                  content: uniqueCourseData,
                  count: uniqueCourseData.length,
                  facets: facetsData,
                },
                status: 200,
              })
            }
          )
        })
      } catch (error) {
        response.status(400).json({
          message: 'Error while connecting postgres',
        })
      }
    }
  } catch (err) {
    response.status(400).json({
      message: 'Error while public search',
    })
  }
})
