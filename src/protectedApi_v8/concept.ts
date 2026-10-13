import axios from 'axios'
import { Request, Response, Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { IConceptResult } from '../models/conceptGraph.model'
import { IGenericApiResponse } from '../models/generic.model'
import { getStringifiedQueryParams } from '../utils/helpers'
import { API_END_POINTS } from './apiConstants'

export const conceptGraphApi = Router()

// Get leaderboard
conceptGraphApi.get('/:ids', async (req: Request, res: Response) => {
  try {
    const ids = req.params.ids
    const queryParams = getStringifiedQueryParams({
      ids,
    })
    let url: string
    url = `${API_END_POINTS.concepts}?${queryParams}`

    const conceptData: IConceptResult[] = await axios
      .get<IGenericApiResponse<IConceptResult[]>>(url, axiosRequestConfig)
      .then((response) => response.data.result.response)

    return res.send(conceptData)
  } catch (err) {
    return res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Failed due to unknown reason',
      }
    )
  }
})
conceptGraphApi.post('/autocomplete', async (req: Request, res: Response) => {
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    const autoCompleteData: [] = await axios
      .post<[]>(API_END_POINTS.conceptAutoComplete, req.body, {
        ...axiosRequestConfig,
        headers: {
          org,
          rootOrg,
        },
      })
      .then((response) => response.data)
    return res.send(autoCompleteData)
  } catch (err) {
    return res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Failed due to unknown reason',
      }
    )
  }
})
