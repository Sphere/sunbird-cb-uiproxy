import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfigLong } from '../configs/request.config'
// sonar-cleanup: '/getCourses' query-branch replaced with the shared import (CHANGE 33)
import { searchCoursesByQuery } from '../utils/courseQuerySearch'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
import { createSearchPgPool } from '../utils/searchPgPool'

export const publicSearch = Router()

const API_END_POINTS = {
  search: `${CONSTANTS.HTTPS_HOST}/apis/public/v8/publicContent/v1/search`,
  searchv1: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/content/v1/search`,

}

const pool = createSearchPgPool()
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
      await searchCoursesByQuery(response, pool, courseSearchRequestData, filters, facets, sortMethod)
    }
  } catch (err) {
    logInfo(JSON.stringify(err))
    response.status(400).json({
      message: 'Error while public search',
    })
  }
})
