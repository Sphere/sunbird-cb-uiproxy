import elasticsearch from 'elasticsearch'
import { Router } from 'express'
import _ from 'lodash'
import { CONSTANTS } from '../utils/env'

const esBase = CONSTANTS.ES_IP
const client = new elasticsearch.Client({
  hosts: [esBase],
})

export const autoCompletev2 = Router()
const unknownError = 'Failed due to unknown reason'

autoCompletev2.get('/getUserDetails', async (req, res) => {
  try {
    const detail = req.query.details
    const resp = await client.search({
      body: {
        query: {
          bool: {
            should: [
              {
                bool: {
                  minimum_should_match: 1,
                  should: [
                    {
                      match: {
                        firstName: detail,
                      },
                    },
                    {
                      match: {
                        lastName: detail,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        size: 10000,
        sort: {
          _score: 'desc',
        },
      },
      index: 'user_alias',
    })

    res.status(200).json({
      id: 'api.user.autocompletev2',
      params: {
        err: null,
        errmsg: null,
        msgid: '3eb933ee-c276-4db9-9d24-a1a54fc7e20a',
        resmsgid: null,
        status: 'success',
      },
      responseCode: 'OK',
      result: {
        response: {
          // tslint:disable-next-line: no-any
          content: resp.hits.hits.map((hit) => hit._source),
        },
      },
    })
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})
