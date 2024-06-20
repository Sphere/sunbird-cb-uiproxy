import axios from 'axios'
import { Router } from 'express'

import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'
export const adminApiV8 = Router()
const API_END_POINTS = {
    getLeanerCompletedResourceDetails: `${CONSTANTS.SELF_SERVICE_PORTAL_API_BASE}/v1/user/getLeanerCompletedResourceDetails`,
    getLearnerDetails: `${CONSTANTS.SELF_SERVICE_PORTAL_API_BASE}/v1/user/getLearnerDetails`,
}
const errorMessage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unauthorized Access</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background-color: #f8f9fa; /* Light grey background */
    }
    .message-box {
      text-align: center;
      background-color: #fff;
      padding: 30px;
      border-radius: 10px;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
    }
    .message-box h1 {
      color: #ff0000; /* Red color for the error message */
      margin-bottom: 10px;
    }
    .message-box p {
      color: #333;
    }
  </style>
</head>
<body>
  <div class="message-box">
    <h1>Unauthorized Access</h1>
    <p>You are not authorized to view this page or something went wrong. Please try again later.</p>
  </div>
</body>
</html>
`
adminApiV8.get('/v1/user/getLearnerDetails', async (req, res) => {
    try {
        const { authorizationKey } = req.query
        const selfServiceAuthKey = CONSTANTS.SELF_SERVICE_PORTAL_AUTH_KEY
        if (!authorizationKey || (authorizationKey != selfServiceAuthKey)) {
            return res.status(403).send(errorMessage)
        }
        const response = await axios({
            method: 'GET',
            params: req.query,
            url: API_END_POINTS.getLearnerDetails,
        })
        res.status(200).send(response.data)
    } catch (error) {
        logInfo(JSON.stringify(error))
        return res.status(403).send(errorMessage)
    }
})
adminApiV8.get('/v1/user/getLeanerCompletedResourceDetails', async (req, res) => {
    try {
        const { authorizationKey } = req.query
        const selfServiceAuthKey = CONSTANTS.SELF_SERVICE_PORTAL_AUTH_KEY
        if (!authorizationKey || (authorizationKey != selfServiceAuthKey)) {
            return res.status(403).send(errorMessage)
        }
        const response = await axios({
            method: 'GET',
            params: req.query,
            url: API_END_POINTS.getLeanerCompletedResourceDetails,
        })
        res.status(200).send(response.data)
    } catch (error) {
        logInfo(JSON.stringify(error))
        return res.status(403).send(errorMessage)
    }
})
