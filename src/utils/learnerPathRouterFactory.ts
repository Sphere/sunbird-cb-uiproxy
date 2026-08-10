import axios from 'axios'
import { Router } from 'express'
import { CONSTANTS } from './env'
import { logInfo } from './logger'
import { extractUserIdFromRequest, extractUserToken } from './requestExtract'

// sonar-cleanup: extracted from learnerPath.ts / learnerPathV2.ts, which were
// byte-identical aside from the upstream base URL and log-message text
// (CHANGE 29). apiBase and versionLabel carry those two differences; every
// other line of the original POST/GET handlers, including both response
// shapes and both error-fallback messages, is preserved verbatim.
function registerUpdateLearnerPathRoute(
  learnerPathApi: Router,
  updateLearnerPathUrl: string,
  versionLabel: string
) {
  learnerPathApi.post('/', async (req, res) => {
    try {
      logInfo(`***********  learner path${versionLabel} post`)
      logInfo(`Inside learner path${versionLabel} api (portal)`, JSON.stringify(req.body))
      const learnerPathBody = req.body
      const userId = extractUserIdFromRequest(req)
      if (userId !== learnerPathBody.userid) {
        return res.status(400).json({
          message: 'Invalid session or userid',
          status: 'FAILED',
        })
      }
      const serviceResponse = await axios({
        data: learnerPathBody,
        headers: {
          Authorization: CONSTANTS.SB_API_KEY,
          'Content-Type': 'application/json',
          'x-authenticated-user-token': extractUserToken(req),
        },
        method: 'POST',
        url: updateLearnerPathUrl,
      })
      res.status(200).json({
        data: serviceResponse.data,
        status: 'SUCCESS',
      })
    } catch (err) {
      logInfo(JSON.stringify(err))
      res.status(err?.response?.status || 500).send(
        err?.response?.data || {
          error: 'Something went wrong while updating or inserting learnerpath',
        }
      )
    }
  })
}

function registerGetLearnerPathRoute(
  learnerPathApi: Router,
  getLearnerPathUrl: string,
  versionLabel: string
) {
  learnerPathApi.get('/', async (req, res) => {
    try {
      logInfo(`***********  learner path${versionLabel}`)
      const userId = req.query.userId as string
      logInfo(`Inside learner path${versionLabel} api (portal)`, JSON.stringify(userId))
      const sessionUserId = extractUserIdFromRequest(req)
      if (sessionUserId !== userId) {
        return res.status(400).json({
          message: 'Invalid session or userid',
          status: 'FAILED',
        })
      }
      const serviceResponse = await axios({
        headers: {
          Authorization: CONSTANTS.SB_API_KEY,
          'Content-Type': 'application/json',
          'x-authenticated-user-token': extractUserToken(req),
        },
        method: 'GET',
        params: req.query,
        url: getLearnerPathUrl,
      })
      res.status(200).json({
        data: serviceResponse.data,
        status: 'SUCCESS',
      })
    } catch (err) {
      logInfo(JSON.stringify(err))
      res.status(err?.response?.status || 500).send(
        err?.response?.data || {
          error: 'Something went wrong while fetching learnerpath',
        }
      )
    }
  })
}

/**
 * Builds the shared learner-path proxy router: POST / forwards the body to
 * the upstream learner-path service and GET / fetches it back, both after
 * checking the caller's session userId against the request's own userid.
 * @param apiBase base URL of the upstream learner-path service for this version
 * @param versionLabel text appended to the log messages to identify which version is running (e.g. '' for v1, ' v2' for v2)
 */
export function createLearnerPathRouter(apiBase: string, versionLabel: string) {
  const learnerPathApi = Router()
  const learnerPathUrl = `${apiBase}/learnerpath`

  registerUpdateLearnerPathRoute(learnerPathApi, learnerPathUrl, versionLabel)
  registerGetLearnerPathRoute(learnerPathApi, learnerPathUrl, versionLabel)

  return learnerPathApi
}
