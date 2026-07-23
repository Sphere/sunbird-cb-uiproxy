import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { axiosRequestConfigLong } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'

export const publicSearch = Router()

import { API_END_POINTS } from './apiConstants'
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

// tslint:disable-next-line: no-any
const errorDetail = (e: any): string =>
  JSON.stringify(_.get(e, 'response.data') || _.get(e, 'message') || e)

// Resolve a free-text query to competency level ids (entityId-level) via the FRAC
// entity service (replaces the old competency Postgres/data_node lookup). Returns []
// if FRAC is unavailable, so course search degrades to the primary text-search
// results instead of failing. entityId is language-neutral (language defaulted to
// 'en'); course language is handled downstream by the ES filters (filters.lang).
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
    const levelIds: string[] = []
    for (const competency of entities) {
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

publicSearch.post('/getCourses', async (request, response) => {
  try {
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
          facets,
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
      if (filters.hasOwnProperty('competencySearch') && Array.isArray(filters.competencySearch) && filters.competencySearch.length >= 5) {
        interface Course {
            lang: string
            competencies_v1: string
            lastUpdatedOn: string
            // tslint:disable-next-line: no-any
            [key: string]: any
        }
        function getLevel(course: Course) {
            try {
                const parsed = JSON.parse(course.competencies_v1)
                return Number(parsed[0]?.level || 0)
            } catch {
                return 0
            }
        }
        const grouped: Record<string, Course[]> = searchFilteredData.reduce((acc, course) => {
            acc[course.lang] = acc[course.lang] || []
            acc[course.lang].push(course)
            return acc
        }, {})

        const sortedGrouped = Object.values(grouped).flatMap((group) => {
            return group.slice().sort((a, b) => {
                const levelDiff = getLevel(a) - getLevel(b)
                if (levelDiff !== 0) return levelDiff
                return new Date(b.lastUpdatedOn).getTime() - new Date(a.lastUpdatedOn).getTime()
            })
        })
        searchFilteredData = sortedGrouped

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
      let courseDataPrimary = esResponsePrimaryCourses.data.result.content
      const facetsData = esResponsePrimaryCourses.data.result.facets
      try {
        let finalConcatenatedData = []
        // Resolve the search term to competency level ids (entityId-level) via FRAC.
        // Degrades to [] on FRAC failure so search still returns the primary results.
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
              url: API_END_POINTS.searchv1,
            })
            courseDataSecondary =
              elasticSearchResponseSecond.data.result.content || []
          } catch (error) {
            // competency-filtered search failed - degrade to primary text-search results
            logError('getCourses: competency-filtered search failed, returning primary results only: ' + errorDetail(error))
            courseDataSecondary = []
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
        logError('getCourses: error building course search response: ' + errorDetail(error))
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
