import axios from 'axios'
import { Request, Response, Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { IGamificationBdage, IGamificationBdageResponse } from '../models/badge.model'
import { IHallOfFameItem, ILeaderboard } from '../models/leaderboard.model'
import { appendUrl } from '../utils/contentHelpers'
import { CONSTANTS } from '../utils/env'
import { ERROR } from '../utils/message'
import { extractUserIdFromRequest } from '../utils/requestExtract'
import { API_END_POINTS } from './apiConstants'

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

// api params required to call gamification related apis
const apiParams = {
  ApplicationId: 53200,
  TokenNo: 'QD3NF456RB',
}

export const leaderBoardApi = Router()

// Get leaderboard
leaderBoardApi.get('/:durationType/:durationValue/:year', async (req: Request, res: Response) => {
  try {
    const rootOrg = req.header('rootOrg')

    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }

    const { durationType, durationValue, year } = req.params
    const userId = extractUserIdFromRequest(req)

    const leaderboard: ILeaderboard = await axios
      .get<ILeaderboard>(`${API_END_POINTS.leaderboard}`, {
        headers: { rootOrg },
        params: {
          duration_type: durationType,
          duration_value: durationValue,
          user_id: userId,
          year,
        },
      })
      .then((response) => response.data)

    return res.send(leaderboard)
  } catch (err) {
    return res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

// Get Hall of Fame
leaderBoardApi.get('/hallOfFame', async (req: Request, res: Response) => {
  try {
    const rootOrg = req.header('rootOrg')

    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }

    const userId = extractUserIdFromRequest(req)

    const hallOfFame: IHallOfFameItem[] = await axios
      .get<IHallOfFameItem[]>(`${API_END_POINTS.hallOfFame}`, {
        headers: { rootOrg },
        params: {
          duration_type: 'M',
          leaderboard_type: 'L',
          user_id: userId,
        },
      })
      .then((response) => response.data)

    return res.send(hallOfFame)
  } catch (err) {
    return res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

leaderBoardApi.post('/fetchLeaderBoardDetails', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const data = {
      ...apiParams,
      ...req.body,
      UserSourceSystemId: userId,
    }
    const response = await axios.post(API_END_POINTS.leaderboardDetails, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

leaderBoardApi.post('/leaderboardActivities', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const data = {
      ...apiParams,
      ...req.body,
      UserSourceSystemId: userId,
    }
    const response = await axios.post(API_END_POINTS.leaderboardActivities, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

leaderBoardApi.post('/leaderboardGuild', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const data = {
      ...apiParams,
      ...req.body,
      UserSourceSystemId: userId,
    }
    const response = await axios.post(API_END_POINTS.leaderboardGuild, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

// Get Badges For a user
leaderBoardApi.post('/badgeDetails', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const data = {
      ...apiParams,
      ...req.body,
      UserSourceSystemId: userId,
    }
    const response = await axios.post(API_END_POINTS.gamificationBadgeDetails, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

// Get Badges won For a user
leaderBoardApi.post('/badgeWon', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const data = {
      ...apiParams,
      ...req.body,
      UserSourceSystemId: userId,
    }
    const response = await axios.post(API_END_POINTS.gamificationBadgeWon, data, axiosRequestConfig)
    let result: IGamificationBdage[] | null = null
    if (response.data) {
      result = processBadgeArray(response.data)
    }
    res.send(result)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

// Get Badges yet to win For a user
leaderBoardApi.post('/badgeYetToWin', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const data = {
      ...apiParams,
      ...req.body,
      UserSourceSystemId: userId,
    }
    const response = await axios.post(API_END_POINTS.gamificationBadgeYetToWin, data, axiosRequestConfig)
    let result: IGamificationBdageResponse | null = null
    if (response.data) {
      result = processAllBadges(response.data)
    }
    res.send(result)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

// get details of all the dealer codes
leaderBoardApi.post('/dealersDetails', async (req: Request, res: Response) => {
  try {
    const data = {
      ...apiParams,
      ...req.body,
      UserSourceSystemId: '001019288',
    }
    const response = await axios.post(API_END_POINTS.dealersDetails, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

function processAllBadges(badges: IGamificationBdageResponse): IGamificationBdageResponse {
  let commentsOnContents = badges.Comments
  let forums = badges['Forum Posts']
  let microLearningContentResources = badges.Content
  let pathwayCertification = badges.Certifications
  let quizzes = badges.Quizzes
  let userGeneratedContent = badges['Peer Sharing']
  commentsOnContents = processBadgeArray(commentsOnContents)
  forums = processBadgeArray(forums)
  microLearningContentResources = processBadgeArray(microLearningContentResources)
  pathwayCertification = processBadgeArray(pathwayCertification)
  quizzes = processBadgeArray(quizzes)
  userGeneratedContent = processBadgeArray(userGeneratedContent)

  return {
    Certifications: pathwayCertification,
    Comments: commentsOnContents,
    Content: microLearningContentResources,
    'Forum Posts': forums,
    'Peer Sharing': userGeneratedContent,
    Quizzes: quizzes,
  }
}

function processBadgeArray(badges: IGamificationBdage[]): IGamificationBdage[] {
  if (badges && badges.length) {
    return badges.map((unitContent) => processBadgesRecent(unitContent))
  } else {
    return []
  }
}

function processBadgesRecent(badge: IGamificationBdage): IGamificationBdage {
  if (!badge) {
    return badge
  }
  return {
    ...badge,
    BadgeImagePath: appendUrl(badge.BadgeImagePath.replace(CONSTANTS.GAMIFICATION_API_BASE, '')),
  }
}

// get details of all the users
leaderBoardApi.post('/userDetails', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const data = {
      ...apiParams,
      ...req.body,
      UserSourceSystemId: userId,
    }
    const response = await axios.post(API_END_POINTS.leaderboardUserDetails, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

// Update approved points by admin in db
leaderBoardApi.post('/updateApprovedPoints', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const basicData = {
      ...apiParams,
      UserSourceSystemId: userId,
    }
    const data = {
      BasicParameters: basicData,
      UpdatedLeaderBoard: req.body.UpdatedLeaderBoard,
    }
    const response = await axios.post(API_END_POINTS.updateApprovedPoints, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

// Update config params based on job role by admin in db
leaderBoardApi.post('/updateConfiguration', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const basicData = {
      ...apiParams,
      UserSourceSystemId: userId,
    }
    const data = {
      BasicParameters: basicData,
      configPropertiesObj: req.body.configPropertiesObj,
    }
    const response = await axios.post(API_END_POINTS.updateConfiguration, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

// get sso value
leaderBoardApi.post('/Getsso', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const data = {
      ...apiParams,
      ...req.body,
      UserSourceSystemId: userId,
    }
    const response = await axios.post(API_END_POINTS.Getsso, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

// get sso balance
leaderBoardApi.post('/GetBalance', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const data = {
      ...apiParams,
      ...req.body,
      UserSourceSystemId: userId,
    }
    const response = await axios.post(API_END_POINTS.GetBalance, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

// Get config data based on job role
leaderBoardApi.post('/fetchConfiguration', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const data = {
      ...apiParams,
      ...req.body,
      UserSourceSystemId: userId,
    }
    const response = await axios.post(API_END_POINTS.fetchConfiguration, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

// Get config data after batch processing
leaderBoardApi.post('/fetchGuildAwardCountData', async (req: Request, res: Response) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const data = {
      ...apiParams,
      ...req.body,
      UserSourceSystemId: userId,
    }
    const response = await axios.post(API_END_POINTS.fetchGuildAwardCountData, data, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})
