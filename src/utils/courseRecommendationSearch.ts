import axios from 'axios'
import _ from 'lodash'
import { CONSTANTS } from './env'
import { logInfo } from './logger'

const searchAPI = `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/publicSearch/getcourse`
const searchUrl = `${CONSTANTS.HTTPS_HOST}/apis/public/v8/publicContent/v1/search`
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

/**
 * Runs the competency-matched secondary Elasticsearch search for the
 * Postgres-resolved competency ids, or returns an empty array when there
 * are none to search for.
 *
 * @param postgresResponseData - competency ids resolved from the Postgres lookup
 * @param language - the request's language, used for the optional `lang` filter
 * @param req - the incoming request, carrying `limit`/`offset` when `includeOffsetLimit` is set
 * @param includeOffsetLimit - whether to pass `limit`/`offset` through to the secondary search body
 * @param includeLangFilter - whether to add a `lang` filter (deleted when `language` is falsy) to the secondary search body
 */
async function searchSecondaryByCompetency(
  // tslint:disable-next-line: no-any
  postgresResponseData: any[],
  language: string,
  // tslint:disable-next-line: no-any
  req: any,
  includeOffsetLimit: boolean,
  includeLangFilter: boolean
) {
  if (postgresResponseData.length === 0) {
    return []
  }
  const elasticSearchData = []
  for (const postgresResponse of postgresResponseData) {
    // adding Competency Level Ids to search for all the competencies in ES
    for (const value of [1, 2, 3, 4, 5]) {
      elasticSearchData.push(`${postgresResponse}-${value}`)
    }
  }
  const courseSearchSecondaryData = {
    request: {
      filters: {
        competencySearch: elasticSearchData,
        ...(includeLangFilter ? { lang: language } : {}),
      },
      ...(includeOffsetLimit ? { limit: req.body.limit, offset: req.body.offset } : {}),
    },
    sort: [{ lastUpdatedOn: 'desc' }],
  }
  if (includeLangFilter && !language) {
    delete courseSearchSecondaryData.request.filters.lang
  }
  const elasticSearchResponseSecond = await axios({
    data: courseSearchSecondaryData,
    headers,
    method: 'post',
    url: searchUrl,
  })
  return elasticSearchResponseSecond.data.result.content || []
}

// sonar-cleanup: extracted from ratingsSearch.ts's and courseRecommendation.ts's
// ~90%-identical '/recommendation/publicSearch/getcourse' and
// '/publicSearch/getcourse' route bodies (CHANGE 34). `pool` stays a
// caller-supplied parameter, matching courseQuerySearch.ts's precedent, so
// each file keeps managing its own Postgres pool exactly as before.
/**
 * Searches courses via the recommendation-service primary search plus a
 * Postgres-driven competency-matched secondary search, merges and
 * deduplicates the results, and sends the 200/500 response.
 *
 * @param req - the incoming request, carrying `query`, `language`, and (when `includeOffsetLimit`) `limit`/`offset`
 * @param res - the Express response to send the result or error on
 * @param pool - the caller's own Postgres pool
 * @param includeOffsetLimit - whether to pass `limit`/`offset` through to both the primary and secondary search bodies (ratingsSearch.ts only)
 * @param includeLangFilter - whether to add a `lang` filter (deleted when `language` is falsy) to the secondary search body (ratingsSearch.ts only)
 * @param enrichWithRatings - a ratings-enrichment function applied to the final content (ratingsSearch.ts only); pass-through (identity) when not needed
 */
export async function searchCourseByRecommendationApi(
  // tslint:disable-next-line: no-any
  req: any,
  // tslint:disable-next-line: no-any
  res: any,
  // tslint:disable-next-line: no-any
  pool: any,
  includeOffsetLimit: boolean,
  includeLangFilter: boolean,
  // tslint:disable-next-line: no-any
  enrichWithRatings: (courses: any[]) => Promise<any[]>
) {
  try {
    logInfo('Inside recommendation search course route')
    /* tslint:disable-next-line */
    let searchQuery = req.body.query
    const language = req.body.language
    const searchRequestBody = {
      contentType: 'Course',
      course_status: 'Live',
      language,
      ...(includeOffsetLimit ? { limit: req.body.limit, offset: req.body.offset } : {}),
      resourceType: 'Course',
      search_fieldnames: [
        'audience',
        'competencies_v1',
        'creator',
        'description',
        'keywords',
        'sourceName',
        'subTitle',
        'name',
      ],
      search_text: searchQuery,
    }
    const searchServiceResponse = await axios({
      data: searchRequestBody,
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      url: searchAPI,
    })
    let finalConcatenatedData = []
    let courseDataPrimary = searchServiceResponse.data.results.content
    const result = await pool.query(
      `SELECT id FROM public.data_node where type=$1 and name ILIKE $2`,
      ['Competency', '%' + searchRequestBody.search_text + '%']
    )
    // tslint:disable-next-line: no-any
    const postgresResponseData = result.rows.map((val: any) => val.id)
    const courseDataSecondary = await searchSecondaryByCompetency(
      postgresResponseData,
      language,
      req,
      includeOffsetLimit,
      includeLangFilter
    )
    if (!courseDataPrimary) courseDataPrimary = []
    const finalFilteredData = []
    finalConcatenatedData = courseDataPrimary.concat(courseDataSecondary)
    if (finalConcatenatedData.length == 0) {
      res.status(200).json(nullResponseStatus)
      return
    }
    /* tslint:disable-next-line */
    finalConcatenatedData.forEach((element) => {
      // tslint:disable-next-line: no-any
      if (!element.competency) {
        finalFilteredData.push(element)
      }
    })
    const uniqueCourseData = _.uniqBy(finalFilteredData, 'identifier')
    res.status(200).json({
      responseCode: 'OK',
      result: {
        content: await enrichWithRatings(uniqueCourseData),
        count: uniqueCourseData.length,
      },
      status: 200,
    })
  } catch (err) {
    logInfo(JSON.stringify(err))
    res.status(err?.response?.status || 500).send(
      err?.response?.data || {
        error: 'Failed due to unknown reason',
      }
    )
  }
}
