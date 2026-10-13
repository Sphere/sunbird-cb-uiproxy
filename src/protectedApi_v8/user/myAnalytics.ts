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
import { getStringifiedQueryParams } from '../../utils/helpers'
import { extractUserIdFromRequest } from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

export const myAnalyticsApi = Router()

myAnalyticsApi.get(
  '/userProgress/:contentType',
  getMyAnalytics,
  async (_req: Request, res: Response) => {
    try {
      return res.send(res.locals.myAnalyticsData)
    } catch (err) {
      return res.status((err && err.response && err.response.status) || 500).send(
        (err && err.response && err.response.data) || {
          error: GENERAL_ERROR_MSG,
        }
      )
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
      res.status((err && err.response && err.response.status) || 500).send(
        (err && err.response && err.response.data) || {
          error: GENERAL_ERROR_MSG,
        }
      )
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
      `${API_END_POINTS.la1AssessmentV1}?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: API_END_POINTS.la1ValidatorUrl,
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
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
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
      `${API_END_POINTS.la1CertificationV1}?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: API_END_POINTS.la1ValidatorUrl,
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
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
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
      `${API_END_POINTS.la1Assessment}?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: API_END_POINTS.la1ValidatorUrl,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
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
      `${API_END_POINTS.la1Timespent}?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: API_END_POINTS.la1ValidatorUrl,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
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
        `${API_END_POINTS.la1NsoArtifactsAndCollaborators}?${queryParams}`,
        {
          headers: {
            Authorization: req.headers.authorization,
            org: req.header('org'),
            rootOrg: req.header('rootOrg'),
            validator_url: API_END_POINTS.la1ValidatorUrl,
            wid: userId,
          },
        }
      )
      res.status(response.status).send(response.data)
    } catch (err) {
      res.status((err && err.response && err.response.status) || 500).send(
        (err && err.response && err.response.data) || {
          error: GENERAL_ERROR_MSG,
        }
      )
    }
  }
)

myAnalyticsApi.get('/skills', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.get<IRequiredSkills[]>(API_END_POINTS.la1Skills, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: API_END_POINTS.la1ValidatorUrl,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

myAnalyticsApi.get('/myskills', async (req: Request, res: Response) => {
  try {
    const userId = req.query.wid || extractUserIdFromRequest(req)
    const response = await axios.get<IAcquiredSkills[]>(API_END_POINTS.la1MySkills, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: API_END_POINTS.la1ValidatorUrl,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

myAnalyticsApi.get('/recommendedSkills', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.get<IRecommendedSkills[]>(
      API_END_POINTS.la1RecommendedSkills,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: API_END_POINTS.la1ValidatorUrl,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
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
      `${API_END_POINTS.la1AllSkills}?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: API_END_POINTS.la1ValidatorUrl,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

myAnalyticsApi.get('/isAdmin', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.get<IAdmin>(API_END_POINTS.la1IsAdmin, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: API_END_POINTS.la1ValidatorUrl,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

myAnalyticsApi.get('/role/get', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.get<IRoles[]>(API_END_POINTS.la1RoleGet, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: API_END_POINTS.la1ValidatorUrl,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
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
      `${API_END_POINTS.la1SkillQuotient}?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: API_END_POINTS.la1ValidatorUrl,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
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
      `${API_END_POINTS.la1RoleQuotient}?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: API_END_POINTS.la1ValidatorUrl,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})
myAnalyticsApi.get('/skills-role/:roleId', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const queryParams = `role_id=${req.params.roleId}`
    const response = await axios.get<ICompassRolesResponse>(
      `${API_END_POINTS.la1NsoGetCourseAndProgress}?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: API_END_POINTS.la1ValidatorUrl,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

myAnalyticsApi.get('/role/getExisting', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.get<IExistingRoles[]>(
      API_END_POINTS.la1RoleGetExisting,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: API_END_POINTS.la1ValidatorUrl,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

myAnalyticsApi.post('/role/add', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.post(API_END_POINTS.la1RoleAdd, req.body, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: API_END_POINTS.la1ValidatorUrl,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

myAnalyticsApi.post('/skills/add', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.post(API_END_POINTS.la1SkillsAdd, req.body, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: API_END_POINTS.la1ValidatorUrl,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

myAnalyticsApi.post('/role/shareRole', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.post(API_END_POINTS.la1RoleShareRole, req.body, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: API_END_POINTS.la1ValidatorUrl,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

myAnalyticsApi.get('/skill/search', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const { search_text } = req.query
    const queryParams = getStringifiedQueryParams({
      search_text,
    })
    const response = await axios.get(`${API_END_POINTS.la1SkillSearch}?${queryParams}`, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: API_END_POINTS.la1ValidatorUrl,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
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
      `${API_END_POINTS.la1RoleDelete}?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: API_END_POINTS.la1ValidatorUrl,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

myAnalyticsApi.post('/role/update', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.post(API_END_POINTS.la1RoleUpdate, req.body, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: API_END_POINTS.la1ValidatorUrl,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})
myAnalyticsApi.get('/isApprover', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.get(API_END_POINTS.la1IsApprover, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: API_END_POINTS.la1ValidatorUrl,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

myAnalyticsApi.get('/skillData', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const { skill_id } = req.query
    const queryParams = getStringifiedQueryParams({
      skill_id,
    })
    const response = await axios.get(`${API_END_POINTS.la1SkillData}?${queryParams}`, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: API_END_POINTS.la1ValidatorUrl,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
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
    const response = await axios.get(`${API_END_POINTS.la1Search}?${queryParams}`, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: API_END_POINTS.la1ValidatorUrl,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
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
      `${API_END_POINTS.la1ProjectEndorsementGetList}?${queryParams}`,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: API_END_POINTS.la1ValidatorUrl,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})
myAnalyticsApi.get('/projectEndorsement/get', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.get(API_END_POINTS.la1ProjectEndorsementGet, {
      headers: {
        Authorization: req.headers.authorization,
        org: req.header('org'),
        rootOrg: req.header('rootOrg'),
        validator_url: API_END_POINTS.la1ValidatorUrl,
        wid: userId,
      },
    })
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
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
      `${API_END_POINTS.la1ProjectEndorsementEndorseRequest}?${queryParams}`,
      req.body,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: API_END_POINTS.la1ValidatorUrl,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})
myAnalyticsApi.post('/projectEndorsement/add', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const response = await axios.post(
      API_END_POINTS.la1ProjectEndorsementAdd,
      req.body,
      {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: API_END_POINTS.la1ValidatorUrl,
          wid: userId,
        },
      }
    )
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
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
      .get<IMyAnalytics>(`${API_END_POINTS.la1UserProgress}?${queryParams}`, {
        headers: {
          Authorization: req.headers.authorization,
          org: req.header('org'),
          rootOrg: req.header('rootOrg'),
          validator_url: API_END_POINTS.la1ValidatorUrl,
          wid: userId,
        },
      })
      .then((response) => {
        res.locals.myAnalyticsData = response.data
      })

    next()
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
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
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
}
