import axios from 'axios'
import { Router } from 'express'
import { getRootOrg } from '../../authoring/utils/header'
import { axiosRequestConfig } from '../../configs/request.config'
import { logInfo } from '../../utils/logger'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'
import { handleWriteApiError } from './writeApi'

export const postsApi = Router()

postsApi.get('/:term', async (req, res) => {
    try {
        const rootOrg = getRootOrg(req)
        const userId = extractUserIdFromRequest(req)
        logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
        const term = req.params.term
        const url = API_END_POINTS.getPosts(term)
        const response = await axios.get(
            url,
            { ...axiosRequestConfig, headers: { rootOrg } }
        )
        res.send(response.data)
    } catch (err) {
        handleWriteApiError(res, err, 'ERROR ON GET postsApi /:term >')
    }
})
