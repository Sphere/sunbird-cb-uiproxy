import axios from 'axios'
import _ from 'lodash'
import { axiosRequestConfigLong } from '../configs/request.config'
import { CONSTANTS } from './env'
import { logInfo } from './logger'

const searchv1Url = `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/content/v1/search`
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

// sonar-cleanup: extracted from publicSearch.ts's and ratingsSearch.ts's
// byte-identical '/getCourses' query-branch (the `if
// (courseSearchRequestData.request.query) { ... }` block) (CHANGE 33).
// The two files' no-query branches genuinely differ (publicSearch.ts adds
// a contentType filter and uses limit 200; ratingsSearch.ts uses limit 20
// and enriches results via getCombinedRatingsResult) and stay untouched in
// each file — only this query branch was byte-identical end to end.
// `pool` stays a caller-supplied parameter rather than created here, so
// each file keeps managing its own Postgres pool exactly as before.
/**
 * Handles the query-based course search branch: a primary Elasticsearch
 * search plus a secondary competency-filtered search merged and
 * deduplicated, sent as the 200/400/500 response.
 * @param response the Express response to send the result or error to
 * @param pool the caller's own Postgres pool (from createSearchPgPool)
 * @param courseSearchRequestData the parsed request body
 * @param filters the request's filters object
 * @param facets the request's facets array
 * @param sortMethod the request's sort_by, or the default `{lastUpdatedOn: 'desc'}`
 */
export async function searchCoursesByQuery(
  // tslint:disable-next-line: no-any
  response: any,
  // tslint:disable-next-line: no-any
  pool: any,
  // tslint:disable-next-line: no-any
  courseSearchRequestData: any,
  // tslint:disable-next-line: no-any
  filters: any,
  // tslint:disable-next-line: no-any
  facets: any,
  // tslint:disable-next-line: no-any
  sortMethod: any
) {
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
    url: searchv1Url,
  })
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
      courseSearchSecondaryData.request.filters.competencySearch =
        elasticSearchData
      try {
        const elasticSearchResponseSecond = await axios({
          ...axiosRequestConfigLong,
          data: courseSearchSecondaryData,
          headers,
          method: 'post',
          url: searchv1Url,
        })
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
