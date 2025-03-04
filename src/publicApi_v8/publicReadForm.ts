import { Router } from 'express'
import _ from 'lodash'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'
const cassandra = require('cassandra-driver')

export const publicReadForm = Router()
const VALIDATION_FAIL =
  'Sorry ! Read public form failed . Please try again in sometime.'
publicReadForm.get('/readForm', async (req, res) => {
  try {
    const frameworkType = req.query.type

    if (!(frameworkType)) {
      res.status(400).json({
        msg: 'UserID, courseID or secretKey can not be empty',
        status: 'error',
        status_code: 400,
      })
    }
    const client = new cassandra.Client({
      contactPoints: [CONSTANTS.CASSANDRA_IP],
      keyspace: 'qmzbm_form_service',
      localDataCenter: 'form_data',
    })
    // tslint:disable-next-line: max-line-length
    const query = `SELECT root_org, framework, type, subtype, action, component, created_on, data, last_modified_on FROM qmzbm_form_service.form_data  WHERE type=${frameworkType};`
    const formData = await client.execute(query)
    if (!formData) {
      res.status(400).json({
        msg: 'Form cannot be fetched',
        status: 'error',
        status_code: 400,
      })
    } else {
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'data': JSON.stringify(formData)
        })
    }
    client.shutdown()
    } catch (error) {
        logError('Error in validate certificate  >>>>>>' + error)
        res.status(500).send({
            message: VALIDATION_FAIL,
            status: 'failed',
        })
    }
})
