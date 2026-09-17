import axios from 'axios'
import { Response, Router } from 'express'
import * as _ from 'lodash'
import { axiosRequestConfig } from '../configs/request.config'
// sonar-cleanup: 5 GET-route bodies replaced with the shared helper (CHANGE 33)
import { fetchConnectionsList } from '../utils/connectionsListFetch'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractUserId, extractUserIdFromRequest, extractUserToken } from '../utils/requestExtract'
import { API_END_POINTS } from './apiConstants'
const unknown = 'Connections Apis:- Failed due to unknown reason'

/**
 * Logs the error under `label`, then responds with the upstream status
 * code (or 500) and the upstream error body (or a generic error message).
 *
 * @param res - the Express response to send the error on
 * @param err - the caught error, expected to optionally carry an axios-style `response`
 * @param label - text prefixed to the logged error message
 */
// tslint:disable-next-line: no-any
function handleConnectionsError(res: Response, err: any, label: string) {
  logError(label, err)
  res.status((err && err.response && err.response.status) || 500).send(
    (err && err.response && err.response.data) || {
      error: unknown,
    }
  )
}

export const connectionsV2Api = Router()

connectionsV2Api.get('/v2/connections/requested', async (req, res) => {
  try {
    await fetchConnectionsList(req, res, API_END_POINTS.getConnectionRequestsData, extractUserIdFromRequest(req))
  } catch (err) {
    handleConnectionsError(res, err, 'CONNECTIONS REQUESTS ERROR> ')
  }
})

connectionsV2Api.get('/v2/connections/requests/received', async (req, res) => {
  try {
    await fetchConnectionsList(
      req,
      res,
      API_END_POINTS.getConnectionRequestsReceivedData,
      extractUserIdFromRequest(req)
    )
  } catch (err) {
    handleConnectionsError(res, err, 'CONNECTIONS REQUESTS ERROR> ')
  }
})

connectionsV2Api.get('/v2/connections/established', async (req, res) => {
  try {
    await fetchConnectionsList(req, res, API_END_POINTS.getConnectionEstablishedData, extractUserIdFromRequest(req))
  } catch (err) {
    handleConnectionsError(res, err, 'CONNECTIONS ERROR')
  }
})

connectionsV2Api.get('/v2/connections/established/:id', async (req, res) => {
  try {
    await fetchConnectionsList(req, res, API_END_POINTS.getConnectionEstablishedData, req.params.id)
  } catch (err) {
    handleConnectionsError(res, err, 'CONNECTIONS ERROR')
  }
})

connectionsV2Api.get('/v2/connections/suggests', async (req, res) => {
  try {
    await fetchConnectionsList(req, res, API_END_POINTS.getConnectionSuggestsData, extractUserId(req))
  } catch (err) {
    handleConnectionsError(res, err, 'SUGGESTS ERROR >')
  }
})

connectionsV2Api.post('/v2/add/connection', async (req, res) => {
  try {
    const rootOrg = req.header('rootorg')
    const userIdFrom = extractUserIdFromRequest(req)
    const userNameFrom = req.body.userNameFrom
    const userDepartmentFrom = req.body.userDepartmentFrom
    const userIdTo = req.body.userIdTo
    const userNameTo = req.body.userNameTo
    const userDepartmentTo = req.body.userDepartmentTo

    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    if (!userIdFrom || !userIdTo || !userNameFrom || !userDepartmentFrom || !userNameTo || !userDepartmentTo) {
      res.status(400).send(ERROR.GENERAL_ERR_MSG)
      return
    }

    const body = {
      userDepartmentFrom,
      userIdFrom,
      userNameFrom,

      userDepartmentTo,
      userIdTo,
      userNameTo,

    }
    const response = await axios.post(
      API_END_POINTS.postConnectionAddData,
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
    handleConnectionsError(res, err, 'ADD CONNECTION ERROR > ')
  }
})

connectionsV2Api.post('/v2/update/connection', async (req, res) => {
  try {
    const rootOrg = req.header('rootorg')
    const userNameFrom = req.body.userNameFrom
    const userDepartmentFrom = req.body.userDepartmentFrom
    const userIdFrom = extractUserIdFromRequest(req)

    const userNameTo = req.body.userNameTo
    const userDepartmentTo = req.body.userDepartmentTo
    const userIdTo = req.body.userIdTo

    const status = req.body.status

    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    if (!userIdFrom || !userIdTo || !userNameFrom || !userDepartmentFrom || !userNameTo || !userDepartmentTo || !status) {
      res.status(400).send(ERROR.GENERAL_ERR_MSG)
      return
    }
    const body = {
      status,

      userDepartmentFrom,
      userIdFrom,
      userNameFrom,

      userDepartmentTo,
      userIdTo,
      userNameTo,
    }
    const response = await axios.post(
      API_END_POINTS.postConnectionUpdateData,
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
    handleConnectionsError(res, err, 'UPDATE CONNECTION ERROR > ')
  }
})

connectionsV2Api.post('/v2/connections/recommended', async (req, res) => {
  try {
    const body = req.body
    const rootOrg = req.header('rootorg')
    const userId = extractUserId(req)

    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    if (!userId) {
      res.status(400).send(ERROR.GENERAL_ERR_MSG)
      return
    }

    const response = await axios.post(
      API_END_POINTS.postConnectionRecommendationData,
      body,
      {
        ...axiosRequestConfig,
        headers: {
          Authorization: CONSTANTS.SB_API_KEY,
          rootOrg,
          userId,
           // tslint:disable-next-line: all
           'x-authenticated-user-token': extractUserToken(req),
        },
      }
    )
    res.send(response.data)

  } catch (err) {
    handleConnectionsError(res, err, 'RECOMMENDED ERROR > ')
  }
})

connectionsV2Api.post('/v2/connections/recommended/userDepartment', async (req, res) => {
  try {
    let usrDept = ''
    // tslint:disable-next-line: no-any
    const userDepartment: any = []
    const rootOrg = req.header('rootorg')
    const userId = extractUserId(req)
    if (!rootOrg) {
        res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
        return
    }
    if (!userId) {
        res.status(400).send(ERROR.GENERAL_ERR_MSG)
        return
    }

    /**
     * @author: Suvajit
     * Step 1: Gets the User Department using search api
     * Step 2: Loops through and gets all the dept
     * Step 3: Send the data to recommandation api
     */

    const body = {
        request : {
            filters : {
                userId,
            },
            query: '',
        },
    }
    const url = `${API_END_POINTS.kongUserSearch}`
    const responseDetails = await axios.post(
        url,
        body,
        {
            ...axiosRequestConfig,
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                'Content-Type': 'application/json',
                'X-Authenticated-User-Token': extractUserToken(req),
            },
        }
    )
    logInfo('responseDetails from /search/ : ', JSON.stringify(responseDetails.data))

    // tslint:disable-next-line: no-any
    const orgData: any = []
    const contentData = responseDetails.data.result.response.content
    // tslint:disable-next-line: no-any
    contentData.forEach((content: any) => {
        const orgs = content.organisations
        // tslint:disable-next-line: no-any
        orgs.forEach((org: any) => {
            orgData.push(org)
        })
    })
    if (_.isEmpty(orgData)) {
        res.status(400).send(ERROR.ERROR_NO_DEPT_DATA)
        return
    }

    // tslint:disable-next-line: no-any
    orgData.forEach((element: any) => {
        userDepartment.push(element.orgName)
    })

    usrDept = userDepartment || 'igot'

    const reqtoApi = {
      offset: 0,
      search: [
        {
          field: 'employmentDetails.departmentName',
          values: usrDept,
        },
      ],
      size: 5,
    }

    const response = await axios.post(
      API_END_POINTS.postConnectionRecommendationData,
      reqtoApi,
      {
        ...axiosRequestConfig,
        headers: {
          Authorization: CONSTANTS.SB_API_KEY,
          rootOrg,
          userId,
           // tslint:disable-next-line: all
           'x-authenticated-user-token': extractUserToken(req),
        },
      }
    )
    res.send(response.data)

  } catch (err) {
    handleConnectionsError(res, err, 'RECOMMENDED ERROR > ')
  }
})
