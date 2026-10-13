/* eslint-disable */
import axios from 'axios'
import express from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { logError } from '../utils/logger'
import { extractAuthorizationFromRequest } from '../utils/requestExtract'
import { API_END_POINTS } from './apiConstants'

export const portalApi = express.Router()

const unknownError = 'Failed due to unknown reason'
const failedToProcess = 'Failed to process the request.'
const badRequest = 'Bad request. UserId is a mandatory header'
const spvPortal = 'spv'
const mdoPortal = 'mdo'
const cbpPortal = 'cbp'
const cbcPortal = 'cbc'
const cbcDeptPath = '/cbc/department'
const spvDeleteDepartment = '/spv/deleteDepartment'
const spvDeptPath = '/spv/department'
const spvDeptPathAction = '/spv/deptAction/userrole'
const departmentType = '/departmentType'

portalApi.get('/listDeptNames', async (req, res) => {
  try {
    const response = await axios.get(API_END_POINTS.getDeptNameList, {
      ...axiosRequestConfig,
      headers: req.headers,
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + req.originalUrl + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})

portalApi.get('/spv/mydepartment', async (req, res) => {
  try {
    let isUserInfoRequired = req.query.allUsers as unknown as boolean
    if (!isUserInfoRequired) {
      isUserInfoRequired = false
    }
    const response = await axios.get(
      API_END_POINTS.myDeptApi(spvPortal, isUserInfoRequired),
      {
        ...axiosRequestConfig,
        headers: req.headers,
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + req.originalUrl + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})

portalApi.get(spvDeptPath, async (req, res) => {
  try {
    const userId = req.headers.wid as string
    if (!userId) {
      res.status(400).send(badRequest)
      return
    }
    const response = await axios.get(API_END_POINTS.deptApi(spvPortal), {
      ...axiosRequestConfig,
      headers: req.headers,
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})

portalApi.get(spvDeptPath + '/:deptId', async (req, res) => {
  try {
    const userId = req.headers.wid as string
    const deptId = req.params.deptId
    let isUserInfoRequired = req.query.allUsers as unknown as boolean
    if (!isUserInfoRequired) {
      isUserInfoRequired = false
    }
    if (!userId || !deptId) {
      res.status(400).send(badRequest)
      return
    }
    const response = await axios.get(
      API_END_POINTS.spvDeptByIdApi(deptId, isUserInfoRequired),
      {
        ...axiosRequestConfig,
        headers: req.headers,
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})

portalApi.post(spvDeptPath, async (req, res) => {
  try {
    const userId = req.headers.wid as string
    if (!userId) {
      res.status(400).send(badRequest)
      return
    }
    const rootOrgValue = req.headers.rootorg
    const authorization = extractAuthorizationFromRequest(req)
    const xAuth = authorization.split(' ')
    const response = await axios.post(
      API_END_POINTS.deptApi(spvPortal),
      req.body,
      {
        ...axiosRequestConfig,
        headers: {
          rootOrg: rootOrgValue,
          wid: userId,
          xAuthUser: xAuth[1],
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})

portalApi.delete(spvDeleteDepartment + '/:deptId', async (req, res) => {
  try {
    const userId = req.headers.wid
    const deptId = req.params.deptId
    let isUserInfoRequired = req.query.allUsers as boolean
    if (!isUserInfoRequired) {
      isUserInfoRequired = false
    }
    if (!userId || !deptId) {
      res.status(400).send(badRequest)
      return
    }
    const response = await axios.delete(
      API_END_POINTS.spvDeleteDepartmentApi(deptId),
      {
        ...axiosRequestConfig,
        headers: req.headers,
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})

portalApi.patch(spvDeptPath, async (req, res) => {
  updateDepartment(spvPortal, req, res)
})

portalApi.post(spvDeptPathAction, async (req, res) => {
  addUserRole(spvPortal, req, res)
})

portalApi.patch(spvDeptPathAction, async (req, res) => {
  updateUserRole(spvPortal, req, res)
})

// ------------------ MDO APIs ----------------------
portalApi.get('/mdo/mydepartment', async (req, res) => {
  getMyDepartment(mdoPortal, req, res)
})

portalApi.patch('/mdo/department', async (req, res) => {
  updateDepartment(mdoPortal, req, res)
})

portalApi.post('/mdo/deptAction/userrole', async (req, res) => {
  addUserRole(mdoPortal, req, res)
})

portalApi.patch('/mdo/deptAction/userrole', async (req, res) => {
  updateUserRole(mdoPortal, req, res)
})

// ------------------ CBP APIs ----------------------
portalApi.get('/cbp/mydepartment', async (req, res) => {
  getMyDepartment(cbpPortal, req, res)
})

portalApi.patch('/cbp/department', async (req, res) => {
  updateDepartment(cbpPortal, req, res)
})

portalApi.post('/cbp/deptAction/userrole', async (req, res) => {
  addUserRole(cbpPortal, req, res)
})

portalApi.patch('/cbp/deptAction/userrole', async (req, res) => {
  updateUserRole(cbpPortal, req, res)
})

// ------------------ FRAC APIs ----------------------
portalApi.get('/frac/mydepartment', async (req, res) => {
  getMyDepartment('frac', req, res)
})

// ------------------ CBC APIs ----------------------

portalApi.get(cbcDeptPath, async (req, res) => {
  try {
    const userId = req.headers.wid as string
    if (!userId) {
      res.status(400).send(badRequest)
      return
    }
    const response = await axios.get(API_END_POINTS.deptApi(cbcPortal), {
      ...axiosRequestConfig,
      headers: req.headers,
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})

portalApi.get(cbcDeptPath + '/:deptId', async (req, res) => {
  try {
    const userId = req.headers.wid
    const deptId = req.params.deptId
    let isUserInfoRequired = req.query.allUsers as boolean
    if (!isUserInfoRequired) {
      isUserInfoRequired = false
    }
    if (!userId || !deptId) {
      res.status(400).send(badRequest)
      return
    }
    const response = await axios.get(
      API_END_POINTS.cbcDeptByIdApi(deptId, isUserInfoRequired),
      {
        ...axiosRequestConfig,
        headers: req.headers,
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})

portalApi.get('/cbc/mydepartment', async (req, res) => {
  getMyDepartment(cbcPortal, req, res)
})

portalApi.patch('/cbc/department', async (req, res) => {
  updateDepartment(cbcPortal, req, res)
})

portalApi.post('/cbc/deptAction/userrole', async (req, res) => {
  addUserRole(cbcPortal, req, res)
})

portalApi.patch('/cbc/deptAction/userrole', async (req, res) => {
  updateUserRole(cbcPortal, req, res)
})

// ------------------ Role APIs ----------------------
portalApi.get('/deptRole', async (req, res) => {
  try {
    const response = await axios.get(API_END_POINTS.portalRoleApi, {
      ...axiosRequestConfig,
      headers: req.headers,
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})

portalApi.get('/deptRole/:deptTypeName', async (req, res) => {
  try {
    const deptTypeName = req.params.deptTypeName
    const response = await axios.get(
      API_END_POINTS.roleByTypeApi(deptTypeName),
      {
        ...axiosRequestConfig,
        headers: req.headers,
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})

// ------------------ Private Functions ----------------------
// tslint:disable-next-line: no-any
export async function getMyDepartment(portalName: string, req: any, res: any) {
  try {
    let isUserInfoRequired = req.query.allUsers as boolean
    if (!isUserInfoRequired) {
      isUserInfoRequired = false
    }
    const response = await axios.get(
      API_END_POINTS.myDeptApi(portalName, isUserInfoRequired),
      {
        ...axiosRequestConfig,
        headers: req.headers,
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + req.originalUrl + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
}

// tslint:disable-next-line: no-any
export async function updateDepartment(portalName: string, req: any, res: any) {
  try {
    const userId = req.headers.wid as string
    if (!userId) {
      res.status(400).send(badRequest)
      return
    }
    const response = await axios.patch(
      API_END_POINTS.deptApi(portalName),
      req.body,
      {
        ...axiosRequestConfig,
        headers: req.headers,
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
}

// tslint:disable-next-line: no-any
export async function addUserRole(portalName: string, req: any, res: any) {
  try {
    const response = await axios.post(
      API_END_POINTS.userRoleApi(portalName),
      req.body,
      {
        ...axiosRequestConfig,
        headers: req.headers,
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
}

// tslint:disable-next-line: no-any
export async function updateUserRole(portalName: string, req: any, res: any) {
  try {
    const response = await axios.patch(
      API_END_POINTS.userRoleApi(portalName),
      req.body,
      {
        ...axiosRequestConfig,
        headers: req.headers,
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
}

portalApi.get(departmentType, async (req, res) => {
  try {
    const response = await axios.get(API_END_POINTS.portalDeptType)
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + req.originalUrl + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})

portalApi.get(departmentType + '/:deptType', async (req, res) => {
  try {
    const deptType = req.params.deptType
    const response = await axios.get(API_END_POINTS.deptTypeByName(deptType))
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + req.originalUrl + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})

portalApi.get('/userrole/:userId', async (req, res) => {
  try {
    const userId = req.params.userId
    const response = await axios.get(API_END_POINTS.userRolesApi(userId))
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + req.originalUrl + err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})

export async function getRoles(userId: string) {
  try {
    const response = await axios.get(API_END_POINTS.userRolesApi(userId))
    return response.data
  } catch (error) {
    logError('ERROR WHILE FETCHING THE USER ROLES --> ', error)
    return []
  }
}

export async function getUserStatus(userId: string) {
  try {
    const response = await axios.get(API_END_POINTS.userStatusCheckApi, {
      ...axiosRequestConfig,
      headers: {
        userId,
      },
    })
    return response.data
  } catch (err) {
    logError(failedToProcess + err)
  }
}
