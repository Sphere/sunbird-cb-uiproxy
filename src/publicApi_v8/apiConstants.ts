import { CONSTANTS } from '../utils/env'

export const API_END_POINTS = {
    // From appCertificateDownload.ts, publicCertifcateFlinkv2.ts
    DOWNLOAD_CERTIFICATE: `${CONSTANTS.HTTPS_HOST}/api/certreg/v2/certs/download/`,

    // From appSignUpWithAutoLogin.ts, emailOrMobileLoginSignIn.ts, signupWithAutoLogin.ts,
    // signupWithAutoLoginOrgForm.ts, signupWithAutoLoginV2.ts
    createUserWithMobileNo: `${CONSTANTS.KONG_API_BASE}/user/v3/create`,
    fetchUserByEmail: `${CONSTANTS.KONG_API_BASE}/user/v1/exists/email/`,
    fetchUserByMobileNo: `${CONSTANTS.KONG_API_BASE}/user/v1/exists/phone/`,
    generateOtp: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/otp/v1/generate`,
    grantAccessToken: `${CONSTANTS.HTTPS_HOST}/auth/realms/sunbird/protocol/openid-connect/token`,
    keycloak_redirect_url: `${CONSTANTS.KEYCLOAK_REDIRECT_URL}`,
    profileUpdate: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/private/v1/update`,
    searchSb: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
    userRoles: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/private/v1/assign/role`,
    verifyOtp: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/otp/v1/verify`,

    // From authorizationV2Api.ts
    generateToken: `${CONSTANTS.HTTPS_HOST}/auth/realms/sunbird/protocol/openid-connect/token`,
    verfifyToken: `${CONSTANTS.HTTPS_HOST}/auth/realms/sunbird/protocol/openid-connect/userinfo`,

    // From bnrcUser.ts, mpNHMUser.ts, upsmfUser.ts
    httpsCreateUser: `${CONSTANTS.HTTPS_HOST}/api/user/v3/create`,
    assignRole: `${CONSTANTS.HTTPS_HOST}/api/user/private/v1/assign/role`,
    migrateUser: `${CONSTANTS.SB_EXT_API_BASE_2}/user/v1/migrate`,
    httpsProfileUpdate: `${CONSTANTS.HTTPS_HOST}/api/user/private/v1/update`,
    userSearch: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,

    // From certificateValidate.ts
    USER_SEARCH: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
    VALIDATE_CERTIFICATE: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/certreg/v1/certs/validate`,

    // From competencyUser.ts
    COMPETENCY_USER: `${CONSTANTS.COMPETENCY_API_BASE}/api/user`,

    // From competencyReporting.ts
    assessmentReports: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/competency/reports/assessment`,
    passbookReports: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/competency/reports/passbook`,

    // From contentSearchService.ts, mobileAppApi.ts
    CONTENT_SEARCH_PROXY: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/content/v1/search`,

    // From courseRecommendation.ts, ratingsSearch.ts
    cbpCourseRecommendation: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/publicSearch/CoursesRecomendationCBP`,
    recommendationAPI: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/course/recommendation`,
    search: `${CONSTANTS.HTTPS_HOST}/apis/public/v8/publicContent/v1/search`,
    searchAPI: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/publicSearch/getcourse`,

    // From customSignup.ts (ES base used for Keycloak user creation)
    esCreateUser: `${CONSTANTS.ES_BASE}`,
    resendOTP: `${CONSTANTS.MSG91BASE}/api/v5/otp/retry`,
    sendOTP: `${CONSTANTS.MSG91BASE}/api/v5/otp`,
    verifyOTP: `${CONSTANTS.MSG91BASE}/api/v5/otp/verify`,

    // From appSignUpWithAutoLogin.ts, signupWithAutoLogin.ts, signupWithAutoLoginV2.ts,
    // signupWithAutoLoginOrgForm.ts, emailOrMobileLoginSignIn.ts
    msg91ResendOtp: `https://control.msg91.com/api/v5/otp/retry`,
    msg91SendOtp: `https://control.msg91.com/api/v5/otp`,
    msg91VerifyOtp: `https://control.msg91.com/api/v5/otp/verify`,

    // From forgotPassword.ts
    recoverPassword: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/password/reset`,

    // From googleSignInRoutes.ts
    createUserWithMailId: `${CONSTANTS.KONG_API_BASE}/user/v3/create`,
    fetchUserByEmailId: `${CONSTANTS.KONG_API_BASE}/user/v1/exists/email/`,
    googleUserRoles: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/api/user/private/v1/assign/role`,

    // From home.ts, searchOrg.ts
    searchAutoComplete: `${CONSTANTS.ES_BASE}`,
    searchV6: `${CONSTANTS.SEARCH_API_BASE}/v6/search`,

    // From maharastraNursingCouncilAuth.ts, maternityFoundationAuth.ts, sashaktAuth.ts,
    // tnaiAuth.ts, tnnmcAuth.ts, tnnmcAuthV2.ts
    createUser: `${CONSTANTS.KONG_API_BASE}/user/v3/create`,

    // From maternityFoundationAuth.ts
    maternityFoundationUserDetailsUrl: CONSTANTS.MATERNITY_FOUNDATION_USER_DETAILS_URL,

    // From mobileAppApi.ts
    CERTIFICATE_DOWNLOAD: `${CONSTANTS.HTTPS_HOST}/api/certreg/v2/certs/download`,
    FORM_API: `${CONSTANTS.FORM_API_BASE}`,
    GET_ALL_ENTITY: `${CONSTANTS.ENTITY_API_BASE}/getAllEntity`,
    GET_ENTITY_BY_ID: `${CONSTANTS.ENTITY_API_BASE}/getEntityById/`,
    GET_LEARNER_PATH: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/learnerpath`,
    NOTIFICATION_ENGINE: `${CONSTANTS.NOTIFICATION_ENGINE_API_BASE}`,
    READ_PROGRESS: `${CONSTANTS.HTTPS_HOST}/api/course/v1/content/state/read`,
    RECOMMENDATION_API: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/course/recommendation`,
    SEARCH_COURSE_SB: `${CONSTANTS.KONG_API_BASE}/content/v1/search`,
    UPDATE_LEARNER_PATH: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/learnerpath`,
    UPDATE_PROGRESS: `${CONSTANTS.HTTPS_HOST}/api/course/v1/content/state/update`,
    formHomeConfig: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/homepageconfig`,
    kongUpdateUser: `${CONSTANTS.KONG_API_BASE}/user/v1/update`,
    ratingLookUp: `${CONSTANTS.SB_EXT_API_BASE_2}/ratings/v1/ratingLookUp`,
    ratingRead: `${CONSTANTS.SB_EXT_API_BASE_2}/ratings/v2/read`,
    ratingUpsert: `${CONSTANTS.SB_EXT_API_BASE_2}/ratings/v1/upsert`,
    rcMapperHost: `${CONSTANTS.RC_MAPPER_HOST}/v1/certificate/getUserCertificateDetails`,
    // tslint:disable-next-line: no-any
    summary: (courseId: any) =>
        `${CONSTANTS.SB_EXT_API_BASE_2}/ratings/v1/summary/${courseId}/Course`,
    telemetryUpdate: `${CONSTANTS.TELEMETRY_SB_BASE}/v1/telemetry`,
    userEnrollmentList: `${CONSTANTS.KONG_API_BASE}/course/v1/user/enrollment/list`,

    // From nodebbUser.ts
    createOrFetchUser: `${CONSTANTS.KONG_API_BASE}/discussion/user/v1/create`,

    // From publicContent.ts, publicSearch.ts, ratingsSearch.ts
    searchv1: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/content/v1/search`,

    // From publicTelemetry.ts
    telemetry: `${CONSTANTS.TELEMETRY_SB_BASE}/v1/telemetry`,

    // From ratingsSearch.ts
    ratingsSearch: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/bulkRatingLookup`,

    // From sashaktAuth.ts
    sashaktUserDetailsUrl: `${CONSTANTS.SASHAKT_USER_DETAILS_URL}`,

    // From tnaiAuth.ts
    tnaiUserDetailsUrl: CONSTANTS.TNAI_USER_DETAILS_URL,

    // From tnc.ts
    tnc: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/latest/terms`,

    // From tnnmcAuth.ts, tnnmcAuthV2.ts
    tnnmcUserDetailsUrl: CONSTANTS.TNNMC_USER_DETAILS_URL,

    // From userDataMigration.ts (uses LEARNER_SERVICE_API_BASE for otp endpoints)
    dataMigrationGenerateOtp: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/otp/v1/generate`,
    dataMigrationVerifyOtp: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/otp/v1/verify`,

    // From userDeactivation.ts (uses KONG_API_BASE)
    deactivationAssignRole: `${CONSTANTS.KONG_API_BASE}/user/private/v1/assign/role`,
    deactivationKongUpdateUser: `${CONSTANTS.KONG_API_BASE}/user/private/v1/update`,
    deactivationUserSearch: `${CONSTANTS.KONG_API_BASE}/user/v1/search`,

    // From userReporting.ts
    certificateDownloads: `${CONSTANTS.USER_REPORTING_SERVICE}/user/certificate/downloads`,
    courseCompletedUsers: `${CONSTANTS.USER_REPORTING_SERVICE}/user/course/completed_users`,
    courseRecommendaion: `${CONSTANTS.USER_REPORTING_SERVICE}/role/course/recommendation`,
    enrolledUserCount: `${CONSTANTS.USER_REPORTING_SERVICE}/user/enroll/user_count`,
    regTotalCount: `${CONSTANTS.USER_REPORTING_SERVICE}/user/reg/total_count`,
    trendingCourses: `${CONSTANTS.USER_REPORTING_SERVICE}/user/top/trendingcourses`,

    // From workallocationPublic.ts
    getWAPdf: (userId: string, waId: string) =>
        `${CONSTANTS.SB_EXT_API_BASE_2}/v1/workallocation/getWAPdf/${userId}/${waId}`,

    // From emailOrMobileLoginSignIn.ts, ssoLogin.ts
    searchUser: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
}
