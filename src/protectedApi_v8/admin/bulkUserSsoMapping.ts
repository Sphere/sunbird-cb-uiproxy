import axios from 'axios'
import { Router } from 'express'
import _ from 'lodash'
import { axiosRequestConfig } from '../../configs/request.config'
import { logInfo } from '../../utils/logger'
import { API_END_POINTS } from '../apiConstants'



export const bulkUserSsoMappingApi = Router()

/* tslint:disable-next-line */
bulkUserSsoMappingApi.post('/provider', async (req: any, _res) => {
    try {
        const fileData = req.files.userData.data.toString('utf8')
        const lines = fileData.split('\n')
        // tslint:disable-next-line: no-any
        const result: any = []
         // tslint:disable-next-line: no-any
        const createdUserId: any = []
        // NOTE: If your columns contain commas in their values, you'll need
        const headers = lines[0].split(',')
        for (let i = 1; i < lines.length; i++) {
            const obj = {}
            const currentline = lines[i].split(',')
            for (let j = 0; j < headers.length; j++) {
                obj[headers[j]] = currentline[j]
            }
            result.push(obj)
            result.forEach(async (csvElement) => {
                logInfo('result.UserID >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' + csvElement.UserID)
                const usernameType = csvElement.type
                const username = csvElement.username
                try {
                    const userSearch = await axios({
                        ...axiosRequestConfig,
                        data: {
                          request: {
                            filters:  { [usernameType] : username },
                          },
                        },
                        method: 'POST',
                        url: API_END_POINTS.kongUserSearch,
                    })
                    logInfo('userSearch response >>>>>>>>>>>>>>>' + userSearch)
                    if (userSearch.data.result.response && userSearch.data.result.response.count > 0) {
                            /* tslint:disable-next-line */
                          const userUUId = _.get(  _.find(userSearch.data.result.response.content, 'userId'), 'userId' )
                          const orgId =  userSearch.data.result.response.organisations[0].organisationId

                          logInfo('userUUId >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' + userUUId)
                          logInfo('orgId >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' + orgId)
                        }

                } catch (error) {
                    logInfo('Failed in fetching UserId ' + error)
                }
          })
        }
        logInfo('Result length >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>' + result.length)
        if (result.length > 0) {
            _res.status(200).send({
                message: 'Bulk Upload is Completed ! ',
                status : 'success',
                successUserIds : createdUserId,
            })
         } else {
            _res.status(404).send({
                message: 'No Data found in bulk upload ! plz check if UserId present.',
                status : 'warning',
            })
         }
    } catch (error) {
        logInfo('catch error-' + error)
        _res.status(500).send({
            message: 'Could not upload the file: ',
        })
    }
 })
