
import axios from 'axios'
import { axiosRequestConfig } from '../../configs/request.config'
import { CONSTANTS } from '../../utils/env'
import { logInfo } from '../../utils/logger'

const API_ENDPOINTS = {
    kongUpdateUser: `${CONSTANTS.KONG_API_BASE}/user/v1/update`,
}
const year = '1990'
const defaultDOB = '1990-01-01'

// tslint:disable-next-line: no-any
export const bulkExtendedMethod = async (
    // tslint:disable-next-line: no-any
    request: any,
    userId: string
  ) => {

    try {
        const updateProfileReq = {
            profileDetails: {
              id : userId,
              preferences: {
                language: 'en',
              },
              profileReq: {
                academics: [
                    {
                        nameOfInstitute: request.nameOfInstitute,
                        nameOfQualification: request.nameOfQualification,
                        type: request.qualificationType,
                        yearOfPassing: request.yearOfPassing,
                    },
                ],
                employmentDetails: {
                  departmentName: request.organisationName,
                },
                interests: {
                    hobbies: request.hobbies,
                    professional: request.profession,
                },
                personalDetails: {
                    countryCode: request.countryCode,
                    dob: request.dob,
                    firstname: request.first_name,
                    postalAddress: request.postalAddress,
                    regNurseRegMidwifeNumber: request.RN_Number,
                    surname: request.last_name,
                    tncAccepted: false,
                },
                professionalDetails: [
                    {
                        completePostalAddress: request.postalAddress,
                        designation: request.Designation,
                        location: request.profileLocation,
                        name: request.organisationName,
                        nameOther: request.institution_name,
                        orgType: request.orgType,
                        profession: request.profession,
                    },
                ],
                skills: {
                    additionalSkills: request.orgType,
                    certificateDetails: request.orgType,
                },
              },
            },
            userId,
          }
        logInfo('>>>>>>  JSON Body of Update User profile >>>>>>>>>>>>> : ' + JSON.stringify(request))
        const sbUserProfileUpdateResp = await axios({
            ...axiosRequestConfig,
            data: { request: updateProfileReq },
            headers: {
              Authorization: CONSTANTS.SB_API_KEY,
            },
            method: 'PATCH',
            url: API_ENDPOINTS.kongUpdateUser,
          })

        logInfo('Total CSVObjects in bulkextended are >>>>>>>>>>>>> : ' + JSON.stringify(request))
        logInfo('UserId in bulkextended >>>>>>>>>>>>> : ' + JSON.stringify(userId))
        logInfo('Total CSVObjects data are >>>>>>>>>>>>> : ' + sbUserProfileUpdateResp)
        return request

    } catch (error) {
        logInfo('Warning ! Error While updating user profile of bulk upload after role assign  : ' + error)
    }
}

export const saveExtendedData = async (
    // tslint:disable-next-line: no-any
    request: any,
    userId: string
  ) => {

    try {
        logInfo('Entered into SaveExtended data for asha workers')
        const updateProfileReq = {
            profileDetails: {
              id : userId,
              preferences: {
                language: 'en',
              },
              profileReq: {
                academics: [
                    {
                        nameOfInstitute: request.Cadre,
                        nameOfQualification: request.Cadre,
                        type: request.qualificationType,
                        yearOfPassing: year,
                    },
                ],
                employmentDetails: {
                  departmentName: request.Cadre,
                },
                interests: {
                    hobbies: request.Cadre,
                    professional: request.Cadre,
                },
                personalDetails: {
                    countryCode: 'IN',
                    dob: defaultDOB,
                    firstname: request.first_name,
                    postalAddress: request.Cadre,
                    surname: request.last_name,
                    tncAccepted: false,
                },
                professionalDetails: [
                    {
                        completePostalAddress: request.Cadre,
                        designation: request.Cadre,
                        name: request.Cadre,
                        orgType: request.Cadre,
                        profession: request.Cadre,
                    },
                ],
              },
            },
            userId,
          }
        logInfo('Check  into SaveExtended data for asha workers' + JSON.stringify(request))
        const sbUserProfileUpdateResp = await axios({
            ...axiosRequestConfig,
            data: { request: updateProfileReq },
            headers: {
              Authorization: CONSTANTS.SB_API_KEY,
            },
            method: 'PATCH',
            url: API_ENDPOINTS.kongUpdateUser,
          })

        logInfo('Total SaveExtended CSVObjects in bulkextended are >>>>>>>>>>>>> : ' + JSON.stringify(request))
        logInfo('UserId SaveExtended in bulkextended >>>>>>>>>>>>> : ' + JSON.stringify(userId))
        logInfo('Total SaveExtended CSVObjects data are >>>>>>>>>>>>> : ' + sbUserProfileUpdateResp)
        return request

    } catch (error) {
        logInfo('Warning ! SaveExtended Error While updating user profile of bulk upload after role assign  : ' + error)
    }
}
