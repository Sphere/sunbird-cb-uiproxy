import axios from 'axios'
import { Request, Response, Router } from 'express'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { extractUserToken } from '../utils/requestExtract'

// ---- API ENDPOINTS ----
// Using Kong API Gateway for playlist service routing
const API_END_POINTS = {
    playlistCreate: `${CONSTANTS.KONG_API_BASE}/playlist/v1/create`,
    playlistSearch: `${CONSTANTS.KONG_API_BASE}/playlist/v1/search`,
    playlistUpdate: `${CONSTANTS.KONG_API_BASE}/playlist/v1/update`,
}

// ---- ERROR MESSAGES ----
const ERROR_MESSAGES = {
    INTERNAL_SERVER_ERROR: 'Internal server error',
    INVALID_REQUEST: 'Invalid request body structure',
    MISSING_PLAYLIST_DATA: 'Missing playlist data in request',
    MISSING_PLAYLIST_ID: 'Missing playlist id for update',
    MISSING_REQUEST_BODY: 'Missing request body or request object',
}

// ---- HTTP HEADERS ----
const HEADERS = {
    CONTENT_TYPE: 'Content-Type',
    CONTENT_TYPE_JSON: 'application/json',
    USER_TOKEN: 'x-authenticated-user-token',
}

export const playlistApi = Router()

// sonar-cleanup: extracted from playlist.ts's repeated per-route catch blocks — same upstream-error-forward + 500-fallback shape (Sonar duplication follow-up)
/**
 * Forwards the upstream error status/body when present, logging under
 * `label`; otherwise responds 500 with the generic internal-server-error
 * message. `/create` and `/update` additionally log an "unexpected error"
 * line on the fallback path that `/search` doesn't — preserved here via
 * `logUnexpected`, matching each route's original behavior exactly.
 *
 * @param res - the Express response to send the error on
 * @param error - the caught error, expected to optionally carry an axios-style `response`
 * @param label - text prefixed to the logged error messages (e.g. "Playlist search")
 * @param logUnexpected - whether to log the fallback-path error, matching /create and /update's original behavior
 */
// tslint:disable-next-line: no-any
function handlePlaylistError(res: Response, error: any, label: string, logUnexpected = true) {
    if (error?.response) {
        logError(`${label} API error response: Status ${error.response.status}`)
        logError(`${label} API error details: ${JSON.stringify(error.response.data)}`)
        return res.status(error.response.status).json(error.response.data)
    }

    if (logUnexpected) {
        logError(`${label} unexpected error: ${error}`)
    }
    return res.status(500).json({
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
        status: 'error',
    })
}

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
                message: ERROR_MESSAGES.MISSING_REQUEST_BODY,
                status: 'error',
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
                    [HEADERS.CONTENT_TYPE]: HEADERS.CONTENT_TYPE_JSON,
                    [HEADERS.USER_TOKEN]: extractUserToken(req),
                },
            }
        )

        logInfo(`Playlist search successful: ${response.data?.result?.count || 0} results found`)

        // Return the response from the playlist service
        return res.status(response.status).json(response.data)

    } catch (error) {
        return handlePlaylistError(res, error, 'Playlist', false)
    }
})

/**
 * POST /create
 * Create a new playlist
 *
 * Request Body:
 * {
 *   "request": {
 *     "playlist": {
 *       "playlistId": "string",
 *       "scope": {
 *         "orgId": "string",
 *         "role": ["string"],
 *         "state": ["string"],
 *         "district": ["string"],
 *         "language": "string"
 *       },
 *       "dataSource": {
 *         "type": "static",
 *         "payload": ["string"]
 *       }
 *     }
 *   }
 * }
 *
 * Response: Returns created playlist data from Kong API Gateway
 */
playlistApi.post('/create', async (req: Request, res: Response) => {
    try {
        const requestBody = req.body

        // Validate request structure
        if (!requestBody || !requestBody.request) {
            logInfo('Playlist create validation failed: Missing request body')
            return res.status(400).json({
                message: ERROR_MESSAGES.MISSING_REQUEST_BODY,
                status: 'error',
            })
        }

        // Validate playlist data exists
        if (!requestBody.request.playlist) {
            logInfo('Playlist create validation failed: Missing playlist data')
            return res.status(400).json({
                message: ERROR_MESSAGES.MISSING_PLAYLIST_DATA,
                status: 'error',
            })
        }

        const playlistData = requestBody.request.playlist
        logInfo(`Playlist create initiated for playlistId: ${playlistData.playlistId || 'N/A'}, orgId: ${playlistData.scope?.orgId || 'N/A'}`)

        // Make API call to playlist create service via Kong
        const response = await axios.post(
            API_END_POINTS.playlistCreate,
            requestBody,
            {
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    [HEADERS.CONTENT_TYPE]: HEADERS.CONTENT_TYPE_JSON,
                    [HEADERS.USER_TOKEN]: extractUserToken(req),
                },
            }
        )

        logInfo(`Playlist create successful for playlistId: ${playlistData.playlistId || 'N/A'}`)

        // Return the response from the playlist service
        return res.status(response.status).json(response.data)

    } catch (error) {
        return handlePlaylistError(res, error, 'Playlist create')
    }
})

/**
 * PUT /update
 * Update an existing playlist
 *
 * Request Body:
 * {
 *   "request": {
 *     "playlist": {
 *       "id": "string (UUID)",
 *       "playlistId": "string",
 *       "scope": {
 *         "orgId": "string",
 *         "role": ["string"],
 *         "state": ["string"],
 *         "district": ["string"],
 *         "language": "string"
 *       },
 *       "dataSource": {
 *         "type": "static",
 *         "payload": ["string"]
 *       }
 *     }
 *   }
 * }
 *
 * Response: Returns updated playlist data from Kong API Gateway
 */
playlistApi.put('/update', async (req: Request, res: Response) => {
    try {
        const requestBody = req.body

        // Validate request structure
        if (!requestBody || !requestBody.request) {
            logInfo('Playlist update validation failed: Missing request body')
            return res.status(400).json({
                message: ERROR_MESSAGES.MISSING_REQUEST_BODY,
                status: 'error',
            })
        }

        // Validate playlist data exists
        if (!requestBody.request.playlist) {
            logInfo('Playlist update validation failed: Missing playlist data')
            return res.status(400).json({
                message: ERROR_MESSAGES.MISSING_PLAYLIST_DATA,
                status: 'error',
            })
        }

        // Validate playlist id exists for update
        if (!requestBody.request.playlist.id) {
            logInfo('Playlist update validation failed: Missing playlist id')
            return res.status(400).json({
                message: ERROR_MESSAGES.MISSING_PLAYLIST_ID,
                status: 'error',
            })
        }

        const playlistData = requestBody.request.playlist
        logInfo(`Playlist update initiated for id: ${playlistData.id}, playlistId: ${playlistData.playlistId || 'N/A'}, orgId: ${playlistData.scope?.orgId || 'N/A'}`)

        // Make API call to playlist update service via Kong
        const response = await axios.put(
            API_END_POINTS.playlistUpdate,
            requestBody,
            {
                headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    [HEADERS.CONTENT_TYPE]: HEADERS.CONTENT_TYPE_JSON,
                    [HEADERS.USER_TOKEN]: extractUserToken(req),
                },
            }
        )

        logInfo(`Playlist update successful for id: ${playlistData.id}`)

        // Return the response from the playlist service
        return res.status(response.status).json(response.data)

    } catch (error) {
        return handlePlaylistError(res, error, 'Playlist update')
    }
})

// TODO: Add additional playlist endpoints (delete) following the same pattern
