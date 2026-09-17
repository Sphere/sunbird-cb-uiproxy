import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { IContent } from '../models/content.model'
import { logError, logInfo } from '../utils/logger'
const GENERAL_ERROR_MSG = 'Failed due to unknown reason 11'
import { processContent } from '../utils/contentHelpers'

import { API_END_POINTS } from './apiConstants'

export const publicOrg = Router()

const adminId = 'ec2687b9-7b86-4321-bbc7-8c9509b834ee'

publicOrg.post('/searchByOrgID', async (req, res) => {
  try {
    const searchob = req.body.searchFilters
    let inp = -1
    const result = searchob.filters[0].andFilters.some((e: object) => e.hasOwnProperty('sourceName'))

    if (result) {// validating if 'sourceName' property exist or not
      /* tslint:disable */
      searchob.filters[0].andFilters.forEach((v: any, i: number) => {
          if (v.sourceName) {
              inp = i
          }
       })
      if (inp >= 0) {searchob.filters[0].andFilters.splice(inp, 1)}
      searchob.filters[0].andFilters.push( {
          sourceShortName: [req.body.orgId],
      })

    } else { // push sourceName
          searchob.filters[0].andFilters.push( {
            sourceShortName: [req.body.orgId[0]]
        })
    }

    const body = {
      ...searchob,
      rootOrg: req.header('rootOrg'),
      uuid: adminId,
    }

    logInfo('SEARCH BY ORG ID ')
    const response = await axios.post(API_END_POINTS.searchV6, body, axiosRequestConfig)
    const contents: IContent[] = response.data.result
    if (Array.isArray(contents)) {
      response.data.result = contents.map((content) => processContent(content))
    }
    const finalResult = response.data.result.filter(function(item: IContent){
        return item.sourceName.toLowerCase() === req.body.orgId[0].toLowerCase()
    })
    response.data.result = finalResult;
    res.json(
      response.data || {
        filters: [],
        filtersUsed: [],
        notVisibleFilters: [],
        result: [],
        totalHits: 0,
      }
    )
  } catch (err) {
    logError('PUBLIC SEARCH BY ORG API ERROR >', err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})
