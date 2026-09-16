
import axios from 'axios'
import { axiosRequestConfig } from '../../configs/request.config'
import { CONSTANTS } from '../../utils/env'
import { logInfo } from '../../utils/logger'

const API_ENDPOINTS = {
    kongUpdateUser: `${CONSTANTS.KONG_API_BASE}/user/private/v1/update`,
}
const year = '1990'
const defaultDOB = '1990-01-01'

// sonar-cleanup: extracted from the identical PATCH-and-log tail shared by
// bulkExtendedMethod and saveExtendedData below — same axios call, same
// three-line "Total .../UserId .../Total ... data are" success log
// sequence. `csvLabel`/`userIdLabel` carry the one real difference:
// saveExtendedData's three log lines are all prefixed with 'SaveExtended',
// but bulkExtendedMethod's "UserId" line (unlike its other two) has no
// 'CSVObjects' in it at all — a pre-existing inconsistency in the original
// wording, kept as-is rather than normalized. Left for each caller to keep
// its own try/catch around this call, since building the payload (before
// this function ever runs) can also fail and needs to be caught the same
// way as an axios failure.
/**
 * PATCHes the given profile update payload to Kong, then logs the built
 * request body under `csvLabel`, the userId under `userIdLabel`, and the
 * upstream response under `csvLabel`, and returns the original request.
 *
 * @param request - the original CSV-row request, returned as-is and re-logged as the built body
 * @param userId - the user whose profile is being updated
 * @param updateProfileReq - the already-built Kong profile update payload
 * @param csvLabel - text inserted into the "Total ... in/data are" log lines (e.g. 'CSVObjects' or 'SaveExtended CSVObjects')
 * @param userIdLabel - text inserted into the "UserId ... in bulkextended" log line (e.g. '' or 'SaveExtended')
 */
async function patchProfileAndLog(
    // tslint:disable-next-line: no-any
    request: any,
    userId: string,
    // tslint:disable-next-line: no-any
    updateProfileReq: any,
    csvLabel: string,
    userIdLabel: string
  ) {
    const sbUserProfileUpdateResp = await axios({
        ...axiosRequestConfig,
        data: { request: updateProfileReq },
        headers: {
          Authorization: CONSTANTS.SB_API_KEY,
        },
        method: 'PATCH',
        url: API_ENDPOINTS.kongUpdateUser,
      })

    logInfo(`Total ${csvLabel} in bulkextended are >>>>>>>>>>>>> : ` + JSON.stringify(request))
    logInfo(`UserId ${userIdLabel}in bulkextended >>>>>>>>>>>>> : ` + JSON.stringify(userId))
    logInfo(`Total ${csvLabel} data are >>>>>>>>>>>>> : ` + JSON.stringify(sbUserProfileUpdateResp))
    return request
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
        return await patchProfileAndLog(request, userId, updateProfileReq, 'CSVObjects', '')

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
        return await patchProfileAndLog(request, userId, updateProfileReq, 'SaveExtended CSVObjects', 'SaveExtended ')

    } catch (error) {
        logInfo('Warning ! SaveExtended Error While updating user profile of bulk upload after role assign  : ' + error)
    }
}
