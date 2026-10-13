import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'

import { logError, logInfo } from '../utils/logger'

import { CONSTANTS } from '../utils/env'

import { API_END_POINTS } from './apiConstants'
export const customSignUp = Router()

const msgKey = CONSTANTS.MSG91KEY
// Routes
// create account
const MSGERROR = 'MSG91 ERROR'

customSignUp.post('/registerUserWithEmail', async (req, res) => {
  try {
    const newUser = await createKCUser(req)
    if (newUser.data.errorMessage) {
      res.status(500).send({
        error: `Error Creating User : ${newUser.data.errorMessage}`,
      })
    } else {
      res.status(200).json({ message: 'Success' })
    }
  } catch (e) {
    res.status(401).send({
      error: `Error Creating User : ${e}`,
    })
  }
})

customSignUp.post('/registerUserWithMobile', async (req, res) => {
  const mobileNumber = req.body.mobileNumber
  // generate otp
  await sendOTP(mobileNumber)
  res.status(200).json({ message: 'Success' })
  return
})

customSignUp.post('/verifyUserWithMobileNumber', async (req, res) => {
  // body mobileNumber, password/otp
  const otp = req.body.data.otp
  const mobileNumber = req.body.mobileNumber
  const verification = await verifyOTP(mobileNumber, otp)

  if (verification.type === 'success') {
    try {
      const newUser = await createKCUser(req)
      if (newUser.data.errorMessage) {
        res.status(500).send({
          error: `Error Creating User : ${newUser.data.errorMessage}`,
        })
      } else {
        res.status(200).json({ message: 'Success' })
      }
    } catch (e) {
      res.status(401).send({
        error: `Error Creating User : ${e}`,
      })
    }
  } else {
    res.status(401).send({
      error: 'Invalid Otp',
    })
  }
})

// reset password otp
customSignUp.post('/resetPassword', async (req, res) => {
  const username = req.body.username
  const userData = await getUser(username)
  // email or mobile
  if (userData) {
    const type = emailOrMobile(username)
    if (type === 'phone') {
      await sendOTP(username)
      res.status(200).json({ message: 'Success' })
    } else if (type === 'email') {
      // triger email rest password
      await emailactionKC(userData[0].id, 'resetPassword')
      res.status(200).json({ message: 'Success' })
    } else {
      res.status(401).send({
        error: 'Invalid Email/Mobile Number',
      })
    }
  } else {
    res.status(401).send({
      error: 'User Not Found',
    })
  }
})

customSignUp.post('/setPasswordWithOTP', async (req, res) => {
  const username = req.body.username
  const password = req.body.password
  const otp = req.body.otp
  const userData = await getUser(username)
  if (userData) {
    const verification = await verifyOTP(username, otp)
    if (verification.type === 'success') {
      try {
        const userId = userData[0].id

        const status = resetKCPassword(userId, password)
        res.status(200).json({ message: status })
      } catch (e) {
        res.status(500).send({
          error: e.response,
        })
      }
    } else {
      res.status(401).send({
        error: 'Invalid Otp',
      })
    }
  }
})

export function emailOrMobile(value: string) {
  const isValidEmail = emailValidator(value)
  if (isValidEmail) {
    return 'email'
  } else {
    const isValidMobile = mobileValidator(value)
    if (isValidMobile) {
      return 'phone'
    }
  }
  return 'error'
}

export function emailValidator(value: string) {
  // tslint:disable-next-line: max-line-length
  return /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/.test(
    value
  )
}
const mobileValidator = (value: string) => {
  return /^([7-9][0-9]{9})$/.test(value)
}

export async function sendOTP(mobileNumber: string) {
  try {
    mobileNumber = '91' + mobileNumber
    const url = `${API_END_POINTS.sendOTP}?authkey=${msgKey}&template_id=${CONSTANTS.MSG91TEMPLATEID}&mobile=${mobileNumber}&invisible=1`
    return await axios.get(url, axiosRequestConfig)
  } catch (err) {
    logError(MSGERROR, err)
    return 'Error'
  }
}

export async function resendOTP(mobileNumber: string) {
  try {
    mobileNumber = '91' + mobileNumber
    const url = `${API_END_POINTS.resendOTP}?authKey=${msgKey}&mobile=${mobileNumber}`
    return await axios.get(url, axiosRequestConfig)
  } catch (err) {
    logError(MSGERROR, err)
    return 'Error'
  }
}

export async function verifyOTP(mobileNumber: string, otp: string) {
  try {
    mobileNumber = '91' + mobileNumber
    const url = `${API_END_POINTS.verifyOTP}?authkey=${msgKey}&mobile=${mobileNumber}&otp=${otp}`
    const response = await axios.get(url, axiosRequestConfig)
    return response.data
  } catch (err) {
    logError(MSGERROR, err)
    return 'Error'
  }
}

export async function getKCToken() {
  const url = `${CONSTANTS.HTTPS_HOST}/auth/realms/${CONSTANTS.KEYCLOAK_REALM}/protocol/openid-connect/token`
  const params = new URLSearchParams()
  params.append('username', CONSTANTS.KEYCLOAK_ADMIN_USERNAME)
  params.append('password', CONSTANTS.KEYCLOAK_ADMIN_PASSWORD)
  params.append('client_id', 'portal')
  params.append('grant_type', 'password')
  const contentType = 'application/x-www-form-urlencoded'
  const config = {
    headers: {
      // tslint:disable-next-line
      "Content-Type": contentType,
    },
  }

  const resp = await axios.post(url, params, config)

  return resp.data.access_token
}
// tslint:disable-next-line: no-any
export async function createKCUser(req: any) {
  try {
    const token = await getKCToken()

    // tslint:disable-next-line: no-any
    const reqBody: any = {
      credentials: [
        {
          temporary: false,
          type: 'password',
          value: req.body.data.password,
        },
      ],
      enabled: 'true',
      firstName: req.body.data.firstname,
      lastName: req.body.data.lastname,
      username: req.body.data.username,
    }
    if (req.body.type === 'email') {
      reqBody.email = req.body.data.email
    } else {
      reqBody.email = `${req.body.data.username}@aastar.org`
      reqBody.emailVerified = true
    }

    const url = `${CONSTANTS.HTTPS_HOST}/auth/admin/realms/${CONSTANTS.KEYCLOAK_REALM}/users`
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    return await axios.post(url, reqBody, {
      headers,
    })
  } catch (e) {
    return e.response
  }
}

export async function getUser(username: string) {
  try {
    const url = `${CONSTANTS.HTTPS_HOST}/auth/admin/realms/${CONSTANTS.KEYCLOAK_REALM}/users?username=${username}`
    const token = await getKCToken()
    const headers = {
      Authorization: `Bearer ${token}`,
    }
    const response = await axios.get(url, { headers })
    return response.data
  } catch (e) {
    return e.response.data
  }
}

export async function resetKCPassword(userId: string, password: string) {
  try {
    const url = `${CONSTANTS.HTTPS_HOST}/auth/admin/realms/${CONSTANTS.KEYCLOAK_REALM}/users/${userId}/reset-password`
    const body = {
      temporary: false,
      type: 'password',
      value: password,
    }
    const token = await getKCToken()
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
    const resp = await axios.put(url, body, { headers })
    return resp.data
  } catch (e) {
    return e.response.data
  }
}

export async function emailactionKC(userId: string, action: string) {
  const url = `${CONSTANTS.HTTPS_HOST}/auth/admin/realms/${CONSTANTS.KEYCLOAK_REALM}/users/${userId}/execute-actions-email`
  logInfo('Email Token : ', url)
  const token = await getKCToken()
  const headers = {
    Authorization: `Bearer ${token}`,
  }
  let body: string[] = []
  if (action === 'verifyEmail') {
    body = ['VERIFY_EMAIL']
  } else if (action === 'resetPassword') {
    body = ['UPDATE_PASSWORD']
  }
  try {
    const resp = await axios.put(url, body, { headers })
    logInfo('Email Token Response : ' + resp)
    return resp.data
  } catch (e) {
    logError('Error : ' + e)
    return e.response
  }
}
