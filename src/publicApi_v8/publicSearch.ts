import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { axiosRequestConfigLong } from '../configs/request.config'
// sonar-cleanup: competency-level grouping/sort replaced with the shared import (CHANGE 42)
import { hasCompetencySearchThreshold, sortCoursesByCompetencyLevel } from '../utils/competencyLevelSort'
// sonar-cleanup: '/getCourses' query-branch replaced with the shared import (CHANGE 33)
import { searchCoursesByQuery } from '../utils/courseQuerySearch'
import { CONSTANTS } from '../utils/env'
import { createSearchPgPool } from '../utils/searchPgPool'
const pool = createSearchPgPool()
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
      if (hasCompetencySearchThreshold(filters)) {
        searchFilteredData = sortCoursesByCompetencyLevel(searchFilteredData)
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
      await searchCoursesByQuery(response, pool, courseSearchRequestData, filters, facets, sortMethod)
    }
  } catch (err) {
    logInfo(JSON.stringify(err))
    response.status(400).json({
      message: 'Error while public search',
    })
  }
})
