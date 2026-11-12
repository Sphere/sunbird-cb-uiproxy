import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractUserIdFromRequest } from '../utils/requestExtract'
import { API_END_POINTS } from './apiConstants'

const unknown = 'Failed due to unknown reason'

export const scromApi = Router()

scromApi.get('/get/:id', async (req, res) => {
  // logInfo('Scrom=> GET API called=====>', req.params.id || 'id missing')
  try {
    const userId = extractUserIdFromRequest(req)
    const org = req.header('org')
    const rootOrg = req.headers.rootorg
    const contentId = req.params.id

    if (!org || !rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    if (!contentId) {
      res.status(400).send(ERROR.GENERAL_ERR_MSG)
      return
    }

    const response = await axios.get(API_END_POINTS.getScromData, {
      ...axiosRequestConfig,
      headers: {
        org,
        rootOrg,
      },
      params: {
        contentId,
        userId,
      },
    })

    res.send(response.data)
    // tslint:disable-next-line: no-any
  } catch (err) {
    logError(err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknown,
      }
    )
  }
})

scromApi.post('/add/:id', async (req, res) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const org = req.header('org') || 'dopt'
    const rootOrg = req.header('rootorg') || 'igot'
    const contentId = req.params.id

    // logInfo('org, rootOrg, contentId', org, rootOrg, contentId)

    if (!org || !rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    if (!contentId) {
      res.status(400).send(ERROR.GENERAL_ERR_MSG)
      return
    }

    const body = req.body
    body.contentId = contentId
    body.userId = userId

    // logInfo('body========>', JSON.stringify(body))
    // if already passed donot update
    const config = {
      data: { root_org: rootOrg, content_id: contentId, user_id: userId },
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'post',
      url: '',
    }
    const resp = await axios({
      ...axiosRequestConfig,
      data: config.data,
      headers: { rootOrg },
      method: 'POST',
      url: config.url,
    })
    if (
      resp.data.data.length > 0 &&
      resp.data.data[0].cmi_core_lesson_status === 'passed'
    ) {
      res.status(400).send('Bad Request, already passed the module')
    } else {
      const response = await axios.post(API_END_POINTS.postScromData, body, {
        ...axiosRequestConfig,
        headers: {
          org,
          rootOrg,
        },
      })
      res.send(response.data)
    }

    // tslint:disable-next-line: no-any
  } catch (err) {
    logError(err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknown,
      }
    )
  }
})
scromApi.delete('/remove/:id', async (req, res) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const org = req.header('org')
    const rootOrg = req.headers.rootorg
    const contentId = req.params.id

    if (!org || !rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    if (!contentId) {
      res.status(400).send(ERROR.GENERAL_ERR_MSG)
      return
    }

    const response = await axios.post(
      API_END_POINTS.deleteScromData,
      {},
      {
        ...axiosRequestConfig,
        headers: {
          org,
          rootOrg,
        },
        params: {
          contentId,
          userId,
        },
        timeout: Number(CONSTANTS.KB_TIMEOUT),
      }
    )
    res.send(response.data)
    // tslint:disable-next-line: no-any
  } catch (err) {
    logError(err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknown,
      }
    )
  }
})
