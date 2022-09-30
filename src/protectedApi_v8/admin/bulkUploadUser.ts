

import axios from 'axios'
import { Router } from 'express'
import fs from 'fs'
import { axiosRequestConfig, axiosRequestConfigLong } from '../../configs/request.config'
import { CONSTANTS } from '../../utils/env'
import { logInfo } from '../../utils/logger'
import { extractUserToken } from '../../utils/requestExtract'
const json2xls = require('json2xls')

const API_ENDPOINTS = {
    assignRoleforBulkUsers: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/v1/role/assign`,
    createUserOfBulkUpload: `${CONSTANTS.KONG_API_BASE}/user/v3/create`,
    kongSendWelcomeEmail: `${CONSTANTS.KONG_API_BASE}/private/user/v1/notification/email`,
    kongUserResetPassword: `${CONSTANTS.KONG_API_BASE}/private/user/v1/password/reset`,
}

// tslint:disable-next-line: no-any
const finalResponse: any = []

const filename = 'bulkUserUpload' + Date.now() + '.xlsx'

export const bulkUploadUserApi = Router()

// tslint:disable-next-line: no-any
bulkUploadUserApi.post('/create-users', async (req: any, _res) => {

    try {
        const fileData = req.files.userData.data.toString('utf8')

        const lines = fileData.split('\n')
        // tslint:disable-next-line: no-any
        const result: any = []

        // NOTE: If your columns contain commas in their values, you'll need
        const headers = lines[0].split(',')
        // logInfo('lines.length >>>>>>' + lines.length)
        for (let i = 1; i < lines.length; i++) {

            const obj = {}
            const currentline = lines[i].split(',')
            for (let j = 0; j < headers.length; j++) {
                obj[headers[j]] = currentline[j]
            }

            result.push(obj)
        }

        const userProcessing = async () => {
            try {
                // tslint:disable-next-line: no-any
                const data = await (Promise as any).allSettled(result.map(async (csvObjects: any) => {
                    return simulateFetchData(csvObjects)
                }))

                logInfo('Data inside user processing >>>>> ' + data)

                _res.status(200).send({
                                            status : "success",
                                            message: 'Bulk Upload is Completed ! ',
                                        })
            } catch (error) {
                logInfo('Calling User Processing  : ' + error)
                _res.status(500).send({
                    message: 'Error While Creating the user ',
                })
            }
        }

        // tslint:disable-next-line: no-any
        const simulateFetchData = async (csvObjects: any) => {
            try {
                logInfo('URL 2 >>>>>> ' + API_ENDPOINTS.assignRoleforBulkUsers)
                if (csvObjects.first_name) {

                    const collectData = {
                        firstName: csvObjects.first_name,
                        lastName: csvObjects.last_name,
                        // username: csvObjData.username,
                        [csvObjects.type]: csvObjects.phone ? csvObjects.phone : csvObjects.username,
                        organisationId: csvObjects.organisationId,
                        password: process.env.PASSWORD,
                        usertype: csvObjects.usertype,
                    }

                   // logInfo('collectData >>>>>' + JSON.stringify(collectData))
                    try {
                        const responseUserCreation = await axios({
                            ...axiosRequestConfig,
                            data: { request: collectData },
                            headers: {
                                Authorization: CONSTANTS.SB_API_KEY,
                            },
                            method: 'POST',
                            url: API_ENDPOINTS.createUserOfBulkUpload,
                        })
    
                        if (responseUserCreation) {
                            finalResponse.push(responseUserCreation)
                            
                            try {
                                const roleData = {
                                    organisationId: "0132317968766894088", // Pre-defined organisatin id
                                    roles: [
                                        'PUBLIC',
                                    ],
                                    userId: responseUserCreation.data.result.userId,
                                }

                                logInfo('Entered into Assign role >>' + JSON.stringify(roleData))
                                   
                                const responseRoleAssign = await axios({
                                        ...axiosRequestConfigLong,
                                        data: { request: roleData },
                                        headers: {
                                            Authorization: CONSTANTS.SB_API_KEY,
                                            // tslint:disable-next-line: all
                                            'x-authenticated-user-token': extractUserToken(req)
                                        },
                                        method: 'POST',
                                        url: API_ENDPOINTS.assignRoleforBulkUsers,
                                    })
                                    logInfo('Role Assigned data >>>> ' + responseRoleAssign)
                                    finalResponse.push(responseRoleAssign)     
                                    logInfo("Final collective data >>>> " + typeof(finalResponse))
                                    
                                    try
                                    {
                                        
                                    const passwordResetRequest = {
                                        key: 'email',
                                        type: 'email',
                                        userId: responseUserCreation.data.result.userId,
                                      }
                              
                                      logInfo('Sending Password reset request -> ' + passwordResetRequest)
                                      const passwordResetResponse = await axios({
                                        ...axiosRequestConfig,
                                        data: { request: passwordResetRequest },
                                        headers: {
                                          Authorization: CONSTANTS.SB_API_KEY,
                                        },
                                        method: 'POST',
                                        url: API_ENDPOINTS.kongUserResetPassword,
                                      })
                                      logInfo('Received response from password reset -> ' + passwordResetResponse)

                                    try{
                                        logInfo('Welcome Mail Request body')
                                        const welcomeMailRequest = {
                                            allowedLoging: 'You can use your email to Login. Click on link and activate your account.',
                                            body: 'Hello',
                                            emailTemplateType: 'iGotWelcome',
                                            firstName: csvObjects.first_name,
                                            link: passwordResetResponse.data.result.link,
                                            mode: 'email',
                                            orgName: 'Sphere test 1',
                                            recipientEmails: [csvObjects.username],
                                            setPasswordLink: true,
                                            subject: 'Welcome Email',
                                            welcomeMessage: 'Hello',
                                          }
                                          logInfo('Welcome Mail Request body data' + JSON.stringify(welcomeMailRequest))
                                        const welcomeMailResponse = await axios({
                                            ...axiosRequestConfig,
                                            data: { request: welcomeMailRequest },
                                            headers: {
                                                Authorization: CONSTANTS.SB_API_KEY,
                                            },
                                            method: 'POST',
                                            url: API_ENDPOINTS.kongSendWelcomeEmail,
                                            })
                            
                                        if (welcomeMailResponse.data.params.status !== 'success') {
                                            logInfo('Failed to send Welcome Email.')
                                        }
                                        
                                        return finalResponse
                                    }
                                    catch(error){
                                        logInfo('Error While sending the mail  : ' + error)
                                    }
                                }
                                catch(error){
                                    logInfo('Error While resetting password in generating link  : ' + error)
                                }

                            } catch (error) {
                                logInfo('Error While assign  the role  : ' + error)
                            }
                        }
                    } catch (error) {
                        logInfo('Error While Creating the user  : ' + error)
                    }
                    
                }
            } catch (error) {
                logInfo('Error While Creating the user & assigning role : ' + error)
            }

        }
        if (result.length > 1) {
           convert(result)
           userProcessing()
        }

    } catch (error) {
        logInfo('catch error-' + error)
        _res.status(500).send({
            message: 'Could not upload the file: ',
        })
    }
})

// tslint:disable-next-line: no-any
const convert = async (result: any) => {
    const xls = json2xls(result)
    // logInfo("Excel data >>>>>"+xls)
    fs.writeFileSync(filename, xls, 'binary')
}
