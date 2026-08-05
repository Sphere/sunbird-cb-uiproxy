import axios from 'axios'
import { Response, Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { CONSTANTS } from '../../utils/env'
import { logError } from '../../utils/logger'
import { extractUserIdFromRequest } from '../../utils/requestExtract'

const API_ENDPOINTS = {
  conceptData: `${CONSTANTS.VIEWER_PLUGIN_RDBMS_API_BASE}/v1/db/conceptdata/resources`,
  execute: `${CONSTANTS.VIEWER_PLUGIN_RDBMS_API_BASE}/v1/users`,
}

const GENERAL_ERR_MSG = 'Failed due to unknown reason'

/**
 * Logs the error under `label`, then responds with the upstream status code
 * (or 500) and the upstream error body (or a generic error message).
 *
 * @param res - the Express response to send the error on
 * @param err - the caught error, expected to optionally carry an axios-style `response`
 * @param label - text prefixed to the logged error message
 */
// tslint:disable-next-line: no-any
function handleRdbmsError(res: Response, err: any, label: string) {
  logError(label, err)
  res.status((err && err.response && err.response.status) || 500)
    .send((err && err.response && err.response.data) || {
      error: GENERAL_ERR_MSG,
    })
}

export const rdbmsApi = Router()

rdbmsApi.get('/initializeDb/:contentId', async (req, res) => {
  try {
    const uuid = extractUserIdFromRequest(req)
    const contentId = req.params.contentId
    const response = await axios.get(
      `${API_ENDPOINTS.execute}/${uuid}/resources/${contentId}/initialize`,
      axiosRequestConfig
    )
    res.send(response.data)
  } catch (err) {
    handleRdbmsError(res, err, 'INITIALIZE DB ERROR -> ')
  }
})

rdbmsApi.get('/conceptData/:contentId', async (req, res) => {
  try {
    const contentId = req.params.contentId
    const response = await axios.get(
      `${API_ENDPOINTS.conceptData}/${contentId}`,
      axiosRequestConfig
    )
    res.json(response.data)
  } catch (err) {
    handleRdbmsError(res, err, 'GET RDBMS CONCEPT DATA ERR -> ')
  }
})

rdbmsApi.get('/expectedOutput/:contentId', async (req, res) => {
  try {
    const uuid = extractUserIdFromRequest(req)
    const contentId = req.params.contentId
    const response = await axios.get(
      `${API_ENDPOINTS.execute}/${uuid}/resources/${contentId}`,
      axiosRequestConfig
    )
    res.json(response.data)
  } catch (err) {
    handleRdbmsError(res, err, 'GET EXPECTED OUTPUT ERR -> ')
  }
})

rdbmsApi.get('/dbstructure/:contentId', async (req, res) => {
  try {
    const uuid = extractUserIdFromRequest(req)
    const contentId = req.params.contentId
    const response = await axios.get(
      `${API_ENDPOINTS.execute}/${uuid}/resources/${contentId}/tabledata`,
      axiosRequestConfig
    )
    res.json(response.data)
  } catch (err) {
    handleRdbmsError(res, err, 'GET DB STRUCTURE ERR -> ')
  }
})

rdbmsApi.get('/tableRefresh/:contentId', async (req, res) => {
  try {
    const uuid = extractUserIdFromRequest(req)
    const contentId = req.params.contentId
    const response = await axios.get(
      `${API_ENDPOINTS.execute}/${uuid}/resources/${contentId}/tableinfo`,
      axiosRequestConfig
    )
    res.json(response.data)
  } catch (err) {
    handleRdbmsError(res, err, 'TABLE REFRESH ERR -> ')
  }
})

rdbmsApi.post('/executeQuery', async (req, res) => {
  try {
    const uuid = extractUserIdFromRequest(req)
    const response = await axios.post(
      `${API_ENDPOINTS.execute}/${uuid}/query/execute`,
      {
        ...req.body,
      },
      axiosRequestConfig
    )
    res.json(response.data)
  } catch (err) {
    handleRdbmsError(res, err, 'EXECUTE QUERY ERR -> ')
  }
})

rdbmsApi.post('/compareQuery', async (req, res) => {
  try {
    const uuid = extractUserIdFromRequest(req)
    const response = await axios.post(
      `${API_ENDPOINTS.execute}/${uuid}/querycompareexecute`,
      {
        ...req.body,
      },
      axiosRequestConfig
    )
    res.json(response.data)
  } catch (err) {
    handleRdbmsError(res, err, 'COMPARE QUERY ERR -> ')
  }
})

rdbmsApi.post('/playground', async (req, res) => {
  try {
    const uuid = extractUserIdFromRequest(req)
    const response = await axios.post(
      `${API_ENDPOINTS.execute}/${uuid}/query/playground`,
      {
        ...req.body,
      },
      axiosRequestConfig
    )
    res.json(response.data)
  } catch (err) {
    handleRdbmsError(res, err, 'PLAYGROUND ERR -> ')
  }
})

rdbmsApi.post('/compositeQuery/:type', async (req, res) => {
  try {
    const uuid = extractUserIdFromRequest(req)
    const type = req.params.type
    const response = await axios.post(
      `${API_ENDPOINTS.execute}/${uuid}/query/composite?type=${type}`,
      {
        ...req.body,
      },
      axiosRequestConfig
    )
    res.json(response.data)
  } catch (err) {
    handleRdbmsError(res, err, 'COMPOSITE QUERY ERR -> ')
  }
})

rdbmsApi.post('/verifyExercise/:contentId', async (req, res) => {
  try {
    const uuid = extractUserIdFromRequest(req)
    const contentId = req.params.contentId
    const response = await axios.post(
      `${API_ENDPOINTS.execute}/${uuid}/resources/${contentId}?type=verify`,
      {
        ...req.body,
      },
      axiosRequestConfig
    )
    res.json(response.data)
  } catch (err) {
    handleRdbmsError(res, err, 'VERIFY EXERCISE ERR -> ')
  }
})

rdbmsApi.post('/submitExercise/:contentId', async (req, res) => {
  try {
    const uuid = extractUserIdFromRequest(req)
    const contentId = req.params.contentId
    const response = await axios.post(
      `${API_ENDPOINTS.execute}/${uuid}/resources/${contentId}?type=submit`,
      {
        ...req.body,
      },
      axiosRequestConfig
    )
    res.json(response.data)
  } catch (err) {
    handleRdbmsError(res, err, 'SUBMIT EXERCISE ERR -> ')
  }
})
