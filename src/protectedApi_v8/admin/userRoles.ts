import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { logError } from '../../utils/logger'
import { ERROR } from '../../utils/message'
import { API_END_POINTS } from '../apiConstants'

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'
export const userRolesApi = Router()

userRolesApi.get('/getRolesDescription/:lang', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg')
    const langCode = req.params.lang
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios({
      ...axiosRequestConfig,
      headers: {
        langCode,
        rootOrg,
      },
      method: 'GET',
      url: `${API_END_POINTS.getRolesDescription}`,
    })
    res.send(response.data)
  } catch (err) {
    logError('GET ROLES DESCRIPTION V2 ERR -> ', err)
    res.status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

userRolesApi.get('/allRoles', async (req, res) => {
  try {
    const uuid = 'masteruser'
    const rootOrg = req.header('rootOrg')
    const response = await axios({
      ...axiosRequestConfig,
      headers: {
        rootOrg,
      },
      method: 'GET',
      url: `${API_END_POINTS.getRoles}/roles?userid=${uuid}`,
    })
    res.json(response.data || {})
  } catch (err) {
    logError('ERROR ON GET USER ROLES >', err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

userRolesApi.get('/:id', async (req, res) => {
  try {
    const id = req.params.id
    const rootOrg = req.header('rootOrg')
    const response = await axios({
      ...axiosRequestConfig,
      headers: {
        rootOrg,
      },
      method: 'GET',
      url: `${API_END_POINTS.getRoles}/roles?userid=${id}`,
    })
    res.json(response.data || {})
  } catch (err) {
    logError('ERROR ON GET USER ROLES >', err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

userRolesApi.patch('/', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg')
    const response = await axios({
      ...axiosRequestConfig,
      data: req.body,
      headers: {
        rootOrg,
      },
      method: 'PATCH',
      url: `${API_END_POINTS.updateRoles}`,
    })
    res.json(response.data || {})
  } catch (err) {
    logError('ERROR ON UPDATE USER ROLES >', err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})
