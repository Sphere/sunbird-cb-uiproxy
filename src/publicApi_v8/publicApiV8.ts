import express from 'express'
import { CONSTANTS } from '../utils/env'
import { proxyCreatorRoute } from '../utils/proxyCreator'
import { customSignUp } from './customSignup'
import { forgotPassword } from './forgotPassword'
import { googleAuth } from './googleSignInRoutes'
import { homePage } from './home'
import { signup } from './signup'
import { publicTnc } from './tnc'

export const publicApiV8 = express.Router()

publicApiV8.get('/', (_req, res) => {
  res.json({
    status: `Public Api is working fine https base: ${CONSTANTS.HTTPS_HOST}`,
  })
})

publicApiV8.use('/assets',
  proxyCreatorRoute(express.Router(), CONSTANTS.WEB_HOST_PROXY + '/web-hosted/web-client-public-assets'))

publicApiV8.use('/tnc', publicTnc)
publicApiV8.use('/signup', signup)
publicApiV8.use('/homePage', homePage)
publicApiV8.use('/register/', customSignUp)
publicApiV8.use('/google/', googleAuth)
publicApiV8.use('/forgot-password/', forgotPassword)
