import axios from 'axios'
import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import util from 'util'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
export const adminApiV8 = Router()
const getErrorPage = async () => {
    const readFile = util.promisify(fs.readFile)
    const filePath = path.join(__dirname, 'error.html')
    return readFile(filePath, 'utf8')
}
const API_END_POINTS = {
    getLeanerCompletedResourceDetails: `${CONSTANTS.SELF_SERVICE_PORTAL_API_BASE}/v1/user/getLeanerCompletedResourceDetails`,
    getLearnerDetails: `${CONSTANTS.SELF_SERVICE_PORTAL_API_BASE}/v1/user/getLearnerDetails`,
}
adminApiV8.get('/v1/user/getLearnerDetails', async (req, res) => {
    try {
        const { authorizationKey } = req.query
        const selfServiceAuthKey = CONSTANTS.SELF_SERVICE_PORTAL_AUTH_KEY
        if (!authorizationKey || (authorizationKey != selfServiceAuthKey)) {
            return res.status(403).send(await getErrorPage())
        }
        const response = await axios({
            method: 'GET',
            params: req.query,
            url: API_END_POINTS.getLearnerDetails,
        })
        res.status(200).send(response.data)
    } catch (error) {
        logInfo(error)
        return res.status(403).send(await getErrorPage())
    }
})
adminApiV8.get('/v1/user/getLeanerCompletedResourceDetails', async (req, res) => {
    try {
        const { authorizationKey } = req.query
        const selfServiceAuthKey = CONSTANTS.SELF_SERVICE_PORTAL_AUTH_KEY
        if (!authorizationKey || (authorizationKey != selfServiceAuthKey)) {
            return res.status(403).send(await getErrorPage())
        }
        const response = await axios({
            method: 'GET',
            params: req.query,
            url: API_END_POINTS.getLeanerCompletedResourceDetails,
        })
        res.status(200).send(response.data)
    } catch (error) {
        logInfo(error)
        return res.status(403).send(await getErrorPage())
    }
})
