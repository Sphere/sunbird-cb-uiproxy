import axios from 'axios'
import { Request, Response, Router } from 'express'
import {
  IAchievementsResponse,
  IAcquiredSkills,
  IAdmin,
  IAllSkills,
  IAssessmentResponse,
  IAssessmentResponseV1,
  ICertificateResponse,
  ICompassRolesResponse,
  IExistingRoles,
  IMyAnalytics,
  INsoContentProgress,
  IRecommendedSkills,
  IRequiredSkills,
  IRoles,
  ISkillQuotient,
  ITimeSpentResponse,
} from '../../models/myAnalytics.model'
import { CONSTANTS } from '../../utils/env'
import { getStringifiedQueryParams } from '../../utils/helpers'
import { extractUserIdFromRequest } from '../../utils/requestExtract'

// To be passed to My Analytics APIs as the header 'validator_url'.
const MY_ANALYTICS_VALIDATOR_URL = `${CONSTANTS.HTTPS_HOST}/apis/protected/v8/user/validate`

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

/**
 * Responds with the upstream status code (or 500) and the upstream error
 * body (or a generic error message).
 *
 * @param res - the Express response to send the error on
 * @param err - the caught error, expected to optionally carry an axios-style `response`
 */
// tslint:disable-next-line: no-any
function handleMyAnalyticsError(res: Response, err: any) {
  return res.status((err && err.response && err.response.status) || 500).send(
    (err && err.response && err.response.data) || {
      error: GENERAL_ERROR_MSG,
    }
  )
}

export const myAnalyticsApi = Router()

myAnalyticsApi.get(
  '/userProgress/:contentType',
  getMyAnalytics,
  async (_req: Request, res: Response) => {
    try {
      return res.send(res.locals.myAnalyticsData)
    } catch (err) {
      return handleMyAnalyticsError(res, err)
    }
  }
)

myAnalyticsApi.get(
  '/:contentType/learning-history',
  getMyAnalytics,
  getMyAnalyticsLearningHistory,
  async (_req: Request, res: Response) => {
    try {
      res.send({
        learningHistory: res.locals.myAnalyticsLearningHistory,
        learningHistoryProgress: res.locals.myAnalyticsLearningHistoryProgressRange,
      })
    } catch (err) {
      handleMyAnalyticsError(res, err)
    }
  }
)

myAnalyticsApi.get('/assessments', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const { endDate, startDate } = req.query
    const queryParams = getStringifiedQueryParams({
      endDate,
      startDate,
    })
    const response = await axios.get(
      `${CONSTANTS.HTTPS_HOST}LA1/api/v1/assessment?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: MY_ANALYTICS_VALIDATOR_URL,
          wid: userId,
        },
      }
    )
    const receivedData = response.data as IAssessmentResponseV1
    const result: IAchievementsResponse = {
      ...receivedData,
      achievements: receivedData.assessments || [],
    }
    delete result.assessments
    res.status(response.status).send(result)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.get('/certification', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const { endDate, startDate } = req.query
    const queryParams = getStringifiedQueryParams({
      endDate,
      startDate,
    })
    const response = await axios.get(
      `${CONSTANTS.HTTPS_HOST}LA1/api/v1/certification?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: MY_ANALYTICS_VALIDATOR_URL,
          wid: userId,
        },
      }
    )
    const receivedData = response.data as ICertificateResponse
    const result: IAchievementsResponse = {
      ...receivedData,
      achievements: receivedData.certifications || [],
    }
    delete result.certifications
    res.status(response.status).send(result)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

// LA1/api/v1/assessment?startDate=2018-04-01&endDate=2020-03-31
myAnalyticsApi.get('/assessment/:contentType', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const { contentType } = req.params
    const { endDate, startDate, isCompleted } = req.query
    const queryParams = getStringifiedQueryParams({
      contentType,
      endDate,
      isCompleted,
      startDate,
    })
    const response = await axios.get<IAssessmentResponse>(
      `${CONSTANTS.HTTPS_HOST}LA1/api/assessment?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: MY_ANALYTICS_VALIDATOR_URL,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.get('/timespent/:contentType', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const { contentType } = req.params
    const { endDate, startDate, isCompleted } = req.query
    const queryParams = getStringifiedQueryParams({
      contentType,
      endDate,
      isCompleted,
      startDate,
    })
    const response = await axios.get<ITimeSpentResponse>(
      `${CONSTANTS.HTTPS_HOST}LA1/api/timespent?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: MY_ANALYTICS_VALIDATOR_URL,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.get(
  '/nsoArtifactsAndCollaborators/:contentType',
  async (req: Request, res: Response) => {
    try {
      const userId = extractUserIdFromRequest(req)
      const { contentType } = req.params
      const { endDate, startDate, isCompleted } = req.query
      const queryParams = getStringifiedQueryParams({
        contentType,
        endDate,
        isCompleted,
        startDate,
      })
      const response = await axios.get<INsoContentProgress>(
        `${CONSTANTS.HTTPS_HOST}LA1/api/nsoArtifactsAndCollaborators?${queryParams}`,
        {
          headers: {
            Authorization: req.headers.authorization,
            org: req.header('org'),
            rootOrg: req.header('rootOrg'),
            validator_url: MY_ANALYTICS_VALIDATOR_URL,
            wid: userId,
          },
        }
      )
      res.status(response.status).send(response.data)
    } catch (err) {
      handleMyAnalyticsError(res, err)
    }
  }
)

myAnalyticsApi.get('/skills', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.get<IRequiredSkills[]>(`${CONSTANTS.HTTPS_HOST}LA1/api/skills`, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: MY_ANALYTICS_VALIDATOR_URL,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.get('/myskills', async (req: Request, res: Response) => {
  try {
    const userId = req.query.wid || extractUserIdFromRequest(req)
    const response = await axios.get<IAcquiredSkills[]>(`${CONSTANTS.HTTPS_HOST}LA1/api/myskills`, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: MY_ANALYTICS_VALIDATOR_URL,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.get('/recommendedSkills', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.get<IRecommendedSkills[]>(
      `${CONSTANTS.HTTPS_HOST}LA1/api/recommendedSkills`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: MY_ANALYTICS_VALIDATOR_URL,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.get('/allSkills', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const { searchText, horizon, category, pageNo } = req.query
    const queryParams = getStringifiedQueryParams({
      category,
      horizon,
      pageNo,
      searchText,
    })
    const response = await axios.get<IAllSkills[]>(
      `${CONSTANTS.HTTPS_HOST}LA1/api/allSkills?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: MY_ANALYTICS_VALIDATOR_URL,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.get('/isAdmin', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.get<IAdmin>(`${CONSTANTS.HTTPS_HOST}LA1/api/isAdmin`, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: MY_ANALYTICS_VALIDATOR_URL,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.get('/role/get', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.get<IRoles[]>(`${CONSTANTS.HTTPS_HOST}LA1/api/role/get`, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: MY_ANALYTICS_VALIDATOR_URL,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.get('/skillquotient', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const { skill_id } = req.query
    const queryParams = getStringifiedQueryParams({
      skill_id,
    })
    const response = await axios.get<ISkillQuotient>(
      `${CONSTANTS.HTTPS_HOST}LA1/api/skillquotient?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: MY_ANALYTICS_VALIDATOR_URL,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.get('/rolequotient', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const { role_id } = req.query
    const queryParams = getStringifiedQueryParams({
      role_id,
    })
    const response = await axios.get<ISkillQuotient>(
      `${CONSTANTS.HTTPS_HOST}LA1/api/rolequotient?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: MY_ANALYTICS_VALIDATOR_URL,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})
myAnalyticsApi.get('/skills-role/:roleId', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const queryParams = `role_id=${req.params.roleId}`
    const response = await axios.get<ICompassRolesResponse>(
      `${CONSTANTS.HTTPS_HOST}LA1/api/nso/getCourseAndProgress?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: MY_ANALYTICS_VALIDATOR_URL,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.get('/role/getExisting', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.get<IExistingRoles[]>(
      `${CONSTANTS.HTTPS_HOST}LA1/api/role/getExisting`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: MY_ANALYTICS_VALIDATOR_URL,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.post('/role/add', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.post(`${CONSTANTS.HTTPS_HOST}LA1/api/role/add`, req.body, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: MY_ANALYTICS_VALIDATOR_URL,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.post('/skills/add', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.post(`${CONSTANTS.HTTPS_HOST}LA1/api/skills/add`, req.body, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: MY_ANALYTICS_VALIDATOR_URL,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.post('/role/shareRole', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.post(`${CONSTANTS.HTTPS_HOST}LA1/api/role/shareRole`, req.body, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: MY_ANALYTICS_VALIDATOR_URL,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.get('/skill/search', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const { search_text } = req.query
    const queryParams = getStringifiedQueryParams({
      search_text,
    })
    const response = await axios.get(`${CONSTANTS.HTTPS_HOST}LA1/api/skill/search?${queryParams}`, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: MY_ANALYTICS_VALIDATOR_URL,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.get('/role/delete', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const { role_id } = req.query
    const queryParams = getStringifiedQueryParams({
      role_id,
    })
    const response = await axios.delete(
      `${CONSTANTS.HTTPS_HOST}LA1/api/role/delete?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: MY_ANALYTICS_VALIDATOR_URL,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.post('/role/update', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.post(`${CONSTANTS.HTTPS_HOST}LA1/api/role/update`, req.body, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: MY_ANALYTICS_VALIDATOR_URL,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})
myAnalyticsApi.get('/isApprover', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.get(`${CONSTANTS.HTTPS_HOST}LA1/api/isApprover`, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: MY_ANALYTICS_VALIDATOR_URL,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.get('/skillData', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const { skill_id } = req.query
    const queryParams = getStringifiedQueryParams({
      skill_id,
    })
    const response = await axios.get(`${CONSTANTS.HTTPS_HOST}LA1/api/skillData?${queryParams}`, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: MY_ANALYTICS_VALIDATOR_URL,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.get('/search', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const { search_text, type } = req.query
    const queryParams = getStringifiedQueryParams({
      search_text,
      type,
    })
    const response = await axios.get(`${CONSTANTS.HTTPS_HOST}LA1/api/search?${queryParams}`, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: MY_ANALYTICS_VALIDATOR_URL,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})

myAnalyticsApi.get('/projectEndorsement/getList', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const { request_type } = req.query
    const queryParams = getStringifiedQueryParams({
      request_type,
    })
    const response = await axios.get(
      `${CONSTANTS.HTTPS_HOST}LA1/api/projectEndorsement/getList?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: MY_ANALYTICS_VALIDATOR_URL,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})
myAnalyticsApi.get('/projectEndorsement/get', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.get(`${CONSTANTS.HTTPS_HOST}LA1/api/projectEndorsement/get`, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: MY_ANALYTICS_VALIDATOR_URL,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})
myAnalyticsApi.post('/projectEndorsement/endorseRequest', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const { endorse_id } = req.query
    const queryParams = getStringifiedQueryParams({
      endorse_id,
    })
    const response = await axios.post(
      `${CONSTANTS.HTTPS_HOST}LA1/api/projectEndorsement/endorseRequest?${queryParams}`,
      req.body,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: MY_ANALYTICS_VALIDATOR_URL,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})
myAnalyticsApi.post('/projectEndorsement/add', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.post(
      `${CONSTANTS.HTTPS_HOST}LA1/api/projectEndorsement/add`,
      req.body,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: MY_ANALYTICS_VALIDATOR_URL,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
})
// WRITE MIDDLEWARE BELOW

export async function getMyAnalytics(req: Request, res: Response, next: Function) {
  try {
    const userId = extractUserIdFromRequest(req)
    const { contentType } = req.params
    const { endDate, startDate, isCompleted } = req.query
    const queryParams = getStringifiedQueryParams({
      contentType,
      endDate,
      isCompleted,
      startDate,
    })
    await axios
      .get<IMyAnalytics>(`${CONSTANTS.HTTPS_HOST}LA1/api/userprogress?${queryParams}`, {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: MY_ANALYTICS_VALIDATOR_URL,
          wid: userId,
        },
      })
      .then((response) => {
        res.locals.myAnalyticsData = response.data
      })

    next()
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
}

export async function getMyAnalyticsLearningHistory(_req: Request, res: Response, next: Function) {
  try {
    const myAnalyticsData: IMyAnalytics = res.locals.myAnalyticsData

    res.locals.myAnalyticsLearningHistory = myAnalyticsData.learning_history
    res.locals.myAnalyticsLearningHistoryProgressRange =
      myAnalyticsData.learning_history_progress_range

    next()
  } catch (err) {
    handleMyAnalyticsError(res, err)
  }
}
