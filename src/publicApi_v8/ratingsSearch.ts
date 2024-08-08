import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { Pool } from 'pg'
import { axiosRequestConfigLong } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
const unknownError = 'Failed due to unknown reason'

export const ratingsSearch = Router()

const API_END_POINTS = {
    ratingsSearch: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/bulkRatingLookup`,
    search: `${CONSTANTS.HTTPS_HOST}/apis/public/v8/publicContent/v1/search`,
    searchAPI: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/publicSearch/getcourse`,
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
            return response.status(200).json({
                responseCode: 'OK',
                result: {
                    content: await getCombinedRatingsResult(searchFilteredData),
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
                            url: API_END_POINTS.searchv1,
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
    } catch (err) {
        logInfo(JSON.stringify(err))
        response.status(400).json({
            message: 'Error while public search',
        })
    }
})
ratingsSearch.post('/recommendation/publicSearch/getcourse', async (req, res) => {
    try {
        logInfo('Inside recommendation search course route')
        /* tslint:disable-next-line */
        let searchQuery = req.body.query
        const language = req.body.language
        const searchRequestBody = {
            contentType: 'Course',
            course_status: 'Live',
            language,
            offset: req.body.offset,
            limit: req.body.limit,
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
            url: API_END_POINTS.searchAPI,
        })
        let finalConcatenatedData = []
        let courseDataPrimary = searchServiceResponse.data.results.content
        const result = await pool.query(
            `SELECT id FROM public.data_node where type=$1 and name ILIKE $2`,
            ['Competency', '%' + searchRequestBody.search_text + '%']
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
                request: {
                    filters: {
                        competencySearch: elasticSearchData,
                        lang: language,
                    },
                    limit: req.body.limit,
                    offset: req.body.offset,
                },
                sort: [{ lastUpdatedOn: 'desc' }],
            }
            if (!language) {
                delete courseSearchSecondaryData.request.filters.lang
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
                content: await getCombinedRatingsResult(uniqueCourseData),
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
