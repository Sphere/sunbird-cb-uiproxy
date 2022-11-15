
import axios from 'axios'
import { axiosRequestConfig } from '../../configs/request.config'
import { CONSTANTS } from '../../utils/env'
import { logInfo } from '../../utils/logger'

const API_ENDPOINTS = {
    kongUpdateUser: `${CONSTANTS.KONG_API_BASE}/user/private/v1/update`,
}

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
              preferences: {
                language: 'en',
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
