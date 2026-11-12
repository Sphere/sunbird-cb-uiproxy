import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { logError } from '../../utils/logger'
import { ERROR } from '../../utils/message'
import { extractUserIdFromRequest} from '../../utils/requestExtract'
import { API_END_POINTS } from '../apiConstants'

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

export async function getCommonTnc(rootOrg: string, org: string) {
  try {
    return await axios({
      ...axiosRequestConfig,
      headers: {
        org,
        rootOrg,
      },
      method: 'GET',
      url: API_END_POINTS.tnc,
    })
  } catch (e) {
    throw new Error(e)
  }
}

export async function getTnc(userId: string, rootOrg: string, org: string, locale = 'en') {
  try {
    const response = await axios.get(`${API_END_POINTS.tnc}?userId=${userId}`, {
      ...axiosRequestConfig,
      headers: {
        langCode: locale,
        org,
        rootOrg,
      },
    })
    const tncData = response.data
    const hasTerms = Boolean(
      Array.isArray(tncData.termsAndConditions) && tncData.termsAndConditions.length
    )
    return {
      ...tncData,
      isNewUser: Boolean(
        !tncData.isAccepted && hasTerms && !tncData.termsAndConditions[0].acceptedVersion
      ),
    }
  } catch (err) {
    logError('Error occurred while getting user TNC. Trying to fetch common tnc >', err)
    try {
      const commonTnc = await getCommonTnc(rootOrg, org)
      return {
        ...commonTnc.data,
        isNewUser: true,
      }
    } catch (e) {
      logError('Error occurred while getting COMMON TNC >', e)
      throw new Error(e)
    }
  }
}

export async function getTncStatus(
  userId: string,
  rootOrg: string,
  org: string,
  locale?: string
): Promise<boolean> {
  try {
    const tnc = await getTnc(userId, rootOrg, org, locale)
    return tnc.isAccepted
  } catch (e) {
    logError(`TNC STATUS ERROR:`, e)
    return false
  }
}

export const protectedTnc = Router()

protectedTnc.get('/status', async (req, res) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const rootOrg = req.header('rootOrg')
    const org = req.header('org')
    // tslint:disable-next-line: no-commented-code
    // let locale = req.header('locale')
    let locale = 'en'
    if (!org || !rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    if (req.query.locale) {
      locale = req.query.locale
    }
    const response = await getTncStatus(userId, rootOrg, org, locale)
    res.send(response)
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

protectedTnc.get('/', async (req, res) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const rootOrg = req.header('rootOrg')
    const org = req.header('org')
    // tslint:disable-next-line: no-commented-code
    // let locale = req.header('locale')
    let locale = 'en'
    if (!org || !rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    if (req.query.locale) {
      locale = req.query.locale
    }
    const response = await getTnc(userId, rootOrg, org, locale)
    res.send(response)
  } catch (err) {
    logError('TNC SEND ERROR', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

protectedTnc.post('/accept', async (req, res) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const body = {
      termsAccepted: req.body.termsAccepted,
      userId,
    }
    const rootOrg = req.header('rootOrg')
    const org = req.header('org')
    const langCode = req.header('langCode') || 'en'
    if (!org || !rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios({
      ...axiosRequestConfig,
      data: body,
      headers: {
        langCode,
        org,
        rootOrg,
      },
      method: 'POST',
      url: API_END_POINTS.acceptTnC,
    })
    const data = response.data.result || ''
    if (data.toUpperCase() === 'SUCCESS') {
      res.status(204).send()
      return
    }
    res.status(500).send(response.data)
  } catch (err) {
    logError('ERROR WHILE ACCEPTING TNC', err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

protectedTnc.patch('/postprocessing', async (req, res) => {
  try {
    const rootOrg = req.header('rootOrg')
    const org = req.header('org')
    const langCode = req.header('langCode') || 'en'
    if (!org || !rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios({
      ...axiosRequestConfig,
      data: {},
      headers: {
        langCode,
        org,
        rootOrg,
      },
      method: 'POST',
      url: API_END_POINTS.tncPostProcessing(extractUserIdFromRequest(req)),
    })
    res.status(response.data ? 200 : 204).send(response.data)
  } catch (err) {
    logError('ERROR WHILE POSTPROCESSING', err)
    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      }
    )
  }
})

protectedTnc.get('/system/settings/:configName', async (req, res) => {
  try {
    const configName = req.params.configName
    if (!configName) {
      res.status(400).send('configuration name should not be empty!')
      return
    }
    const response = await axios.get(API_END_POINTS.systemConfigEndPoint(configName), {
      ...axiosRequestConfig,
      headers: {},
  })
    res.status(response.status).send(response.data)
  } catch (err) {
    logError('Getting error while searching the system config', err)
    res
      .status((err && err.response && err.response.status) || 500)
      .send((err && err.response && err.response.data) || {
        error: GENERAL_ERROR_MSG,
      })
  }
})

protectedTnc.post('/sbacceptTnc', async (req, res) => {
  try {
    const userToken = String(req.header('Authorization')).replace('bearer ', '')
    const response = await axios.post(
        API_END_POINTS.sbacceptTnc,
          req.body,
          {
              ...axiosRequestConfig,
              headers: {
                'X-Authenticated-User-Token': userToken,
              },
          }
      )
    res.status(response.status).send(response.data)
  } catch (err) {
      logError(err)
      res.status((err && err.response && err.response.status) || 500).send(
          (err && err.response && err.response.data) || {
              error: GENERAL_ERROR_MSG,
          }
      )
  }
})
