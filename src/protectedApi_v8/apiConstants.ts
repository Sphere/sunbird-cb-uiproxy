import { CONSTANTS } from '../utils/env'

const REGISTRATION_BASE = `${CONSTANTS.SB_EXT_API_BASE_2}/v1/content-sources`
export const API_END_POINTS = {
    // From bulkExtendedMethod.ts
    kongUpdateUser: `${CONSTANTS.KONG_API_BASE}/user/private/v1/update`,
    // From bulkUpload.ts
    assignRoleforBulkUsers: `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/v1/role/assign`,
    createUserOfBulkUpload: `${CONSTANTS.KONG_API_BASE}/user/v3/create`,
    kongSendWelcomeEmail: `${CONSTANTS.KONG_API_BASE}/private/user/v1/notification/email`,
    kongUserResetPassword: `${CONSTANTS.KONG_API_BASE}/private/user/v1/password/reset`,
    // From bulkUserSsoMapping.ts
    kongUserSearch: `${CONSTANTS.KONG_API_BASE}/user/v1/search`,

    // From registration.ts
    deregisterUsers: (source: string) =>
        `${REGISTRATION_BASE}/${source}/deregistered-users`,
    getDepartment: `${CONSTANTS.USER_PROFILE_API_BASE}/user/department`,
    listUsers: (source: string) => `${REGISTRATION_BASE}/${source}/users`,
    registrationStatus: REGISTRATION_BASE,
    updateDepartment: `${CONSTANTS.USER_PROFILE_API_BASE}/user/department/update`,

    // From roles.ts
    getRoles: `${CONSTANTS.SB_EXT_API_BASE_4}/v1/user`,
    getRolesDescription: `${CONSTANTS.ROLES_API_BASE}/v2/all-roles`,
    updateRoles: `${CONSTANTS.ROLES_API_BASE}/v1/update/roles`,

    // From aiService.ts
    bhashiniIntefrancePipeline: `${CONSTANTS.DHURVA_BHASHINI_API_BASE}/services/inference/pipeline`,
    generateUUID: `${CONSTANTS.JUGALBANDI_API_BASE}/upload-files`,
    getModelsPipeline: `${CONSTANTS.MEITY_AUTH_ULCACONTRIB}/ulca/apis/v0/model/getModelsPipeline`,
    querywWithLangchainGpt: `${CONSTANTS.JUGALBANDI_API_BASE}/query-with-langchain-gpt3-5`,

    // From categories.ts
    getAllCategories: `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/categories`,
    // tslint:disable-next-line: no-any
    getCategoryDetails: (cid: any, slug?: any, tid?: any) => {
        let url = `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/category/${cid}`
        if (slug) {
            url = `${url}/${slug}`
        }
        if (tid) {
            url = `${url}/${tid}`
        }
        return url
    },

    // From notifications.ts
    getNotifications: `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/notifications`,
    
    // From posts.ts
    getPosts: (term: string) => `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/recent/posts/${term}`,

    // From tags.ts
    getTagTopics: (tagName: string) => `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/tags/${tagName}`,
    getTags: `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/tags`,

    // From topics.ts
    getPopularTopics: `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/popular`,
    getRecentTopics: `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/recent`,
    getTopTopics: `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/top`,
    getUnreadTopics: `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/unread`,
    getUnreadTopicsTotal: `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/unread/total`,
    // tslint:disable-next-line: object-literal-sort-keys
    getTopicDetails: (tid: number) => `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/topic/${tid}`,

    // From users.ts
    getUserBookmarks: (slug: string) =>
    `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/user/${slug}/bookmarks`,
    getUserDownvotedPosts: (slug: string) =>
    `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/user/${slug}/downvoted`,
    getUserGroups: (slug: string) =>
    `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/user/${slug}/groups`,
    getUserInfo: (slug: string) =>
    `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/user/${slug}/info`,
    getUserPosts: (slug: string) =>
    `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/user/${slug}/posts`,
    getUserProfile: (slug: string) =>
    `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/user/${slug}`,
    getUserUpvotedPosts: (slug: string) =>
    `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/user/${slug}/upvoted`,
    getUsersWatchedTopics: (slug: string) =>
    `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/user/${slug}/watched`,
    // tslint:disable-next-line: object-literal-sort-keys
    getUserByEmail: (email: string) =>
    `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/user/email/${email}`,
    getUserByUsername: (username: string) =>
    `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/user/username/${username}`,

    // From writeApi.ts
    createTopic: `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/v2/topics`,
    createUser: `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/v2/users`,
    // tslint:disable-next-line: object-literal-sort-keys
    createOrUpdateTags: (topicId: string | number) =>
        `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/v2/topics/${topicId}/tags`,
    followTopic: (topicId: string | number) =>
        `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/v2/topics/${topicId}/follow`,
    replyToTopic: (topicId: string | number) =>
        `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/v2/topics/${topicId}`,
    votePost: (postId: string | number) =>
        `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/v2/posts/${postId}/vote`,
    // tslint:disable-next-line: object-literal-sort-keys
    bookmarkPost: (postId: string | number) =>
        `${CONSTANTS.DISCUSSION_HUB_API_BASE}/api/v2/posts/${postId}/bookmark`,

    // From accessControl.ts
    contents: `${CONSTANTS.ACCESS_CONTROL_API_BASE}/accesscontrol/user`,

    // From account-settings.ts
    accountSettings: `${CONSTANTS.NODE_API_BASE}/userprofiles/pathfinders/upsert`,
    resetPassword: `${CONSTANTS.RESET_PASSWORD}/pid/reset-password/generate-token`,
    viewProfile: `${CONSTANTS.NODE_API_BASE}/userprofiles/pathfinders/viewprofile`,

    // From activity.ts
    activities: (userId: string) =>
        `${CONSTANTS.SB_EXT_API_BASE_3}/v1/activities/user/${userId}`,

    // From admin-users.ts
    createuser: `${CONSTANTS.USER_CREATE_API_BASE}/users`,

    // From auto-complete.ts
    users: (queryParams: string) =>
    `${CONSTANTS.KONG_API_BASE}/v1/user/autocomplete?${queryParams}`,
    usersByDepartment: (rootOrg: string, searchItem: string) =>
        `${CONSTANTS.USER_PROFILE_API_BASE}/user/autocomplete/${rootOrg}/department/${searchItem}`,

    // From badge.ts
    badge: `${CONSTANTS.SB_EXT_API_BASE_2}/v3/users`,
    newBadges: (userId: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/v1/users/${userId}/badges`,
    updateBadge: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/User`,

    // From changeEmail.ts
    changeEmail: (userId: string, metaType: string) =>
        `${CONSTANTS.USER_PROFILE_API_BASE}/user/${userId}/${metaType}`,

    // From classDiagram.ts
    submission: `${CONSTANTS.SUBMISSION_API_BASE}/v1/users`,

    // From code.ts
    execute: `${CONSTANTS.IAP_CODE_API_BASE}/backend/Code/Compile`,
    verify_submit_base: `${CONSTANTS.SUBMISSION_API_BASE}/v1/users`,
    view_last_submission_base: `${CONSTANTS.SUBMISSION_API_BASE}/v1/users`,

    // From content-assign.ts
    assignContent: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/assign-content`,
    getAssignments: (userId: string) =>
        `${CONSTANTS.SB_EXT_API_BASE_2}/v1/content-assignee/${userId}/content-assignments`,
    searchUsers: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/user-search`,
    userAdminLevel: (userId: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/v1/users/${userId}/admin-level`,

    // From content.ts
    assignedContent: (userId: string) =>
        `${CONSTANTS.SB_EXT_API_BASE_2}/v1/users/${userId}/assigned-content`,
    contentLikeNumber: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/likes-count`,
    like: (userId: string) => `${CONSTANTS.LIKE_API_BASE}/v1/user/${userId}/likes`,

    // From dashboard.ts
    analytics: CONSTANTS.USER_ANALYTICS,
    childProgress: CONSTANTS.TELEMETRY_API_BASE + '/user/dashboard/courses/details',
    dashboard: CONSTANTS.TELEMETRY_API_BASE + '/user/dashboard',
    progress: CONSTANTS.SB_EXT_API_BASE + '/v2/users',
    progress_history: `${CONSTANTS.LEARNING_HISTORY_API_BASE}/v3/users`,
    timeSpent: `${CONSTANTS.TIMESPENT_API_BASE}` + '/v3/users',

    // From details.ts
    detail: `${CONSTANTS.USER_PROFILE_API_BASE}/user/multi-fetch/wid`,
    emailId: `${CONSTANTS.USER_PROFILE_API_BASE}/user/multi-fetch/email`,
    managerDetails: `${CONSTANTS.USER_PROFILE_API_BASE}/user`,
    pidProfile: `${CONSTANTS.USER_PROFILE_API_BASE}/user/get-update`,

    // From email.ts
    email: CONSTANTS.SB_EXT_API_BASE + '/v1/Notification/Send',

    // From emailToUserId.ts
    emailToUserId: CONSTANTS.SB_EXT_API_BASE + '/v1/user/finduuid?userEmail=',

    // From evaluate.ts
    assessmentSubmitV2: `${CONSTANTS.SB_EXT_API_BASE_2}/v2/user`,
    iapSubmitAssessment: `${CONSTANTS.SB_EXT_API_BASE_2}/v3/iap-assessment`,
    postAssessment: `${CONSTANTS.POST_ASSESSMENT_BASE}/lmsapi/v1/post_assessment`,

    // From exercise.ts
    createContentDirectory: (contentId: string) =>
    `${CONSTANTS.CONTENT_API_BASE}/content/submissions/${contentId}`,
    postSubmission: (contentId: string, uuId: string) =>
        `${CONSTANTS.SUBMISSION_API_BASE}/v1/users/${uuId}/exercises/${contentId}/submissions`,
    submissionData: `${CONSTANTS.SB_EXT_API_BASE_3}/v1/users`,
    uploadFile: (contentId: string) =>
        `${CONSTANTS.CONTENT_API_BASE}/content/submissions/${contentId}/artifacts`,

    // From feedback.ts
    feedback: CONSTANTS.SB_EXT_API_BASE + '/v1/course/feedback/add/', 

    // From feedbackV2.ts
    feedback_v1: `${CONSTANTS.FEEDBACK_API_BASE}/v1`,

    // From follow.ts
    follow: `${CONSTANTS.NODE_API_BASE}/follow`,
    followers: `${CONSTANTS.NODE_API_BASE}/getFollowers`,
    getAll: `${CONSTANTS.NODE_API_BASE}/getAll`,
    getFollowers: `${CONSTANTS.NODE_API_BASE}/getfollowersv2`,
    getFollowersv3: `${CONSTANTS.NODE_API_BASE}/getfollowersv3`,
    getFollowing: `${CONSTANTS.NODE_API_BASE}/getfollowing`,
    getFollowingv3: (isIntranet: boolean, isStandAlone: boolean) =>
    `${CONSTANTS.NODE_API_BASE}/getfollowingv3?isIntranet=${isIntranet}&isStandAlone=${isStandAlone}`,
    unFollow: `${CONSTANTS.NODE_API_BASE}/unfollow`,

    // From goals.ts
    acceptRejectGoal: (userId: string, id: string, action: string) =>
    `${CONSTANTS.GOALS_API_BASE}/v1/users/${userId}/goals/${id}/actions?action=${action}`,
    actionRequired: (userId: string, sourceFields: string) =>
        `${CONSTANTS.GOALS_API_BASE}/v2/users/${userId}/goals-For-Action?sourceFields=${sourceFields}`,
    addContentToGoal: (userId: string, id: string, contentId: string, goalType: string) =>
        `${CONSTANTS.GOALS_API_BASE}/v3/users/${userId}/goals/${id}/contents/${contentId}?goal_type=${goalType}`,
    common: (userId: string, groupId: string) =>
        `${CONSTANTS.GOALS_API_BASE}/v1/users/${userId}/common-goals/${groupId}`,
    createUpdateGoal: (userId: string) => `${CONSTANTS.GOALS_API_BASE}/v4/users/${userId}/goals`,
    deleteUserForSharedGoal: (userId: string, goalId: string, type: string) =>
        `${CONSTANTS.GOALS_API_BASE}/v2/users/${userId}/goals/${goalId}/recipients/unshare?goal_type=${type}`,
    deleteUserGoal: (userId: string, goalId: string, type: string) =>
        `${CONSTANTS.GOALS_API_BASE}/v3/users/${userId}/goals/${goalId}?goal_type=${type}`,
    getGoalForOthers: (userId: string, sourceFields: string) =>
        `${CONSTANTS.GOALS_API_BASE}/v2/users/${userId}/goals-for-others?sourceFields=${sourceFields}`,
    getUserGoals: (userId: string, type: string, sourceFields: string) =>
        `${CONSTANTS.GOALS_API_BASE}/v5/users/${userId}/goals?goal_type=${type}&sourceFields=${sourceFields}`,
    goalGroups: (userId: string) => `${CONSTANTS.GOALS_API_BASE}/v1/users/${userId}/goal-groups`,
    removeContentFromGoal: (userId: string, id: string, contentId: string, goalType: string) =>
        `${CONSTANTS.GOALS_API_BASE}/v3/users/${userId}/goals/${id}/contents/${contentId}?goal_type=${goalType}`,
    share: (userId: string, goalId: string, type: string) =>
        `${CONSTANTS.SB_EXT_API_BASE_2}/v1/users/${userId}/goals/${goalId}/recipients?type=${type}`,
    sharev2: (userId: string, goalId: string, type: string) =>
        `${CONSTANTS.GOALS_API_BASE}/v2/users/${userId}/goals/${goalId}/recipients?type=${type}`,
    track: (userId: string, goalId: string, type: string) =>
        `${CONSTANTS.GOALS_API_BASE}/v2/users/${userId}/goals/${goalId}?goal_type=${type}`,
    updateDurationCommonGoal: (userId: string, id: string, type: string, duration: string) =>
        `${CONSTANTS.GOALS_API_BASE}/v3/users/${userId}/common-goals/${id}?goal_type=${type}&duration=${duration}`,

    // From group.ts
    searchV6: `${CONSTANTS.SB_EXT_API_BASE}/v6/search`,
    userGroup: (userId: string) => `${CONSTANTS.USER_PROFILE_API_BASE}/user/${userId}/groups`,

    // From history.ts
    continueGet: (userId: string) =>
        `${CONSTANTS.CONTINUE_LEARNING_API_BASE}/v1/continue/user/${userId}/getdata`,
    continuePut: (userId: string) =>
        `${CONSTANTS.CONTINUE_LEARNING_API_BASE}/v1/continue/user/${userId}/putdata`,

    // From iconBadge.ts
    unreadNotificationCount: CONSTANTS.NOTIFICATIONS_API_BASE + '/v1/users',

    // From mandatoryContent.ts
    mandatoryContentStatus: `${CONSTANTS.KONG_API_BASE}/v1/check/mandatoryContentStatus`,
    
    // From miniProfile.ts
    viewprofile: `${CONSTANTS.NODE_API_BASE}/userprofiles/pathfinders/viewprofile`,

    // From notifications.ts
    notifications: `${CONSTANTS.NOTIFICATIONS_API_BASE}/v1`,
    settings: (userId: string) => `${CONSTANTS.NOTIFICATIONS_API_BASE}/v1/users/${userId}/events`,    
    
    // From ocm.ts
    user: CONSTANTS.SB_EXT_API_BASE + '/v1/users/',

    // From playlist.ts
    playlist: (userId: string, playlistId: string) =>
    `${CONSTANTS.PLAYLIST_API_BASE}/v1/users/${userId}/playlist/${playlistId}`,
    playlistV1: (userId: string) => `${CONSTANTS.PLAYLISTV1_API_BASE}/v1/users/${userId}`,

    // From preference.ts
    preferences: `${CONSTANTS.PREFERENCE_API_BASE}/v1/user`,

    // From profile.ts
    completeUserInfo: `${CONSTANTS.DECRYPTION_API_BASE}/user_search`,
    createOSUserRegistry: (userId: string) =>
        `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/v1/user/create/profile?userId=${userId}`,
    createSb: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/v1/user/signup`,
    createUserRegistry: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/createUserRegistry`,
    getMasterLanguages: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/getMasterLanguages`,
    getMasterNationalities: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/getMasterNationalities`,
    getOSUserRegistryById: (userId: string) =>
        `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/v1/user/search/profile?userId=${userId}`,
    getProfilePageMeta: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/getProfilePageMeta`,
    getUserRegistry: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/getUserRegistry`,
    getUserRegistryById: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/getUserRegistryById`,
    kongCreateUser: `${CONSTANTS.KONG_API_BASE}/user/v3/create`,
    kongSearchUser: `${CONSTANTS.KONG_API_BASE}/user/v1/search`,
    kongUserRead: (userId: string) =>
        `${CONSTANTS.KONG_API_BASE}/user/v1/read/${userId}`,
    // tslint:disable-next-line: object-literal-sort-keys
    migrateRegistry: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/migrateRegistry`,
    passwordReset: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/password/reset`,
    searchSb: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
    sendWelcomeEmail: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/notification/email`,
    setUserProfileStatus: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/setUserProfileStatus`,
    telemetryUpdate: `${CONSTANTS.TELEMETRY_SB_BASE}/v1/telemetry`,

    updateOSUserRegistry: (userId: string) =>
        `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/v1/user/update/profile?userId=${userId}`,
    userProfileStatus: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/profileDetails/userProfileStatus`,
    userRead: (userId: string) =>
        `${CONSTANTS.SUNBIRD_PROXY_API_BASE}/user/v2/read/${userId}`,

    // From profile-registry.ts
    createUserRegistryprofile: (userId: string) =>
    `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/v1/user/create/profile?userId=${userId}`,
    getprofileRegistry: `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/v1/user/get/profile`,
    getprofileRegistryById: (userId: string) =>
        `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/v1/user/search/profile?userId=${userId}`,
    searchUserRegistry: `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/v1/user/search/profile`,
    updateUserRegistry: (userId: string) =>
        `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/v1/user/update/profile?userId=${userId}`,
    updateUserWorkflowRegistry: (userId: string) =>
        `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/v1/user/update/workflow/profile?userId=${userId}`,


    // profile.ts
    create: `${CONSTANTS.SB_EXT_API_BASE}/v1/user/createUser`,
    details: `${CONSTANTS.USER_DETAILS_API_BASE}/user`,
    graph: `${CONSTANTS.SB_EXT_API_BASE}/v1/Users`,
    graphV2: `${CONSTANTS.SB_EXT_API_BASE}/v2/Users`,

    // From progress.ts
    hash: (userId: string) =>
        `${CONSTANTS.LEARNING_HISTORY_API_BASE}/v3/users/${userId}/contentlist/progress`,
    progressMeta: (userId: string, contentId: string) => {
        return `${CONSTANTS.PROGRESS_API_BASE}/v1/users/${userId}/content-ids/${contentId}/progress-meta`
    },

    // From rating.ts
    contentRating: (contentId: string, userId: string) =>
        `${CONSTANTS.RATING_API_BASE}/v1/contents/${contentId}/users/${userId}/ratings`,
    contentsRating: `${CONSTANTS.RATING_API_BASE}/v1/contents/average-rating`,

    // From rc-certificate.ts
    rcMapperHost: `${CONSTANTS.RC_MAPPER_HOST}/v1/certificate/getUserCertificateDetails`,
    userEnrollmentList: `${CONSTANTS.KONG_API_BASE}/course/v1/user/enrollment/list`,

    // From rdbms.ts
    conceptData: `${CONSTANTS.VIEWER_PLUGIN_RDBMS_API_BASE}/v1/db/conceptdata/resources`,
    executeUser: `${CONSTANTS.VIEWER_PLUGIN_RDBMS_API_BASE}/v1/users`,

    // From realTimeProgress.ts
    progressUpdate: `${CONSTANTS.PROGRESS_API_BASE}` + '/v1/users',

    // From roles.ts
    role: `${CONSTANTS.ROLES_API_BASE}/v1/user/roles`,
    rolesV2: `${CONSTANTS.ROLES_API_BASE}/v2/roles`,

    // From share.ts
    GET_SHARED: (userId: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/v1/users/${userId}/share`,
    SHARE: CONSTANTS.SB_EXT_API_BASE + '/v1/Notification/Send',
    SHARE_CONTENT: CONSTANTS.NOTIFICATIONS_API_BASE + '/v1/notification/event',
    SHARE_V1: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/content-share`,

    // From skills.ts
    read: `${CONSTANTS.AUTHORING_BACKEND}/action/meta/v1/skills`,

    // From telemetry.ts
    telemetry: `${CONSTANTS.TELEMETRY_SB_BASE}/v1/telemetry`,

    // From tnc.ts
    acceptTnC: `${CONSTANTS.TNC_API_BASE}/v1/terms/accept`,
    sbacceptTnc: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/v1/user/tnc/accept`,
    systemConfigEndPoint: (configName: string) => `${CONSTANTS.LEARNER_SERVICE_API_BASE}/v1/system/settings/get/${configName}`,
    tnc: `${CONSTANTS.TNC_API_BASE}/v1/latest/terms`,
    tncPostProcessing: (userId: string) =>
    `${CONSTANTS.SB_EXT_API_BASE}/v1/user/${userId}/postprocessing`,

    // From token.ts
    tokenWithCode: `${CONSTANTS.CONTENT_API_BASE}/user-access-token?code=`,
    tokenWithEmail: `${CONSTANTS.CONTENT_API_BASE}/access-token?email=`,

    // From topic.ts
    autocomplete: `${CONSTANTS.ES_BASE}/lex_topic/_search`,
    recommend: `${CONSTANTS.SB_EXT_API_BASE}/v1/topics/recommended?q=new`,

    // From topics.ts
    add: `${CONSTANTS.SB_EXT_API_BASE}/v1/user/topic/add`,
    autocompleteinterest: `${CONSTANTS.INTEREST_API_BASE}/v1/interests/auto`,
    interestV2: `${CONSTANTS.INTEREST_API_BASE}/v1/users`,
    modify: `${CONSTANTS.INTEREST_API_BASE}/v2/users`,
    multiple: `${CONSTANTS.INTEREST_API_BASE}/v3/users`,
    topicRead: `${CONSTANTS.SB_EXT_API_BASE}/v1/user/topic/read`,

    // From viewprofile.ts
    viewProfileOwn: `${CONSTANTS.NODE_API_BASE}/userprofiles/pathfinders/viewprofile`,

    // From attendent-content.ts
    attendedCourses: (userId: string, sourceFields?: string) =>
        `${CONSTANTS.ATTENDANCE_API_BASE}/v1/users/${userId}/attended-content?source_fields=${sourceFields}`,
    attendedUsers: (contentId: string) =>
        `${CONSTANTS.ATTENDANCE_API_BASE}/v1/content/${contentId}/attended-users`,
    verifyAttendedUsers: (userId: string, contentIds: string) =>
        `${CONSTANTS.ATTENDANCE_API_BASE}/v1/users/${userId}/verify-attendence?content_id=${contentIds}`,

    // From autoEnrollmentv2.ts
    autoenrollment: (userId: any, courseId: any) =>
        `${CONSTANTS.COHORTS_API_BASE}/v1/autoenrollment/${userId}/${courseId}`,

    // From catalog.ts
    getCatalogEndPoint: `${CONSTANTS.KONG_API_BASE}/v1/catalog/`,

    // From cbExtRatings.ts
    ratingLookUp: `${CONSTANTS.SB_EXT_API_BASE_2}/ratings/v1/ratingLookUp`,
    ratingRead: `${CONSTANTS.SB_EXT_API_BASE_2}/ratings/v2/read`,
    ratingUpsert: `${CONSTANTS.SB_EXT_API_BASE_2}/ratings/v1/upsert`,
    ratingSummary: (courseId: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/ratings/v1/summary/${courseId}/Course`,

    // From certifications.ts
    certifications: `${CONSTANTS.LEARNING_HUB_API_BASE}/lHub`,
    trainings: `${CONSTANTS.LEARNING_HUB_API_BASE}/lHub/v1`,

    // From cohorts.ts
    cohorts: `${CONSTANTS.COHORTS_API_BASE}/v2/resources`,
    groupCohorts: (groupId: number) => `${CONSTANTS.USER_PROFILE_API_BASE}/groups/${groupId}/users `,
    hierarchyApiEndPoint: (contentId: string) => `${CONSTANTS.KNOWLEDGE_MW_API_BASE}/action/content/v3/hierarchy/${contentId}?hierarchyType=detail`,

    // From competency.ts
    addCompetency: `${CONSTANTS.FRAC_API_BASE}/api/frac/addDataNode`,
    getCompetency: `${CONSTANTS.FRAC_API_BASE}/api/frac/getAllNodes?type=COMPETENCY&status=VERIFIED`,
    searchCompetency: `${CONSTANTS.FRAC_API_BASE}/api/frac/searchNodes`,

    // From concept.ts
    conceptAutoComplete: `${CONSTANTS.NODE_API_BASE}/post/autocomplete`,
    concepts: `${CONSTANTS.SB_EXT_API_BASE}/concepts`,

    // From connections.ts
    getConnectionEstablishedData: `${CONSTANTS.KONG_API_BASE}/connections/profile/fetch/established`,
    getConnectionRequestsData: `${CONSTANTS.KONG_API_BASE}/connections/profile/fetch/requested`,
    getConnectionRequestsReceivedData: `${CONSTANTS.KONG_API_BASE}/connections/profile/fetch/requests/received`,
    getConnectionSuggestsData: `${CONSTANTS.KONG_API_BASE}/connections/profile/find/suggests`,
    postConnectionAddData: `${CONSTANTS.KONG_API_BASE}/connections/add`,
    postConnectionRecommendationData: `${CONSTANTS.KONG_API_BASE}/connections/profile/find/recommended`,
    postConnectionUpdateData: `${CONSTANTS.KONG_API_BASE}/connections/update`,

    // From content.ts
    addHierarchy: (apiType: string) => `${CONSTANTS.AUTHORING_BACKEND}/action/content/kb/${apiType}`,
    contentParent: (contentId: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/v1/contents/parents/${contentId}`,
    externalContentAccess: (contentId: string, userId: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/v1/sources/${contentId}/users/${userId}`,
    fetchApi: (rootOrg?: string) => `${CONSTANTS.CONTENT_META_FETCH_API_BASE}/fetch/${rootOrg}`,
    hierarchy: (contentId: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/v1/content/hierarchy/${contentId}`,
    modifyKB: (apiType: string) => `${CONSTANTS.AUTHORING_BACKEND}/action/content/v2/kb/${apiType}`,
    contentMetas: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/content/metas`,
    next: `${CONSTANTS.NODE_API_BASE_3}/api/v1/moreLikeThis`,
    contentParentBase: `${CONSTANTS.SB_EXT_API_BASE}/v1`,
    removeSubset: `${CONSTANTS.GOALS_API_BASE}/v4/users/goals/resources`,
    reorderV3: `${CONSTANTS.AUTHORING_BACKEND}/action/content/v3/kb/reorder`,
    contentSearchAutoComplete: `${CONSTANTS.ES_BASE}`,
    searchV4: `${CONSTANTS.SB_EXT_API_BASE}/search4`,
    searchV5: `${CONSTANTS.SEARCH_API_BASE}/search5`,
    contentSearchV6: `${CONSTANTS.SEARCH_API_BASE}/v6/search`,
    setS3Cookie: `${CONSTANTS.CONTENT_API_BASE}/contentv3/cookie`,
    updateHierarchy: `${CONSTANTS.AUTHORING_BACKEND}/action/content/hierarchy/update`,

    // From contentValidation.ts
    checkPdfProfanity: `${CONSTANTS.CONTENT_VALIDATION_API_BASE}/contentValidation/v1/checkPdfProfanity`,
    checkProfanity: (contentId: string, userId: string) =>
        `${CONSTANTS.CONTENT_VALIDATION_API_BASE}/contentValidation/v1/checkProfanity/${contentId}/${userId}`,
    checkTextProfanity: `${CONSTANTS.PROFANITY_SERVICE_API_BASE}/checkProfanity`,
    getPdfProfanity: `${CONSTANTS.KONG_API_BASE}/contentValidation/v1/getPdfProfanity`,
    getPdfProfanityForContent: (contentId: string) =>
        `${CONSTANTS.KONG_API_BASE}/contentValidation/v1/getPdfProfanityForContent/${contentId}`,
    startPdfProfanity: `${CONSTANTS.KONG_API_BASE}/contentValidation/v1/startPdfProfanity`,

    // From departments.ts
    getAllDepartment: `${CONSTANTS.SB_EXT_API_BASE_2}/portal/getAllDept`,
    searchDepartment: (friendlyName: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/portal/deptSearch?friendlyName=${friendlyName}`,

    // From entityCompetency.ts
    addEntities: `${CONSTANTS.ENTITY_API_BASE}/addEntities`,
    addEntityRelation: `${CONSTANTS.ENTITY_API_BASE}/addEntityRelation`,
    addUpdateEntity: `${CONSTANTS.ENTITY_API_BASE}/addUpdateEntity`,
    getAllEntity: `${CONSTANTS.ENTITY_API_BASE}/getAllEntity`,
    getEntityById: `${CONSTANTS.ENTITY_API_BASE}/getEntityById/`,
    reviewEntity: `${CONSTANTS.ENTITY_API_BASE}/reviewEntity`,

    // From events.ts
    liveEvents: `${CONSTANTS.CONTENT_API_BASE}/live-events`,

    // From frac.ts
    addDataNode: `${CONSTANTS.FRAC_API_BASE}/fracapis/frac/addDataNode`,
    addDataNodeBulk: `${CONSTANTS.FRAC_API_BASE}/fracapis/frac/addDataNodeBulk`,
    getActivity: `${CONSTANTS.FRAC_API_BASE}/fracapis/frac/getAllNodes?type=ACTIVITY&status=VERIFIED`,
    getCompetencyArea: `${CONSTANTS.FRAC_API_BASE}/fracapis/frac/getAllNodes?type=COMPETENCYAREA`,
    getDictionary: `${CONSTANTS.FRAC_API_BASE}/fracapis/frac/getAllNodes?type=COMPETENCY&status=VERIFIED`,
    getNodeById: (id: string, type: string) => `${CONSTANTS.FRAC_API_BASE}/fracapis/frac/getNodeById?id=${id}&type=${type}&isDetail=true`,
    getRole: `${CONSTANTS.FRAC_API_BASE}/fracapis/frac/getAllNodes?type=ROLE&status=VERIFIED`,
    searchNodes: `${CONSTANTS.FRAC_API_BASE}/fracapis/frac/searchNodes`,

    // From infyradio.ts
    infyradio: `${CONSTANTS.ES_BASE}/lexcontentindex/resource/_search`,

    // From khub.ts
    khubMoreLikeThis: `${CONSTANTS.KHUB_SEARCH_BASE}/api/v1/moreLikeThis`,
    khubRelatedResources: (contentId: string, contentType: string) =>
        `${CONSTANTS.KHUB_SEARCH_BASE}/api/v1/moreLikeThis/${contentId}?contentType=${contentType}`,
    khubSearch: `${CONSTANTS.KHUB_SEARCH_BASE}/api/v1/search`,
    khubTopics: `${CONSTANTS.KHUB_SEARCH_BASE}/api/v1/topic`,

    // From leaderboard.ts
    GetBalance: `${CONSTANTS.GAMIFICATION_API_BASE}/FordGamification/PlatformServices/ApiGamification/Gamification/GetBalance`,
    Getsso: `${CONSTANTS.GAMIFICATION_API_BASE}/FordGamification/PlatformServices/ApiGamification/Gamification/Getsso`,
    gamificationBadgeDetails: `${CONSTANTS.GAMIFICATION_API_BASE}/FordGamification/PlatformServices/ApiGamification/Gamification/FetchAllBadgesInfoForUser`,
    gamificationBadgeWon: `${CONSTANTS.GAMIFICATION_API_BASE}/FordGamification/PlatformServices/ApiGamification/Gamification/FetchBadgesWonByUser`,
    gamificationBadgeYetToWin: `${CONSTANTS.GAMIFICATION_API_BASE}/FordGamification/PlatformServices/ApiGamification/Gamification/GetBadgesYetToWinByUSer`,
    dealersDetails: `${CONSTANTS.GAMIFICATION_API_BASE}/FordGamification/PlatformServices/ApiGamification/Gamification/GetRegionsandDealers`,
    fetchConfiguration: `${CONSTANTS.GAMIFICATION_API_BASE}/FordGamification/PlatformServices/ApiGamification/Gamification/FetchConfiguration`,
    fetchGuildAwardCountData: `${CONSTANTS.GAMIFICATION_API_BASE}/FordGamification/PlatformServices/ApiGamification/Gamification/FetchGuildAwardCountData`,
    hallOfFame: `${CONSTANTS.SB_EXT_API_BASE_2}/v2/TopLearners`,
    leaderboard: `${CONSTANTS.SB_EXT_API_BASE_2}/v2/LeaderBoard`,
    leaderboardActivities: `${CONSTANTS.GAMIFICATION_API_BASE}/FordGamification/PlatformServices/ApiGamification/Gamification/FetchDetailedActivitiesLeaderBoardData`,
    leaderboardDetails: `${CONSTANTS.GAMIFICATION_API_BASE}/FordGamification/PlatformServices/ApiGamification/Gamification/FetchDetailedLeaderBoardData`,
    leaderboardGuild: `${CONSTANTS.GAMIFICATION_API_BASE}/FordGamification/PlatformServices/ApiGamification/Gamification/FetchDetailedGuildLeaderBoardData`,
    updateApprovedPoints: `${CONSTANTS.GAMIFICATION_API_BASE}/FordGamification/PlatformServices/ApiGamification/Gamification/UpdateApprovedPoints`,
    updateConfiguration: `${CONSTANTS.GAMIFICATION_API_BASE}/FordGamification/PlatformServices/ApiGamification/Gamification/UpdateConfiguration`,
    leaderboardUserDetails: `${CONSTANTS.GAMIFICATION_API_BASE}/FordGamification/PlatformServices/ApiGamification/Gamification/FetchCompleteUserInfo`,

    // From navigator.ts
    accountsData: `${CONSTANTS.WEB_HOST_PROXY}/web-hosted/navigator/json/accounts_data.json`,
    bpmData: `${CONSTANTS.WEB_HOST_PROXY}/web-hosted/navigator/json/bpm_data.json`,
    commonGoalsData: `${CONSTANTS.WEB_HOST_PROXY}/web-hosted/navigator/json/common_goal_mapping.json`,
    commonsData: `${CONSTANTS.WEB_HOST_PROXY}/web-hosted/navigator/json/commonsdata.json`,
    deliveryPartnerData: `${CONSTANTS.WEB_HOST_PROXY}/web-hosted/navigator/json/dpn_data.json`,
    dmData: `${CONSTANTS.WEB_HOST_PROXY}/web-hosted/navigator/json/dmdata.json`,
    fullStackData: `${CONSTANTS.WEB_HOST_PROXY}/web-hosted/navigator/json/fsdata.json`,
    industriesData: `${CONSTANTS.WEB_HOST_PROXY}/web-hosted/navigator/json/industries_data.json`,
    learningPathData: `${CONSTANTS.WEB_HOST_PROXY}/web-hosted/navigator/json/data.json`,
    nsoData: `${CONSTANTS.WEB_HOST_PROXY}/web-hosted/navigator/json/nsodata.json`,
    subDomainsData: `${CONSTANTS.WEB_HOST_PROXY}/web-hosted/navigator/json/industries_subdomain.json`,

    // From network-hub.ts
    getNetworkHubUsers: `${CONSTANTS.USER_PROFILE_API_BASE}/public/v8/networkHub/users`,

    // From network.ts (postConnectionAddData/UpdateData use NETWORK_HUB_SERVICE_BACKEND variant)
    postConnectionAddDataNetwork: `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/connections/add`,
    postConnectionRecommendationDataNetwork: `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/connections/profile/find/recommended`,
    postConnectionUpdateDataNetwork: `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/connections/update`,

    // From playlist.ts
    playlistCreate: `${CONSTANTS.KONG_API_BASE}/playlist/v1/create`,
    playlistSearch: `${CONSTANTS.KONG_API_BASE}/playlist/v1/search`,
    playlistUpdate: `${CONSTANTS.KONG_API_BASE}/playlist/v1/update`,

    // From portal-v3.ts
    accessValidator: (keyWord: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/portal/${keyWord}/isAdmin`,
    cbcDeptByIdApi: (deptId: string, isUserInfoRequired: boolean) => `${CONSTANTS.SB_EXT_API_BASE_2}/portal/cbc/department/${deptId}?allUsers=${isUserInfoRequired}`,
    deptApi: (portalName: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/portal/${portalName}/department`,
    deptByIdApi: (deptId: string, isUserInfoRequired: boolean) => `${CONSTANTS.SB_EXT_API_BASE_2}/portal/department/${deptId}?allUsers=${isUserInfoRequired}`,
    portalDeptType: `${CONSTANTS.SB_EXT_API_BASE_2}/portal/departmentType`,
    deptTypeByName: (deptType: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/portal/departmentType/${deptType}`,
    deptTypeByTypeId: (deptTypeId: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/portal/departmentTypeById/${deptTypeId}`,
    getDeptNameList: `${CONSTANTS.SB_EXT_API_BASE_2}/portal/listDeptNames`,
    getDeptTypeName: `${CONSTANTS.SB_EXT_API_BASE_2}/portal/departmentTypeName`,
    isDeptAdmin: (userId: string, deptId: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/portal/department/${deptId}/user/${userId}/isAdmin`,
    myDeptApi: (portalName: string, isUserInfoRequired: boolean) => `${CONSTANTS.SB_EXT_API_BASE_2}/portal/${portalName}/mydepartment?allUsers=${isUserInfoRequired}`,
    portalRoleApi: `${CONSTANTS.SB_EXT_API_BASE_2}/portal/deptRole`,
    roleByTypeApi: (deptType: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/portal/deptRole/${deptType}`,
    spvDeleteDepartmentApi: (deptId: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/portal/spv/${deptId}`,
    spvDeptApi: `${CONSTANTS.SB_EXT_API_BASE_2}/portal/spv/department`,
    spvDeptByIdApi: (deptId: string, isUserInfoRequired: boolean) => `${CONSTANTS.SB_EXT_API_BASE_2}/portal/spv/department/${deptId}?allUsers=${isUserInfoRequired}`,
    spvMyDeptApi: (isUserInfoRequired: boolean) => `${CONSTANTS.SB_EXT_API_BASE_2}/portal/spv/mydepartment?allUsers=${isUserInfoRequired}`,
    spvUserRoleApi: `${CONSTANTS.SB_EXT_API_BASE_2}/portal/spv/userrole`,
    userRoleApi: (portalName: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/portal/${portalName}/userrole`,
    userRolesApi: (userId: string) => `${CONSTANTS.SB_EXT_API_BASE_2}/portal/${userId}/roles`,
    userStatusCheckApi: `${CONSTANTS.SB_EXT_API_BASE_2}/portal/isUserActive`,

    // From profileupdatev2.ts
    userProfileUpdate: `${CONSTANTS.HTTPS_HOST}/api/user/v1/update`,

    // From recommendation.ts
    recommendationBase: CONSTANTS.RECOMMENDATION_API_BASE,
    recommendationUsage: CONSTANTS.RECOMMENDATION_API_BASE + '/v1/recommendation',
    recommendationInterest: (userId: string) => `${CONSTANTS.RECOMMENDATION_API_BASE}/${userId}/recommendations/interest`,
    sbExtUsersBase: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/users`,

    // From recommendationEngineV2.ts
    cbpCourseRecommendation: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/publicSearch/CoursesRecomendationCBP`,
    recommendationAPI: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/course/recommendation`,
    recommendationPublicContentSearch: `${CONSTANTS.HTTPS_HOST}/apis/public/v8/publicContent/v1/search`,
    recommendationGetCourse: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/publicSearch/getcourse`,

    // From roleActivity.ts
    fracSearchNodes: `${CONSTANTS.FRAC_API_BASE}/fracapis/frac/searchNodes`,

    // From scoring.ts
    calculateScoreEndPoint: `${CONSTANTS.KONG_API_BASE}/scoring/v1/add`,
    createComment: `${CONSTANTS.SCORING_SERVICE_API_BASE}/api/comments/create`,
    fetchScore: `${CONSTANTS.KONG_API_BASE}/scoring/v1/fetch`,
    fetchTemplate: (templateId: string) => `${CONSTANTS.KONG_API_BASE}/scoring/v1/getTemplate/${templateId}`,
    getAllComments: `${CONSTANTS.SCORING_SERVICE_API_BASE}/api/comments/getall`,
    getCommentsByCourse: `${CONSTANTS.SCORING_SERVICE_API_BASE}/api/comments/course`,
    updateComment: `${CONSTANTS.SCORING_SERVICE_API_BASE}/api/comments/update`,

    // From scrom.ts
    deleteScromData: `${CONSTANTS.AUTHORING_BACKEND}/action/scrom/delete`,
    getScromData: `${CONSTANTS.AUTHORING_BACKEND}/action/scrom/fetch`,
    postScromData: `${CONSTANTS.AUTHORING_BACKEND}/action/scrom/add`,

    // From social.ts
    acceptAnswer: `${CONSTANTS.NODE_API_BASE}/useractivity/acceptAnswer`,
    activityUpdate: `${CONSTANTS.NODE_API_BASE}/useractivity/create`,
    activityUsers: `${CONSTANTS.NODE_API_BASE}/post/users`,
    adminDeletePosts: `${CONSTANTS.NODE_API_BASE}/admin/deletepost`,
    adminPostsTimeline: `${CONSTANTS.NODE_API_BASE}/admin/timeline`,
    adminReactivatePost: `${CONSTANTS.NODE_API_BASE}/admin/reactivatepost`,
    authoringCatalog: `${CONSTANTS.NODE_API_BASE}/catalog/fetch`,
    socialAutocomplete: `${CONSTANTS.NODE_API_BASE}/post/autocomplete`,
    createForum: `${CONSTANTS.NODE_API_BASE}/forum/createforum`,
    deletePost: `${CONSTANTS.NODE_API_BASE}/authtool/deletepost`,
    draftPost: `${CONSTANTS.NODE_API_BASE}/authtool/draftpost`,
    editForum: `${CONSTANTS.NODE_API_BASE}/forum/editforum`,
    editMeta: `${CONSTANTS.NODE_API_BASE}/authtool/editmeta`,
    editTags: `${CONSTANTS.NODE_API_BASE}/authtool/edittags`,
    moderatorPostsTimeline: `${CONSTANTS.NODE_API_BASE}/moderator/timeline`,
    moderatorReact: `${CONSTANTS.NODE_API_BASE}/moderator/moderatepost`,
    publishPost: `${CONSTANTS.NODE_API_BASE}/authtool/publishpost`,
    searchSocial: `${CONSTANTS.NODE_API_BASE}/search/searchv1`,
    socialTimeline: `${CONSTANTS.NODE_API_BASE}/post/timeline`,
    socialTimelineV2: `${CONSTANTS.NODE_API_BASE}/post/timelinev2`,
    uploadImage: `${CONSTANTS.CONTENT_API_BASE}/contentv3/upload-live`,
    viewConversation: `${CONSTANTS.NODE_API_BASE}/post/viewConversation`,
    viewConversationV2: `${CONSTANTS.NODE_API_BASE}/post/viewConversationv2`,
    viewForum: `${CONSTANTS.NODE_API_BASE}/forum/viewforum`,
    viewForumlist: `${CONSTANTS.NODE_API_BASE}/forum/forumtimeline`,

    // From socialv2.ts
    socialAcceptAnswer: `${CONSTANTS.NODE_API_BASE}/useractivity/acceptAnswer`,
    socialActivityUpdate: `${CONSTANTS.NODE_API_BASE}/useractivity/create`,
    socialActivityUsers: `${CONSTANTS.NODE_API_BASE}/post/users`,
    socialAuthoringCatalog: `${CONSTANTS.NODE_API_BASE}/catalog/fetch`,
    socialPostAutocomplete: `${CONSTANTS.NODE_API_BASE}/post/autocomplete`,
    socialDeletePost: `${CONSTANTS.NODE_API_BASE}/authtool/deletepost`,
    socialDraftPost: `${CONSTANTS.NODE_API_BASE}/authtool/draftpost`,
    socialEditMeta: `${CONSTANTS.NODE_API_BASE}/authtool/editmeta`,
    socialEditTags: `${CONSTANTS.NODE_API_BASE}/authtool/edittags`,
    socialPublishPost: `${CONSTANTS.NODE_API_BASE}/authtool/publishpost`,
    socialSearch: `${CONSTANTS.NODE_API_BASE}/search/searchv1`,
    socialViewConversation: `${CONSTANTS.NODE_API_BASE}/post/viewConversation`,
    socialViewConversationV2: `${CONSTANTS.NODE_API_BASE}/post/viewConversationv2`,

    // From training.ts
    training: `${CONSTANTS.LEARNING_HUB_API_BASE}/lHub/v1`,

    // From translate.ts
    filterTranslate: `${CONSTANTS.SB_EXT_API_BASE_2}/filters`,

    // From userEnrolledInSource.ts
    userCountInSource: `${CONSTANTS.RECOMMENDATION_API_BASE_V2}/course/source_name/users`,

    // From workallocation.ts
    workallocationAddAllocation: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/add`,
    workallocationAddWorkOrder: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/add/workorder`,
    workallocationCopyWorkOrder: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/copy/workOrder`,
    workallocationGetPdf: (id: string) => `${CONSTANTS.KONG_API_BASE}/getWOPdf/${id}`,
    workallocationGetUserBasicDetails: (userId: string) => `${CONSTANTS.KONG_API_BASE}/v2/workallocation/user/basicInfo/${userId}`,
    workallocationGetUsers: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/workallocation/getUsers`,
    workallocationGetWorkAllocationById: (path: string, id: string) => `${CONSTANTS.KONG_API_BASE}/${path}/getWorkAllocationById/${id}`,
    workallocationGetWorkOrderById: (path: string, id: string) => `${CONSTANTS.KONG_API_BASE}/${path}/getWorkOrderById/${id}`,
    workallocationGetWorkOrders: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/getWorkOrders`,
    workallocationUpdateAllocation: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/workallocation/update`,
    workallocationUpdateWorkAllocation: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/update`,
    workallocationUpdateWorkOrder: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/update/workorder`,
    workallocationUserAutoComplete: (searchTerm: string) => `${CONSTANTS.KONG_API_BASE}/v1/workallocation/users/autocomplete?searchTerm=${searchTerm}`,

    // From workflow-handler.ts
    applicationTransition: `${CONSTANTS.KONG_API_BASE}/workflow/transition`,
    applicationsSearch: `${CONSTANTS.KONG_API_BASE}/workflow/applications/search`,
    historyBasedOnApplicationId: (applicationId: string) =>
        `${CONSTANTS.WORKFLOW_HANDLER_SERVICE_API_BASE}/v1/workflow/${applicationId}/history`,
    historyBasedOnWfId: (workflowId: string, applicationId: string) =>
        `${CONSTANTS.WORKFLOW_HANDLER_SERVICE_API_BASE}/v1/workflow/${workflowId}/${applicationId}/history`,
    nextActionSearch: (serviceName: string, state: string) =>
        `${CONSTANTS.KONG_API_BASE}/workflow/nextAction/${serviceName}/${state}`,
    userWfFieldsSearch: `${CONSTANTS.KONG_API_BASE}/workflow/getUserWFApplicationFields`,
    userWfSearch: `${CONSTANTS.KONG_API_BASE}/workflow/getUserWF`,
    workflowProcess: (wfId: string) => `${CONSTANTS.KONG_API_BASE}/workflow/workflowProcess/${wfId}`,
    workflowUserProfileUpdate: `${CONSTANTS.KONG_API_BASE}/workflow/updateUserProfileWF`,

    // From updateProgressv2.ts / updateProgressv3.ts
    readProgress: `${CONSTANTS.HTTPS_HOST}/api/course/v1/content/state/read`,
    updateProgress: `${CONSTANTS.HTTPS_HOST}/api/course/v1/content/state/update`,

    // From creatorCertificateTemplate.ts
    templateAdd: `${CONSTANTS.HTTPS_HOST}/api/course/batch/cert/v1/template/add`,

    // From user/myAnalytics.ts
    la1AssessmentV1: `${CONSTANTS.HTTPS_HOST}LA1/api/v1/assessment`,
    la1CertificationV1: `${CONSTANTS.HTTPS_HOST}LA1/api/v1/certification`,
    la1Assessment: `${CONSTANTS.HTTPS_HOST}LA1/api/assessment`,
    la1Timespent: `${CONSTANTS.HTTPS_HOST}LA1/api/timespent`,
    la1NsoArtifactsAndCollaborators: `${CONSTANTS.HTTPS_HOST}LA1/api/nsoArtifactsAndCollaborators`,
    la1Skills: `${CONSTANTS.HTTPS_HOST}LA1/api/skills`,
    la1MySkills: `${CONSTANTS.HTTPS_HOST}LA1/api/myskills`,
    la1RecommendedSkills: `${CONSTANTS.HTTPS_HOST}LA1/api/recommendedSkills`,
    la1AllSkills: `${CONSTANTS.HTTPS_HOST}LA1/api/allSkills`,
    la1IsAdmin: `${CONSTANTS.HTTPS_HOST}LA1/api/isAdmin`,
    la1RoleGet: `${CONSTANTS.HTTPS_HOST}LA1/api/role/get`,
    la1SkillQuotient: `${CONSTANTS.HTTPS_HOST}LA1/api/skillquotient`,
    la1RoleQuotient: `${CONSTANTS.HTTPS_HOST}LA1/api/rolequotient`,
    la1NsoGetCourseAndProgress: `${CONSTANTS.HTTPS_HOST}LA1/api/nso/getCourseAndProgress`,
    la1RoleGetExisting: `${CONSTANTS.HTTPS_HOST}LA1/api/role/getExisting`,
    la1RoleAdd: `${CONSTANTS.HTTPS_HOST}LA1/api/role/add`,
    la1SkillsAdd: `${CONSTANTS.HTTPS_HOST}LA1/api/skills/add`,
    la1RoleShareRole: `${CONSTANTS.HTTPS_HOST}LA1/api/role/shareRole`,
    la1SkillSearch: `${CONSTANTS.HTTPS_HOST}LA1/api/skill/search`,
    la1RoleDelete: `${CONSTANTS.HTTPS_HOST}LA1/api/role/delete`,
    la1RoleUpdate: `${CONSTANTS.HTTPS_HOST}LA1/api/role/update`,
    la1IsApprover: `${CONSTANTS.HTTPS_HOST}LA1/api/isApprover`,
    la1SkillData: `${CONSTANTS.HTTPS_HOST}LA1/api/skillData`,
    la1Search: `${CONSTANTS.HTTPS_HOST}LA1/api/search`,
    la1ProjectEndorsementGetList: `${CONSTANTS.HTTPS_HOST}LA1/api/projectEndorsement/getList`,
    la1ProjectEndorsementGet: `${CONSTANTS.HTTPS_HOST}LA1/api/projectEndorsement/get`,
    la1ProjectEndorsementEndorseRequest: `${CONSTANTS.HTTPS_HOST}LA1/api/projectEndorsement/endorseRequest`,
    la1ProjectEndorsementAdd: `${CONSTANTS.HTTPS_HOST}LA1/api/projectEndorsement/add`,
    la1UserProgress: `${CONSTANTS.HTTPS_HOST}LA1/api/userprogress`,
    la1ValidatorUrl: `${CONSTANTS.HTTPS_HOST}/apis/protected/v8/user/validate`,
}
