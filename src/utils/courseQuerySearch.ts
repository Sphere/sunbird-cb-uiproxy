import axios from 'axios'
import _ from 'lodash'
import { axiosRequestConfigLong } from '../configs/request.config'
import { API_END_POINTS } from '../publicApi_v8/apiConstants'
import { logError, logInfo } from './logger'
import { CONSTANTS } from './env'

const searchv1Url = API_END_POINTS.searchv1
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


// tslint:disable-next-line: no-any
const errorDetail = (e: any): string =>
  JSON.stringify(_.get(e, 'response.data') || _.get(e, 'message') || e)

// Normalize a competency/query string for comparison: trim, lowercase, collapse
// internal whitespace. Used to match the search term against a competency name.
const normalizeName = (value: string): string =>
  (value || '').trim().toLowerCase().replace(/\s+/g, ' ')

// Resolve a free-text query to competency level ids (entityId-level) via the FRAC
// entity service (replaces the old competency Postgres/data_node lookup). Returns []
// if FRAC is unavailable, so course search degrades to the primary text-search
// results instead of failing. entityId is language-neutral (language defaulted to
// 'en'); course language is handled downstream by the ES filters (filters.lang).
//
// FRAC is called with strict:'false', which fuzzy-matches every WORD in the query
// against competency names (e.g. "Normal Labour & Birth and AMTSL" returns 57
// competencies: AMTSL, Normal delivery, Birth Planning, Low birth weight...).
// Expanding all of them floods the results (67 courses vs prod's 2). So we only
// keep competencies whose name actually EQUALS the query - i.e. the user searched a
// competency name (e.g. "amtsl"). A course-title/phrase search matches no competency
// name and correctly triggers no expansion, matching prod behaviour.
const getCompetencyLevelIds = async (query: string): Promise<string[]> => {
  try {
    const fracResponse = await axios({
      ...axiosRequestConfigLong,
      data: {
        entityType: 'Competency',
        field: ['code', 'name', 'levels'],
        language: 'en',
        query,
        strict: 'false',
      },
      method: 'post',
      url: `${CONSTANTS.FRAC_ETL_API_BASE}/v1/entity/search`,
    })
    // tslint:disable-next-line: no-any
    const entities: any[] = _.get(fracResponse, 'data.result.entity') || []
    const normalizedQuery = normalizeName(query)
    const levelIds: string[] = []
    for (const competency of entities) {
      // Only expand competencies the query actually names - drops fuzzy word-matches.
      if (normalizeName(competency.name) !== normalizedQuery) {
        continue
      }
      const levels: number[] = Array.isArray(competency.levels) && competency.levels.length > 0
        ? competency.levels.map((lvl: { levelNumber: number }) => lvl.levelNumber)
        : [1, 2, 3, 4, 5]
      for (const level of levels) {
        levelIds.push(`${competency.entityId}-${level}`)
      }
    }
    return levelIds
  } catch (fracError) {
    logError('getCompetencyLevelIds: FRAC lookup failed, returning [] so search degrades to primary results: ' + errorDetail(fracError))
    return []
  }
}

export async function   searchCoursesByQuery(
  // tslint:disable-next-line: no-any
  response: any,
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
    const elasticSearchData = await getCompetencyLevelIds(courseSearchRequestData.request.query)
    let courseDataSecondary = []
    if (elasticSearchData.length > 0) {
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
          elasticSearchResponseSecond.data.result.content ?? []
      } catch (error) {
        logInfo(JSON.stringify(error))
        courseDataSecondary = []
        return response.status(500).json({
          message: 'Something went wrong while fetching competency filtered data',
        })
      }

    }
    if (!courseDataPrimary) courseDataPrimary = []
    finalConcatenatedData = courseDataPrimary.concat(courseDataSecondary)
    if (finalConcatenatedData.length == 0) {
      response.status(200).json(nullResponseStatus)
      return
    }
    const finalFilteredData = finalConcatenatedData.filter((element) => element.competency !== true)
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
