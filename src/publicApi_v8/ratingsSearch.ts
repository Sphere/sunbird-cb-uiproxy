import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfigLong } from '../configs/request.config'
// sonar-cleanup: competency-level grouping/sort replaced with the shared import (CHANGE 42)
import { hasCompetencySearchThreshold, sortCoursesByCompetencyLevel } from '../utils/competencyLevelSort'
// sonar-cleanup: '/getCourses' query-branch replaced with the shared import (CHANGE 33)
import { searchCoursesByQuery } from '../utils/courseQuerySearch'
// sonar-cleanup: '/recommendation/publicSearch/getcourse' body replaced with the shared import (CHANGE 34)
import { searchCourseByRecommendationApi } from '../utils/courseRecommendationSearch'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
import { createSearchPgPool } from '../utils/searchPgPool'

export const ratingsSearch = Router()

const API_END_POINTS = {
    ratingsSearch: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/bulkRatingLookup`,
    searchv1: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/content/v1/search`,
}

const pool = createSearchPgPool()
const headers = {
    Accept: 'application/json, text/plain, */*',
    /* tslint:disable-next-line */
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
const getCombinedRatingsResult = async (sourceCourses) => {
    try {
        const getCourseIdsForRatings = sourceCourses.map((course) => course.identifier)
        logInfo('course Ids for search', getCourseIdsForRatings)
        const getRatingsFromRatingService = await axios({
            data: {
                activityIds: getCourseIdsForRatings,
                activityType: 'Course',
            },
            headers: {
                'Content-Type': 'application/json',
            },
            method: 'POST',
            url: API_END_POINTS.ratingsSearch,
        })
        return sourceCourses.map((course) => {
            const matchingRating = getRatingsFromRatingService.data.find((rating) => rating.activityId === course.identifier)
            return { ...course, ...matchingRating }
        })
    } catch (error) {
        logInfo(JSON.stringify(error))
        return []

    }
}
ratingsSearch.post('/getCourses', async (request, response) => {
    try {
        const facetsDataDefault = ['duration', 'lastUpdatedOn']
        const courseSearchRequestData = request.body
        const filters = courseSearchRequestData.request.filters
        const facets = courseSearchRequestData.request.facets
        const sortMethod = courseSearchRequestData.request.sort_by || {
            lastUpdatedOn: 'desc',
        }
        if (!courseSearchRequestData.request.query) {
            const requestBodyForSearch = JSON.stringify({
                request: {
                    facets: facets || facetsDataDefault,
                    filters,
                    limit: 20,
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
            let combinedRatingsData = await getCombinedRatingsResult(searchFilteredData)
            if (hasCompetencySearchThreshold(filters)) {
                combinedRatingsData = sortCoursesByCompetencyLevel(combinedRatingsData)
            }
            return response.status(200).json({
                responseCode: 'OK',
                result: {
                    content: combinedRatingsData,
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
ratingsSearch.post('/recommendation/publicSearch/getcourse', async (req, res) => {
    await searchCourseByRecommendationApi(req, res, pool, true, true, getCombinedRatingsResult)
})
