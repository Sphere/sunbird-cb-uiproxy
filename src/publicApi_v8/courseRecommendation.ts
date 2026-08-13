import { Router } from 'express'
import { Pool } from 'pg'
// sonar-cleanup: '/publicSearch/getcourse' body replaced with the shared import (CHANGE 34)
import { searchCourseByRecommendationApi } from '../utils/courseRecommendationSearch'
import { CONSTANTS } from '../utils/env'

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
export const courseRecommendation = Router()

courseRecommendation.post('/publicSearch/getcourse', async (req, res) => {
    await searchCourseByRecommendationApi(req, res, pool, false, false, async (courses) => courses)
})
