import axios from 'axios'
import { Router } from 'express'
import { getRootOrg } from '../../authoring/utils/header'
import { axiosRequestConfig } from '../../configs/request.config'
import { CONSTANTS } from '../../utils/env'
import { logInfo } from '../../utils/logger'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { handleWriteApiError } from './writeApi'

const API_ENDPOINTS = {
    getPosts: (term: string) => `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/recent/posts/${term}`,
}

export const postsApi = Router()

postsApi.get('/:term', async (req, res) => {
    try {
        const rootOrg = getRootOrg(req)
        const userId = extractUserIdFromRequest(req)
        logInfo(`UserId: ${userId}, rootOrg: ${rootOrg}`)
        const term = req.params.term
        const url = API_ENDPOINTS.getPosts(term)
        const response = await axios.get(
            url,
            { ...axiosRequestConfig, headers: { rootOrg } }
        )
        res.send(response.data)
    } catch (err) {
        handleWriteApiError(res, err, 'ERROR ON GET postsApi /:term >')
    }
})
