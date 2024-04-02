import express from 'express'
import { CONSTANTS } from '../utils/env'
import { proxyCreatorRoute } from '../utils/proxyCreator'
import { appCertificateDownload } from './appCertificateDownload'
import { appSignUpWithAutoLogin } from './appSignUpWithAutoLogin'
import { validateCertificate } from './certificateValidate'
import { competencyReporting } from './competencyReporting'
import { publicCompetencyUser } from './competencyUser'
import { customSignUp } from './customSignup'
import { emailOrMobileLogin } from './emailOrMobileLoginSignIn'
import { forgotPassword } from './forgotPassword'
import { googleAuth } from './googleSignInRoutes'
import { homePage } from './home'
import { mobileAppApi } from './mobileAppApi'
import { publicCertificateFlinkv2 } from './publicCertifcateFlinkv2'
import { publicContentApi } from './publicContent'
import { publicSearch } from './publicSearch'
import { publicTelemetry } from './publicTelemetry'
import { sashakt } from './sashaktAuth'
import { signup } from './signup'
import { signupWithAutoLogin } from './signupWithAutoLogin'
import { signupWithAutoLoginV2 } from './signupWithAutoLoginV2'

import { competencyAssets } from './competencyAssets'
import { maternityFoundationAuth } from './maternityFoundationAuth'
import { ssoLogin } from './ssoLogin'
import { tnaiAuth } from './tnaiAuth'
import { publicTnc } from './tnc'
import { deactivateUser } from './userDeactivation'
import { userOtp } from './userOtp'
import { userReporting } from './userReporting'
export const publicApiV8 = express.Router()

publicApiV8.get('/', (_req, res) => {
  res.json({
    status: `Public Api is working fine https base: ${CONSTANTS.HTTPS_HOST}`,
  })
})

publicApiV8.use(
  '/assets',
  proxyCreatorRoute(
    express.Router(),
    CONSTANTS.WEB_HOST_PROXY + '/web-hosted/web-client-public-assets'
  )
)
publicApiV8.use('/competency', publicCompetencyUser)
publicApiV8.use('/tnc', publicTnc)
publicApiV8.use('/signup', signup)
publicApiV8.use('/signupWithAutoLogin', signupWithAutoLogin)
publicApiV8.use('/signupWithAutoLoginV2', signupWithAutoLoginV2)

publicApiV8.use('/homePage', homePage)
publicApiV8.use('/register/', customSignUp)
publicApiV8.use('/emailMobile/', emailOrMobileLogin)
publicApiV8.use('/google/', googleAuth)
publicApiV8.use('/forgot-password/', forgotPassword)
publicApiV8.use('/publicContent/', publicContentApi)
publicApiV8.use('/login/', emailOrMobileLogin)
publicApiV8.use('/certificate/', validateCertificate)
publicApiV8.use('/sashaktAuth/', sashakt)
publicApiV8.use('/appCertificateDownload/', appCertificateDownload)
publicApiV8.use('/publicCertificateFlinkv2/', publicCertificateFlinkv2)
publicApiV8.use('/mobileApp/', mobileAppApi)
publicApiV8.use('/publicSearch/', publicSearch)
publicApiV8.use('/publicTelemetry/', publicTelemetry)
publicApiV8.use('/competencyAssets/', competencyAssets)
publicApiV8.use('/competencyReporting/', competencyReporting)
publicApiV8.use('/appSignUpWithAutoLogin', appSignUpWithAutoLogin)
publicApiV8.use('/maternityFoundation', maternityFoundationAuth)
publicApiV8.use('/userReporting', userReporting)
publicApiV8.use('/deactivateUser', deactivateUser)
publicApiV8.use('/testUserOtp', userOtp)
publicApiV8.use('/ssoLogin', ssoLogin)
publicApiV8.use('/tnai', tnaiAuth)
