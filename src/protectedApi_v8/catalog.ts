import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'

import { IFilterUnitContent } from '../models/catalog.model'
import { getFilters, getFilterUnitByType } from '../service/catalog'
import { logError } from '../utils/logger'
import { ERROR } from '../utils/message'
import {extractUserIdFromRequest, extractUserToken} from '../utils/requestExtract'

export const catalogApi = Router()

const API_END_POINTS = {
  getCatalogEndPoint: `${CONSTANTS.KONG_API_BASE}/v1/catalog/`,
}
const failedToProcess = 'Failed to process the request. '

catalogApi.get('/', async (req, res) => {
  try {
    const response = await axios.get(API_END_POINTS.getCatalogEndPoint, {
        ...axiosRequestConfig,
        headers: {
          Authorization: CONSTANTS.SB_API_KEY,
          'x-authenticated-user-token': extractUserToken(req),
        },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    logError(failedToProcess + err)
    res.status((err && err.response && err.response.status) || 500).send(
        (err && err.response && err.response.data) || {
            error: ERROR.GENERAL_ERR_MSG,
        }
    )
  }
})

catalogApi.post('/tags', async (req, res) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const rootOrg = req.headers.rootorg
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const { tags, type } = req.body
    if (typeof rootOrg === 'string') {
      const filterContents: IFilterUnitContent[] = await getFilters(userId, rootOrg, 'catalogPaths')
      const filterContent = filterContents.find((content) => content.type === type)
      const catalog: IFilterUnitContent | null = getFilterUnitByType(filterContent, tags)
      if (catalog) {
        res.send(catalog.children)
        return
      }

      res.status(400).send({ error: ERROR.ERROR_NO_ORG_DATA })
    }
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Failed due to unknown reason',
      }
    )
  }
})

export interface ITerms {
  identifier: string,
  code: string,
  name: string,
  description: string,
  index: number,
  status: string,
  children: this[],
  noOfHoursConsumed: number
}

export interface ICatalogResponse {
  terms: ITerms[]
}
