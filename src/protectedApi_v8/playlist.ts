import axios from 'axios'
import { Request, Response, Router } from 'express'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { extractUserToken } from '../utils/requestExtract'

// ---- API ENDPOINTS ----
// Using Kong API Gateway for playlist service routing
const API_END_POINTS = {
    playlistSearch: `${CONSTANTS.KONG_API_BASE}/playlist/v1/search`,
}

// ---- ERROR MESSAGES ----
const ERROR_MESSAGES = {
    INTERNAL_SERVER_ERROR: 'Internal server error',
    INVALID_REQUEST: 'Invalid request body structure',
    MISSING_REQUEST_BODY: 'Missing request body or request object',
}

export const playlistApi = Router()

/**
 * POST /search
 * Search for playlists based on filters
 *
 * Request Body:
 * {
 *   "request": {
 *     "limit": "number",
 *     "filters": {
 *       "orgId": "string",
 *       "playlistId": "string" (optional)
 *     }
 *   }
 * }
 *
 * Response: Returns playlist search results from Kong API Gateway
 */
playlistApi.post('/search', async (req: Request, res: Response) => {
    try {
        const requestBody = req.body

        // Validate request structure
        if (!requestBody || !requestBody.request) {
            logInfo('Playlist search validation failed: Missing request body')
            return res.status(400).json({
                status: 'error',
                message: ERROR_MESSAGES.MISSING_REQUEST_BODY,
            })
        }

        logInfo(`Playlist search initiated for orgId: ${requestBody.request.filters?.orgId || 'N/A'}`)

        // Make API call to playlist search service via Kong
        const response = await axios.post(
            API_END_POINTS.playlistSearch,
            requestBody,
            {
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    'Content-Type': 'application/json',
                    'x-authenticated-user-token': extractUserToken(req),
                },
            }
        )

        logInfo(`Playlist search successful: ${response.data?.result?.count || 0} results found`)

        // Return the response from the playlist service
        return res.status(response.status).json(response.data)

    } catch (error: any) {
        logError('Playlist search failed:', error)

        // Handle axios error responses
        if (error.response) {
            logError(`Playlist API error response: Status ${error.response.status}`)
            logError(`Playlist API error details: ${JSON.stringify(error.response.data)}`)
            return res.status(error.response.status).json(error.response.data)
        }

        // Handle other errors
        return res.status(500).json({
            status: 'error',
            message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        })
    }
})

// TODO: Add additional playlist endpoints (create, update, delete) following the same pattern
