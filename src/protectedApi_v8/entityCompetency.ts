import axios from 'axios'
import { Response, Router } from 'express'
import _ from 'lodash'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { appendPilotMockEntity } from '../utils/pilotMockEntity'
import { extractUserToken } from '../utils/requestExtract'
const API_END_POINTS = {
  ADD_ENTITIIES: `${CONSTANTS.ENTITY_API_BASE}/addEntities`,
  ADD_ENTITY_RELATION: `${CONSTANTS.ENTITY_API_BASE}/addEntityRelation`,
  ADD_UPDATE_ENTITY: `${CONSTANTS.ENTITY_API_BASE}/addUpdateEntity`,
  GET_ALL_ENTITY: `${CONSTANTS.ENTITY_API_BASE}/getAllEntity`,
  GET_ENTITY_BY_ID: `${CONSTANTS.ENTITY_API_BASE}/getEntityById/`,
  REVIEW_ENTITIIES: `${CONSTANTS.ENTITY_API_BASE}/reviewEntity`,
}
const ENTITY_UPDATE_FAIL = "Sorry ! couldn't update entity."
const GET_ENTITY_BY_ID_FAIL =
  "Sorry ! couldn't get entity for the respective ID."
const GET_ALL_ENTITY_FAIL = "Sorry ! couldn't get all the entity"
const ADD_ENTITY_FAIL = "Sorry ! couldn't ADD the entity"
const REVIEW_ENTITY_FAIL = "Sorry ! couldn't review the entity"

export const entityCompetencyApi = Router()
// tslint:disable-next-line: no-any
const headers = (req: any) => {
  return {
    'Content-Type': 'application/json',
    'x-authenticated-user-token': extractUserToken(req),
  }
}
// sonar-cleanup: extracted from entityCompetency.ts's repeated per-route catch blocks — same 500 + {message, status:'failed'} shape (Sonar duplication follow-up)
/**
 * Logs the error under `label`, then responds 500 with a failed-status body
 * carrying `message`.
 *
 * @param res - the Express response to send the error on
 * @param error - the caught error, logged verbatim
 * @param label - text prefixed to the logged error message
 * @param message - the route-specific failure message sent in the response body
 */
// tslint:disable-next-line: no-any
function handleEntityCompetencyError(res: Response, error: any, label: string, message: string) {
  logError(`Error in ${label}  >>>>>>` + error)
  res.status(500).send({
    message,
    status: 'failed',
  })
}

entityCompetencyApi.post('/addUpdateEntity', async (req, res) => {
  try {
    const response = await axios({
      data: req.body,
      headers: headers(req),
      method: 'POST',
      url: API_END_POINTS.ADD_UPDATE_ENTITY,
    })
    logInfo('Check re body of addUpdateEntity>> ' + req.body)
    res.status(response.data.responseCode).send(response.data)
  } catch (error) {
    handleEntityCompetencyError(res, error, 'ADD_UPDATE_ENTITY', ENTITY_UPDATE_FAIL)
  }
})

entityCompetencyApi.post('/addEntityRelation', async (req, res) => {
  try {
    const response = await axios({
      data: req.body,
      headers: headers(req),
      method: 'POST',
      url: API_END_POINTS.ADD_ENTITY_RELATION,
    })
    logInfo('Check req body of addEntityRelation>> ' + req.body)
    res.status(response.data.responseCode).send(response.data)
  } catch (error) {
    handleEntityCompetencyError(res, error, 'ADD_ENTITY_RELATION', ENTITY_UPDATE_FAIL)
  }
})
entityCompetencyApi.post('/getEntityById/:id', async (req, res) => {
  try {
    const response = await axios({
      data: req.body,
      headers: headers(req),
      method: 'POST',
      url: `${API_END_POINTS.GET_ENTITY_BY_ID}+${req.params.id}`,
    })
    logInfo('Check req body of getEntityByID >> ' + req.body)
    res.status(response.data.responseCode).send(response.data)
  } catch (error) {
    handleEntityCompetencyError(res, error, 'getEntityById', GET_ENTITY_BY_ID_FAIL)
  }
})
entityCompetencyApi.post('/getAllEntity', async (req, res) => {
  try {
    const response = await axios({
      data: req.body,
      headers: headers(req),
      method: 'POST',
      url: API_END_POINTS.GET_ALL_ENTITY,
    })
    logInfo('Check req body of getAllEntity >> ' + req.body)
    // PILOT DEMO ADD-ON: returns response.data untouched unless the pilot flag
    // is on. Remove this wrapper + its import to drop the add-on entirely.
    const payload = await appendPilotMockEntity(response.data, req.body)
    res.status(response.data.responseCode).send(payload)
  } catch (error) {
    handleEntityCompetencyError(res, error, 'GET_ALL_ENTITY', GET_ALL_ENTITY_FAIL)
  }
})
entityCompetencyApi.post('/addEntities', async (req, res) => {
  try {
    const response = await axios({
      data: req.body,
      headers: headers(req),
      method: 'POST',
      url: API_END_POINTS.ADD_ENTITIIES,
    })
    logInfo('Check req body of ADD ENTITY >> ' + req.body)
    res.status(response.data.responseCode).send(response.data)
  } catch (error) {
    handleEntityCompetencyError(res, error, 'add_ENTITY', ADD_ENTITY_FAIL)
  }
})
entityCompetencyApi.post('/reviewEntity', async (req, res) => {
  try {
    const response = await axios({
      data: req.body,
      headers: headers(req),
      method: 'POST',
      url: API_END_POINTS.REVIEW_ENTITIIES,
    })
    logInfo('Check req body of EVIEW ENTITY >> ' + req.body)
    res.status(response.data.responseCode).send(response.data)
  } catch (error) {
    handleEntityCompetencyError(res, error, 'REVIEW_ENTITY', REVIEW_ENTITY_FAIL)
  }
})
