import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { CONSTANTS } from '../../utils/env'
import { ERROR } from '../../utils/message'
import { extractUserToken } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'

export const autocompleteApi = Router()

autocompleteApi.post('/department/:query', async (req, res) => {
  const org = req.header('org')
  const rootOrg = req.header('rootOrg')
  try {
    if (!org || !rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const url = API_END_POINTS.usersByDepartment(rootOrg, req.params.query)

    const response = await axios.post(
      url,
      req.body,
      { ...axiosRequestConfig, headers: { rootOrg } }
    )
    res.send(response.data)
  } catch (err) {
    return err
  }
})

autocompleteApi.get('/:query', async (req, res) => {
  const org = req.header('org')
  const rootOrg = req.header('rootOrg')
  try {
    const queryParams = req.params.query
    if (!org || !rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }

    const url = API_END_POINTS.users('searchString=' + queryParams)
    const response = await axios({
      ...axiosRequestConfig,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        rootOrg,
        // tslint:disable-next-line: all
        'x-authenticated-user-token': extractUserToken(req),
      },
      method: 'GET',
      url,
    })
    res.send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500)
      .send((err && err.reponse && err.response.data) || {
        error: 'Failed due to unknown reason',
      })
  }
})
