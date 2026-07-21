import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { logError, logInfo } from '../utils/logger'
import { extractUserToken } from '../utils/requestExtract'
import { API_END_POINTS } from './apiConstants'
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
entityCompetencyApi.post('/addUpdateEntity', async (req, res) => {
  try {
    const response = await axios({
      data: req.body,
      headers: headers(req),
      method: 'POST',
      url: API_END_POINTS.addUpdateEntity,
    })
    logInfo('Check re body of addUpdateEntity>> ' + req.body)
    res.status(response.data.responseCode).send(response.data)
  } catch (error) {
    logError('Error in ADD_UPDATE_ENTITY  >>>>>>' + error)
    res.status(500).send({
      message: ENTITY_UPDATE_FAIL,
      status: 'failed',
    })
  }
})

entityCompetencyApi.post('/addEntityRelation', async (req, res) => {
  try {
    const response = await axios({
      data: req.body,
      headers: headers(req),
      method: 'POST',
      url: API_END_POINTS.addEntityRelation,
    })
    logInfo('Check req body of addEntityRelation>> ' + req.body)
    res.status(response.data.responseCode).send(response.data)
  } catch (error) {
    logError('Error in ADD_ENTITY_RELATION  >>>>>>' + error)
    res.status(500).send({
      message: ENTITY_UPDATE_FAIL,
      status: 'failed',
    })
  }
})
entityCompetencyApi.post('/getEntityById/:id', async (req, res) => {
  try {
    const response = await axios({
      data: req.body,
      headers: headers(req),
      method: 'POST',
      url: `${API_END_POINTS.getEntityById}+${req.params.id}`,
    })
    logInfo('Check req body of getEntityByID >> ' + req.body)
    res.status(response.data.responseCode).send(response.data)
  } catch (error) {
    logError('Error in getEntityById  >>>>>>' + error)
    res.status(500).send({
      message: GET_ENTITY_BY_ID_FAIL,
      status: 'failed',
    })
  }
})
entityCompetencyApi.post('/getAllEntity', async (req, res) => {
  try {
    const response = await axios({
      data: req.body,
      headers: headers(req),
      method: 'POST',
      url: API_END_POINTS.getAllEntity,
    })
    logInfo('Check req body of getAllEntity >> ' + req.body)
    res.status(response.data.responseCode).send(response.data)
  } catch (error) {
    logError('Error in GET_ALL_ENTITY  >>>>>>' + error)
    res.status(500).send({
      message: GET_ALL_ENTITY_FAIL,
      status: 'failed',
    })
  }
})
entityCompetencyApi.post('/addEntities', async (req, res) => {
  try {
    const response = await axios({
      data: req.body,
      headers: headers(req),
      method: 'POST',
      url: API_END_POINTS.addEntities,
    })
    logInfo('Check req body of ADD ENTITY >> ' + req.body)
    res.status(response.data.responseCode).send(response.data)
  } catch (error) {
    logError('Error in add_ENTITY  >>>>>>' + error)
    res.status(500).send({
      message: ADD_ENTITY_FAIL,
      status: 'failed',
    })
  }
})
entityCompetencyApi.post('/reviewEntity', async (req, res) => {
  try {
    const response = await axios({
      data: req.body,
      headers: headers(req),
      method: 'POST',
      url: API_END_POINTS.reviewEntity,
    })
    logInfo('Check req body of EVIEW ENTITY >> ' + req.body)
    res.status(response.data.responseCode).send(response.data)
  } catch (error) {
    // tslint:disable-next-line: no-any
    logError('Error in REVIEW_ENTITY  >>>>>>' + error)
    res.status(500).send({
      message: REVIEW_ENTITY_FAIL,
      status: 'failed',
    })
  }
})
