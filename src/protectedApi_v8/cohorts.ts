import axios from 'axios'
import {Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError} from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractUserIdFromRequest, extractUserToken } from '../utils/requestExtract'

const API_END_POINTS = {
  autoenrollment: (userId: string, courseId: string) => `${CONSTANTS.COHORTS_API_BASE}/v1/autoenrollment/${userId}/${courseId}`,
  cohorts: `${CONSTANTS.COHORTS_API_BASE}/v2/resources`,
  groupCohorts: (groupId: number) =>
    `${CONSTANTS.USER_PROFILE_API_BASE}/groups/${groupId}/users `,
  hierarchyApiEndPoint: (contentId: string) =>
  `${CONSTANTS.KNOWLEDGE_MW_API_BASE}/action/content/v3/hierarchy/${contentId}?hierarchyType=detail`,
  searchUserRegistry: `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/v1/user/search/profile`,
}
const VALID_COHORT_TYPES = new Set([
  'activeusers',
  'commongoals',
  'authors',
  'educators',
  'top-performers',
])

const unknownError = 'Failed due to unknown reason'

export const cohortsApi = Router()

cohortsApi.get('/:cohortType/:contentId', async (req, res) => {
  try {
    const cohortType = req.params.cohortType
    const contentId = req.params.contentId
    if (!VALID_COHORT_TYPES.has(cohortType)) {
      res.status(400).send('INVALID_COHORT_TYPE')
      return
    }
    const org = req.header('org')
    const rootOrgValue = req.header('rootOrg')
    const auth = req.header('Authorization') as string
    if (!org || !rootOrgValue) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    if (cohortType === 'authors') {
      const host = req.protocol + '://' + req.get('host')
      const userList = await getAuthorsDetails(host, auth, contentId)
      res.status(200).send(userList)
    } else {
      const url = `${API_END_POINTS.cohorts}/${contentId}/user/${extractUserIdFromRequest(
        req
      )}/cohorts/${cohortType}`
      const response = await axios({
        ...axiosRequestConfig,
        headers: {
          Authorization: extractUserToken(req),
          rootOrg : rootOrgValue,
        },
        method: 'GET',
        url,
      })
      res.status(response.status).send(response.data)
    }
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})

cohortsApi.get('/:groupId', async (req, res) => {
  const { groupId } = req.params
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios.get(API_END_POINTS.groupCohorts(groupId))
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: unknownError,
      }
    )
  }
})

export async function getAuthorsDetails(host: string, auth: string, contentId: string) {
  try {

    const url = host + `/apis/proxies/v8/action/content/v3/hierarchy/${contentId}?hierarchyType=detail`
    const hierarchyResponse = await axios.get(url, {
      ...axiosRequestConfig,
      headers: {
        Authorization: auth,
      },
  })
    const ids: string[] = []
    if (hierarchyResponse.data && hierarchyResponse.data.result &&
      hierarchyResponse.data.result.content) {
        const creatorDetails: string = hierarchyResponse.data.result.content.creatorDetails
        const authors = creatorDetails.substring(1, creatorDetails.length - 1).split(', ')
        authors.forEach((value) => {
            ids.push(JSON.parse(value).id)
          })
      }
    const userlist: ICohortsUser[] = []
    if (ids) {
    const searchBody = {
      filters : {
        'id.keyword' : {
            or : ids,
          },
      },
   }
    const response = await axios.post(API_END_POINTS.searchUserRegistry, { ...searchBody }, {
    ...axiosRequestConfig,
  })
    const userProfileResult = response.data.result.UserProfile
    if ((typeof userProfileResult !== 'undefined' && userProfileResult.length > 0)) {
    userProfileResult.forEach((element: IUserProfile) => {
      userlist.push(getUsers(element))
    })
  }
  }
    return userlist
  } catch (error) {
    logError('ERROR WHILE FETCHING THE AUTHORS DETAILS --> ', error)
    return false
  }
}

cohortsApi.get('/user/autoenrollment/:courseId', async (req, res) => {
  try {
      const courseId = req.params.courseId
      const wid = req.headers.wid as string
      const rootOrgValue = req.headers.rootorg
      const auth = req.header('Authorization') as string
      const response = await axios.get(API_END_POINTS.autoenrollment(wid, courseId), {
          ...axiosRequestConfig,
          headers: {
            Authorization: auth,
            rootOrg: rootOrgValue,
          },
      })
      res.status(response.status).send(response.data)
  } catch (err) {
      logError(err)
      res.status((err && err.response && err.response.status) || 500).send(
          (err && err.response && err.response.data) || {
              error: unknownError,
          }
      )
  }
})
function getUsers(userprofile: IUserProfile): ICohortsUser {

  return {
    city: '',
    department: userprofile.professionalDetails[0].name,
    desc: '',
    designation: userprofile.professionalDetails[0].designation,
    email : userprofile.personalDetails.primaryEmail,
    first_name : userprofile.personalDetails.firstname,
    last_name : userprofile.personalDetails.middlename,
    phone_No: userprofile.personalDetails.mobile,
    userLocation: '',
    user_id: userprofile.id,
  }
}

export interface ICohortsUser {
  first_name: string
  last_name: string
  email: string
  desc: string
  user_id: string
  department: string
  phone_No: number
  designation: string
  userLocation: string
  city: string
}

export interface IUserProfile {
  personalDetails: IPersonalDetails
  professionalDetails: IProfessionalDetailsEntity[]
  id: string
}
export interface IPersonalDetails {
  firstname: string
  middlename: string
  surname: string
  dob: string
  nationality: string
  domicileMedium: string
  gender: string
  maritalStatus: string
  category: string
  countryCode: string
  mobile: number
  telephone: string
  primaryEmail: string
  officialEmail: string
  personalEmail: string
}

export interface IProfessionalDetailsEntity {
  description: string
  industry: string
  designationOther: string
  nameOther: string
  organisationType: string
  responsibilities: string
  name: string
  location: string
  designation: string
  industryOther: string
  completePostalAddress: string
  doj: string
}
