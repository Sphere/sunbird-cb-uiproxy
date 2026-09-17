/* tslint-disable*/
import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import {
  createKeycloakUser,
  getAuthToken,
  sendActionsEmail,
  UpdateKeycloakUserPassword,
} from '../../utils/keycloak-user-creation'
import { logError, logInfo } from '../../utils/logger'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'
import { wTokenApiMock } from '../user/details'
import { updateRolesV2Mock } from '../user/roles'

export const userRegistrationApi = Router()

// sonar-cleanup: extracted from this file's repeated per-route catch blocks — same
// logError(label, err) + status(err.response.status || 500).send(err.response.data || {})
// shape (CHANGE 38)
/**
 * Logs the error under `label`, then responds with the upstream status code
 * (or 500) and the upstream error body (or an empty object).
 *
 * @param res - the Express response to send the error on
 * @param err - the caught error, expected to optionally carry an axios-style `response`
 * @param label - text prefixed to the logged error message
 */
// tslint:disable-next-line: no-any
function handleUserRegistrationError(res: any, err: any, label: string) {
  logError(label, err)
  res
    .status(err?.response?.status || 500)
    .send(err?.response?.data || {})
}

userRegistrationApi.get('/listUsers/:source', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg')
    const source = req.params.source
    const response = await axios.get(API_END_POINTS.listUsers(source), {
      headers: { rootOrg },
    })
    res.json(response.data)
  } catch (err) {
    handleUserRegistrationError(res, err, 'ERROR ON GET ALL REGISTERED USERS >')
  }
})

userRegistrationApi.post('/deregisterUsers/:source', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg')
    const source = req.params.source
    const response = await axios.post(
      API_END_POINTS.deregisterUsers(source),
      req.body,
      { headers: { rootOrg } }
    )
    res.json(response.data)
  } catch (err) {
    handleUserRegistrationError(res, err, 'ERROR ON DEREGISTER USERS >')
  }
})

userRegistrationApi.get('/getAllSources', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg')
    const response = await axios.get(
      `${API_END_POINTS.registrationStatus}?registrationProvided=false`,
      {
        ...axiosRequestConfig,
        headers: { rootOrg },
      }
    )
    const data = response.data.filter(
      (o: { registrationUrl: string | null }) => o.registrationUrl !== null
    )
    res.json(data || {})
  } catch (err) {
    handleUserRegistrationError(res, err, 'ERROR ON GET ALL SOURCES >')
  }
})

userRegistrationApi.get('/getSourceDetail/:id', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg')
    const source = req.params.id
    const response = await axios.get(
      `${API_END_POINTS.registrationStatus}/${source}`,
      {
        ...axiosRequestConfig,
        headers: { rootOrg },
      }
    )
    res.json(response.data || {})
  } catch (err) {
    handleUserRegistrationError(res, err, 'ERROR ON GET SOURCE DETAILS >')
  }
})

userRegistrationApi.get(
  '/checkUserRegistrationContent/:source',
  async (req, res) => {
    try {
      const source = req.params.source
      const uuid = extractUserIdFromRequest(req)
      const rootOrg = req.header('rootOrg')
      const response = await axios.get(
        `${API_END_POINTS.registrationStatus}/${source}/users/${uuid}`,
        {
          ...axiosRequestConfig,
          headers: { rootOrg },
        }
      )
      res.json(response.data || {})
    } catch (err) {
      handleUserRegistrationError(res, err, 'ERROR ON CHECK SOURCE REGISTRATION STATUS >')
    }
  }
)

userRegistrationApi.post('/register', async (req, res) => {
  try {
    const source = req.body.source
    const rootOrg = req.header('rootOrg')
    const response = await axios.post(
      `${API_END_POINTS.registrationStatus}/${source}/users`,
      req.body.items,
      {
        ...axiosRequestConfig,
        headers: {
          rootOrg,
        },
      }
    )
    res.json(response.data || {})
  } catch (err) {
    handleUserRegistrationError(res, err, 'ERROR ON REGISTRATIO USERS >')
  }
})

userRegistrationApi.post('/create-user', async (req, res) => {
  try {
    let createKeycloak: void | { id: string }
    createKeycloak = await createKeycloakUser(req).catch((error) => {
      if (error.response.status === 409) {
        res
          .status(400)
          .send(`1005: User with email ${req.body.email} is already exists !!`)
      } else {
        res
          .status(400)
          .send('1003: User could not be created in Keycloack !!')
      }
    })
    if (createKeycloak && createKeycloak.id) {
      await UpdateKeycloakUserPassword(createKeycloak.id, false).catch(
        (error) => {
          // tslint:disable-next-line: no-duplicate-string
          logInfo(error)
          logError('/create-user ERROR ON UpdateKeycloakUserPassword', error)
          res
            .status(400)
            .send('1003: User default password could not be set !!')
        }
      )
      getAuthToken(req.body.email)
        .then(async (kcaAuthToken) => {
          if (kcaAuthToken?.access_token) {
            const wTokenResponse = await wTokenApiMock(
              req,
              kcaAuthToken.access_token
            )
            // tslint:disable-next-line: max-line-length
            if (wTokenResponse?.user?.length) {
              logInfo('New User keycloak auth successfull')
              logInfo(
                `User: ${req.body.email} -- wid: ${wTokenResponse.user[0].wid}`
              )
            }
          }
        })
        .catch((error) => {
          logError('ERROR ON getAuthToken', error)
          res.status(400).send('1004: User getAuthToken failed !!')
        })
      await UpdateKeycloakUserPassword(createKeycloak.id, true).catch(
        // tslint:disable-next-line: no-any
        (error) => {
          logError(
            '/create-user ERROR ON UpdateKeycloakUserPassword after getAuthtoken',
            error
          )
          res
            .status(400)
            .send('1003: User default password could not be set !!')
        }
      )
      await sendActionsEmail(createKeycloak.id).catch((error) => {
        logError('ERROR ON sendActionsEmail', error)
        // res.status(400).send('1003: Email could not be set !!' || {})
      })
      // console.log('kcaAuthToken', kcaAuthToken)
      res.json({ data: 'User Created successfully!' })
    }
  } catch (err) {
    handleUserRegistrationError(res, err, 'ERROR ON CREATE USERS >')
  }
})

// tslint:disable-next-line: no-any
export async function createUser(req: any) {
  try {
    let createKeycloak: void | { id: string }
    createKeycloak = await createKeycloakUser(req).catch((err) => {
      return err
    })
    if (createKeycloak && createKeycloak.id) {
      return createKeycloak.id
    }
  } catch (err) {
    logError('ERROR ON CREATE USERS >', err)
  }
}

// tslint:disable-next-line: no-any
export async function performNewUserSteps(
  // tslint:disable-next-line: no-any
  userId: any,
  // tslint:disable-next-line: no-any
  req: any,
  // tslint:disable-next-line: no-any
  email: any,
  // tslint:disable-next-line: no-any
  roles?: any
) {
  return async () => {
    await UpdateKeycloakUserPassword(userId, false).catch((error) => {
      logError(
        'performNewUserSteps:: ERROR ON UpdateKeycloakUserPassword',
        error
      )
      return 'User default password could not be set'
    })
    // tslint:disable-next-line: no-identical-functions
    await getAuthToken(email)
      .then(async (kcaAuthToken) => {
        logInfo('access_token successfull: ', kcaAuthToken.access_token)
        if (kcaAuthToken?.access_token) {
          const wTokenResponse = await wTokenApiMock(
            req,
            kcaAuthToken.access_token
          )
          // tslint:disable-next-line: max-line-length
          if (wTokenResponse?.user) {
            logInfo('New User Wtoken auth successfull')
            logInfo(`User: ${email} -- wid: ${wTokenResponse.user.wid}`)
            if (roles?.length) {
              const updateRolesReq = {
                operation: 'add',
                roles: [...roles],
                users: [`${wTokenResponse.user.wid}`],
              }
              const actionByWid = extractUserIdFromRequest(req)
              const rootOrg = req.header('rootOrg')
              logInfo('Updating the roles for wid:', wTokenResponse.user.wid)
              await updateRolesV2Mock(
                actionByWid,
                updateRolesReq,
                rootOrg
              ).catch((err) => {
                logError(
                  'performNewUserSteps:: ERROR ON updateRolesV2Mock',
                  err
                )
                return 'Roles could not be updated'
              })
            }
          }
        }
      })
      .catch((error) => {
        logError('ERROR ON getAuthToken', error)
        return ' User getAuthToken failed'
      })
    await UpdateKeycloakUserPassword(userId, true)
      // tslint:disable-next-line: no-identical-functions
      .catch((error) => {
        logError(
          'performNewUserSteps:: ERROR ON UpdateKeycloakUserPassword after getAuthToken',
          error
        )
        return 'User default password could not be set'
      })
    await sendActionsEmail(userId).catch((error) => {
      logError('ERROR ON sendActionsEmail', error)
      return 'Email could not be sent'
    })
    return
  }
}
userRegistrationApi.get('/user/department', async (req, res) => {
  try {
    const wid = extractUserIdFromRequest(req)
    const rootOrg = req.header('rootOrg')
    const org = req.header('org')
    const response = await axios.post(
      `${API_END_POINTS.getDepartment}`,
      { wid },
      {
        ...axiosRequestConfig,
        headers: {
          org,
          rootOrg,
        },
      }
    )
    res.json(response.data || {})
  } catch (err) {
    handleUserRegistrationError(res, err, 'ERROR ON /user/department >')
  }
})

userRegistrationApi.post('/user/department/update', async (req, res) => {
  try {
    const userId = req.body.userId
    const departmentName = req.body.department
    const rootOrg = req.header('rootOrg')
    const org = req.header('org')
    const response = await axios.post(
      `${API_END_POINTS.updateDepartment}`,
      { userId, departmentName },
      {
        ...axiosRequestConfig,
        headers: {
          org,
          rootOrg,
        },
      }
    )
    res.json(response.data || {})
  } catch (err) {
    handleUserRegistrationError(res, err, 'ERROR ON /user/department >')
  }
})
