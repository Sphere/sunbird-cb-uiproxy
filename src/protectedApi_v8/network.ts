import axios from 'axios'
import { Response, Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
// sonar-cleanup: 5 GET-route bodies replaced with the shared helper (CHANGE 33)
import { fetchConnectionsList } from '../utils/connectionsListFetch'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractUserIdFromRequest } from '../utils/requestExtract'
import { extractUserToken } from '../utils/requestExtract'

const unknown = 'Network Apis:- Failed due to unknown reason'

// sonar-cleanup: extracted from this file's 9 identical inline catch blocks
// (CHANGE 33), matching connections_v2.ts's handleConnectionsError
// (CHANGE 17) pattern exactly — kept file-local since each file's catch
// handler carries its own `unknown` message text.
/**
 * Logs the error under `label`, then responds with the upstream status
 * code (or 500) and the upstream error body (or a generic error message).
 *
 * @param res - the Express response to send the error on
 * @param err - the caught error, expected to optionally carry an axios-style `response`
 * @param label - text prefixed to the logged error message
 */
// tslint:disable-next-line: no-any
function handleNetworkError(res: Response, err: any, label: string) {
  logError(label, err)
  res.status((err && err.response && err.response.status) || 500).send(
    (err && err.response && err.response.data) || {
      error: unknown,
    }
  )
}
const apiEndpoints = {
  detail: `${CONSTANTS.USER_PROFILE_API_BASE}/user/multi-fetch/wid`,
  getConnectionEstablishedData: `${CONSTANTS.KONG_API_BASE}/connections/profile/fetch/established`,
  getConnectionRequestsData: `${CONSTANTS.KONG_API_BASE}/connections/profile/fetch/requested`,
  getConnectionRequestsReceivedData: `${CONSTANTS.KONG_API_BASE}/connections/profile/fetch/requests/received`,
  getConnectionSuggestsData: `${CONSTANTS.KONG_API_BASE}/connections/profile/find/suggests`,
  postConnectionAddData: `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/connections/add`,
  postConnectionRecommendationData: `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/connections/profile/find/recommended`,
  postConnectionUpdateData: `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/connections/update`,

}

export const networkConnectionApi = Router()

networkConnectionApi.get('/connections/requested', async (req, res) => {
  try {
    await fetchConnectionsList(req, res, apiEndpoints.getConnectionRequestsData, extractUserIdFromRequest(req))
  } catch (err) {
    handleNetworkError(res, err, 'CONNECTIONS REQUESTS ERROR> ')
  }
})

networkConnectionApi.get('/connections/requests/received', async (req, res) => {
  try {
    await fetchConnectionsList(
      req,
      res,
      apiEndpoints.getConnectionRequestsReceivedData,
      extractUserIdFromRequest(req)
    )
  } catch (err) {
    handleNetworkError(res, err, 'CONNECTIONS REQUESTS ERROR> ')
  }
})

networkConnectionApi.get('/connections/established', async (req, res) => {
  try {
    await fetchConnectionsList(req, res, apiEndpoints.getConnectionEstablishedData, extractUserIdFromRequest(req))
  } catch (err) {
    handleNetworkError(res, err, 'CONNECTIONS ERROR')
  }
})

networkConnectionApi.get('/connections/established/:id', async (req, res) => {
  try {
    await fetchConnectionsList(req, res, apiEndpoints.getConnectionEstablishedData, req.params.id)
  } catch (err) {
    handleNetworkError(res, err, 'CONNECTIONS ERROR')
  }
})

networkConnectionApi.get('/connections/suggests', async (req, res) => {
  try {
    await fetchConnectionsList(req, res, apiEndpoints.getConnectionSuggestsData, extractUserIdFromRequest(req))
  } catch (err) {
    handleNetworkError(res, err, 'SUGGESTS ERROR >')
  }
})

networkConnectionApi.post('/add/connection', async (req, res) => {
  try {
    const rootOrg = req.header('rootorg')
    const connectionId = req.body.connectionId
    const userId = extractUserIdFromRequest(req)

    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    if (!userId || !connectionId) {
      res.status(400).send(ERROR.GENERAL_ERR_MSG)
      return
    }

    const body = {
      connectionId,
      userId,
    }
    const response = await axios.post(
      apiEndpoints.postConnectionAddData,
      body,
      {
        ...axiosRequestConfig,
        headers: {
          Authorization: CONSTANTS.SB_API_KEY,
          rootOrg,
            // tslint:disable-next-line: all
            'x-authenticated-user-token': extractUserToken(req),
        },
      }
    )
    res.send(response.data)

  } catch (err) {
    handleNetworkError(res, err, 'ADD CONNECTION ERROR > ')
  }
})

networkConnectionApi.post('/update/connection', async (req, res) => {
  try {
    const rootOrg = req.header('rootorg')
    const connectionId = req.body.connectionId
    const userId = extractUserIdFromRequest(req)
    const status = req.body.status

    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    if (!userId || !connectionId || !status) {
      res.status(400).send(ERROR.GENERAL_ERR_MSG)
      return
    }
    const body = {
      connectionId: userId,
      status,
      userId: connectionId,
    }
    const response = await axios.post(
      apiEndpoints.postConnectionUpdateData,
      body,
      {
        ...axiosRequestConfig,
        headers: {
          Authorization: CONSTANTS.SB_API_KEY,
          rootOrg,
          // tslint:disable-next-line: all
          'x-authenticated-user-token': extractUserToken(req),
        },
      }
    )
    res.send(response.data)

  } catch (err) {
    handleNetworkError(res, err, 'UPDATE CONNECTION ERROR > ')
  }
})

networkConnectionApi.post('/connections/recommended', async (req, res) => {
  try {
    const body = req.body
    const rootOrg = req.header('rootorg')
    const userId = extractUserIdFromRequest(req)

    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    if (!userId) {
      res.status(400).send(ERROR.GENERAL_ERR_MSG)
      return
    }

    const response = await axios.post(
      apiEndpoints.postConnectionRecommendationData,
      body,
      {
        ...axiosRequestConfig,
        headers: {
          rootOrg,
          userId,
        },
      }
    )
    res.send(response.data)

  } catch (err) {
    handleNetworkError(res, err, 'RECOMMENDED ERROR > ')
  }
})

networkConnectionApi.post('/connections/recommended/userDepartment', async (req, res) => {
  try {
    let usrDept = ''
    let userDepartment = ''
    const rootOrg = req.header('rootorg')
    const userId = extractUserIdFromRequest(req)
    const url = `${apiEndpoints.detail}`
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    if (!userId) {
      res.status(400).send(ERROR.GENERAL_ERR_MSG)
      return
    }
    const responseDetails = await axios.post(
      url,
      {
        conditions: {
          root_org: rootOrg,
        },
        source_fields: ['wid', 'email', 'first_name', 'last_name', 'department_name'],
        values: [userId],
      },
      {
        ...axiosRequestConfig,
        headers: { rootOrg },
      }
      )
    logInfo('responseDetails from /detailsv1 : ', responseDetails.data)
    if (responseDetails && responseDetails.data && responseDetails.data.length) {
      userDepartment =  responseDetails.data[0].department_name
    }
    usrDept = userDepartment || 'igot'

    const reqtoApi = {
      offset: 0,
      search: [
        {
          field: 'employmentDetails.departmentName',
          values: [usrDept],
        },
      ],
      size: 5,
    }

    const response = await axios.post(
      apiEndpoints.postConnectionRecommendationData,
      reqtoApi,
      {
        ...axiosRequestConfig,
        headers: {
          rootOrg,
          userId,
        },
      }
    )
    res.send(response.data)

  } catch (err) {
    handleNetworkError(res, err, 'RECOMMENDED ERROR > ')
  }
})
