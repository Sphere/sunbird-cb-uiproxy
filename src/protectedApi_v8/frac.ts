/* eslint-disable */
import axios from 'axios'
import { Response, Router } from 'express'

import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { ERROR } from '../utils/message'

const API_END_POINTS = {
  addDataNode: `${CONSTANTS.FRAC_API_BASE}/fracapis/frac/addDataNode`,
  addDataNodeBulk: `${CONSTANTS.FRAC_API_BASE}/fracapis/frac/addDataNodeBulk`,
  getActivity: `${CONSTANTS.FRAC_API_BASE}/fracapis/frac/getAllNodes?type=ACTIVITY&status=VERIFIED`,
  getCompetencyArea: `${CONSTANTS.FRAC_API_BASE}/fracapis/frac/getAllNodes?type=COMPETENCYAREA`,
  getDictionary: `${CONSTANTS.FRAC_API_BASE}/fracapis/frac/getAllNodes?type=COMPETENCY&status=VERIFIED`,
  getNodeById: (id: string, type: string) =>
    `${CONSTANTS.FRAC_API_BASE}/fracapis/frac/getNodeById?id=${id}&type=${type}&isDetail=true`,
  getRole: `${CONSTANTS.FRAC_API_BASE}/fracapis/frac/getAllNodes?type=ROLE&status=VERIFIED`,
  searchNodes: `${CONSTANTS.FRAC_API_BASE}/fracapis/frac/searchNodes`,
}

export const fracApi = Router()
const unknownError = 'Failed due to unknown reason'

// sonar-cleanup: extracted from frac.ts's repeated per-route catch blocks — same status/body shape (Sonar duplication follow-up)
/**
 * Responds with the upstream status code (or 500) and the upstream error
 * body (or a fallback error message).
 *
 * @param res - the Express response to send the error on
 * @param err - the caught error, expected to optionally carry an axios-style `response`
 * @param message - the fallback error message; defaults to the generic unknown-reason string
 */
// tslint:disable-next-line: no-any
function handleFracError(res: Response, err: any, message: string = unknownError) {
  res.status((err && err.response && err.response.status) || 500).send(
    (err && err.response && err.response.data) || {
      error: message,
    }
  )
}

fracApi.get('/getAllNodes/:type', async (req, res) => {
  try {
    const type = req.params.type
    let apiEndPoint = ''
    switch (type) {
      case 'dictionary':
        apiEndPoint = API_END_POINTS.getDictionary
        break
      case 'competencyarea':
        apiEndPoint = API_END_POINTS.getCompetencyArea
        break
      case 'role':
        apiEndPoint = API_END_POINTS.getRole
        break
      case 'activity':
        apiEndPoint = API_END_POINTS.getActivity
        break
      default:
        res.status(400).send('TYPE_IS_NOT_PROVIDED_OR_TYPE_IS_NOT_CONFIGURED')
        break
    }
    const response = await axios.get(apiEndPoint, {
      ...axiosRequestConfig,
      headers: {
        Authorization: req.header('Authorization'),
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleFracError(res, err)
  }
})

fracApi.post('/addDataNode', async (req, res) => {
  try {
    const response = await axios.post(API_END_POINTS.addDataNode, req.body, {
      ...axiosRequestConfig,
      headers: {
        Authorization: req.header('Authorization'),
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleFracError(res, err)
  }
})

fracApi.post('/addDataNodeBulk', async (req, res) => {
  try {
    const response = await axios.post(
      API_END_POINTS.addDataNodeBulk,
      req.body,
      {
        ...axiosRequestConfig,
        headers: {
          Authorization: req.header('Authorization'),
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    handleFracError(res, err)
  }
})

fracApi.post('/searchNodes', async (req, res) => {
  try {
    const response = await axios.post(API_END_POINTS.searchNodes, req.body, {
      ...axiosRequestConfig,
      headers: {
        Authorization: req.header('Authorization'),
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleFracError(res, err)
  }
})

fracApi.get('/getNodeById/:id/:type', async (req, res) => {
  try {
    const id = req.params.id
    const type = req.params.type
    const response = await axios.get(API_END_POINTS.getNodeById(id, type), {
      ...axiosRequestConfig,
      headers: {
        Authorization: req.header('Authorization'),
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleFracError(res, err)
  }
})
/* eslint-disable no-use-before-define */
fracApi.get('/:type/:key', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg')
    const authToken = req.header('Authorization')
    if (!rootOrg || !authToken) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const key = req.params.key
    const type = req.params.type
    const searchBody = {
      childCount: true,
      childNodes: true,
      searches: [
        {
          field: 'name',
          keyword: key,
          type,
        },
        {
          field: 'status',
          keyword: 'VERIFIED',
          type,
        },
      ],
    }
    logInfo('Req body========>', JSON.stringify(searchBody))
    const response = await axios.post(API_END_POINTS.searchNodes, searchBody, {
      ...axiosRequestConfig,
      headers: {
        Authorization: req.header('Authorization'),
      },
    })
    res.status(200).send(response.data)
  } catch (err) {
    logError('ERROR --> ', err)
    handleFracError(res, err, ERROR.GENERAL_ERR_MSG)
  }
})
