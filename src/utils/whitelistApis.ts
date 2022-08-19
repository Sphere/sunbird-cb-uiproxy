'use strict'
const CHECK = {
  ROLE: 'ROLE_CHECK',
  SCOPE: 'SCOPE_CHECK',
}

// Valid Roles
const ROLE = {
  CBC_ADMIN: 'CBC_ADMIN',
  CBC_MEMBER: 'CBC_MEMBER',
  CONTENT_CREATOR: 'CONTENT_CREATOR',
  CONTENT_PUBLISHER: 'CONTENT_PUBLISHER',
  CONTENT_REVIEWER: 'CONTENT_REVIEWER',
  EDITOR: 'EDITOR',
  FRAC_ACCESS_COMPENTENCY: 'FRAC_COMPETENCY_MEMBER',
  FRAC_ADMIN: 'FRAC_ADMIN',
  FRAC_COMPETENCY_REVIEWER: 'FRAC_COMPETENCY_REVIEWER',
  FRAC_REVIEWER_ONE: 'FRAC_REVIEWER_L1',
  FRAC_REVIEWER_TWO: 'FRAC_REVIEWER_L2',
  IFU_MEMBER: 'IFU_MEMBER',
  MDO_ADMIN: 'MDO_ADMIN',
  PUBLIC: 'PUBLIC',
  SPV_ADMIN: 'SPV_ADMIN',
  WAT_MEMBER: 'WAT_MEMBER',
}

// All api list validations
export const API_LIST = {
  URL: {
    '/authApi/action/content/hierarchy/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/authApi/action/content/parent/hierarchy': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/authApi/action/content/parent/hierarchy/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/authApi/content/v3/create': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/authApi/content/v3/read/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/authApi/content/v3/update/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/authContent/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/details': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/profileDetails/test': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.MDO_ADMIN, ROLE.CONTENT_CREATOR],
    },
    // tslint:disable-next-line: object-literal-sort-keys
    '/protected/v8/resource/': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/api/user/v2/read': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/iconBadge/unseenNotificationCount': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/certreg/v2/certs/download/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/course/batch/cert/v1/issue': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/course/v1/enrol': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/downloadCertificate/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/action/content/v3/hierarchy/add': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/api/user/v2/read/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/user/v1/read/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/sunbirdigot/read': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/content/searchV5': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/sunbirdigot/search': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/read/content-progres/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/recent': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/content-progres/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/user/v1/create': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/topic/:id/:slug': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/topic/:tid/:tid/:slug': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/learner/course/v1/user/enrollment/list/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/action/content/v3/hierarchy/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/action/content/v3/read/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/action/content/v3/reject/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/forum/v2/read': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/forum/v3/create': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/category/list': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/category/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/forum/tags': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/user/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/action/content/v3/hierarchyUpdate': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/action/content/v3/hierarchy/update': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/action/content/v3/create': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/getContent': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/getContents': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/logout/user': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/getContents/content/:do_id/artifact/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/getContents/content/html/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/upload/action/content/v3/upload/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/v1/content/retire': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/action/content/v3/updateReviewStatus/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/action/content/v3/review/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/action/content/v3/publish/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/action/content/v3/update/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/LA/api/la/contentanalytics': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/data/v1/system/settings/get/orgTypeList': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/learner/course/v1/enrol': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/org/v1/search': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/user/private/v1/assign/role': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/user/v1/search': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/org/v1/read': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/org/v1/update': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/user/v1/block': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/user/v1/unblock': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/data/v1/system/settings/get/orgTypeConfig': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/private/content/v3/upload/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/tags': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/org/v1/create': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/learnervm/private/content/v3/publish/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/learnervm/private/content/v3/review/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/v2/topics': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/v2/topics/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/tags/:tag': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/user/:userKey/bookmarks': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/user/:userKey/bookmark': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/user/:userKey/upvoted': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/user/:userKey/downvoted': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/categories': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/user/v1/autocomplete/:key': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/user/v1/migrate': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/user/private/v1/migrate': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/user/private/v1/assign/role/userrole': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/v2/posts/:id/vote': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/v2/posts/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/v2/posts/:id/bookmark': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/discussion/popular': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/learnervm/private/content/v3/retire/': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/learner/course/v1/batch/create': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/learner/course/v1/batch/list': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/private/content/v3/update/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
   '/protected/v8/admin/userRegistration/bulkUpload': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/admin/userRegistration/bulkUploadData': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/admin/bulk-upload/create-users': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/admin/bulk-upload/create-users': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/connections/connections/recommended/userDepartment': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/discussionHub/categories/:cid/:slug?/:tid?': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/discussionHub/topics/recent': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/cohorts/:cohortType/:contentId': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/content/like': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/playlist': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/playlist/create': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/telemetry': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/scrom/get/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/progress/:contentId': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/rating/:contentId': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/progress': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/topics/v2': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/history/continue': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/portal/departmentType/': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/portal/spv/department': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/portal/spv/deptAction/': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/roles/getUsersV2': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/portal/spv/mydepartment': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/portal/mdo/mydepartment': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/profileDetails/createUser': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/profileRegistry/getUserRegistryByUser/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/profileRegistry/createUserRegistryV2': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/profileRegistry/createUserRegistry': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/portal/deptAction': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workflowhandler/historyByApplicationId/:applicationId': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/autocomplete/:query': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/evaluate/assessment/submit/v2': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/portal/spv/deptAction/userrole': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/preference': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/v2/user/assessment/submit': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workflowhandler/applicationsSearch': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workallocation/getWorkOrders': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workallocation/add/workorder': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workallocation/getWorkOrderById/:workOrderId': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
      SCOPE_CHECK: [ROLE.MDO_ADMIN],
    },
    '/protected/v8/workallocation/user/autocomplete/:searchTerm': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/frac/searchNodes': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/frac/:type/:key': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workallocation/v2/add': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workallocation/getWorkAllocationById/:workAllocationId': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workallocation/update/workorder': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workallocation/getWOPdf/:workOrderId': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/portal/cbp/mydepartment': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/badge': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/tnc': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/feedbackV2/content/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/goals/action': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/goals/for-others': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/goals/common': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/mandatoryContent/checkStatus': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/rating/content/average-ratingInfo/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/realTimeProgress/update/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/social/post/timeline': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/history/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/history': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/frac/getAllNodes/:type': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/frac/getNodeById/:id/:type': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    'proxies/v8/LA/api/la/contentanalytics/:contentId/:type': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/portal/listDeptNames': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/scroing/getTemplate/:templateId': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/portal/cbc/department': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/portal/cbc/department/:deptId/': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/portal/spv/department/:deptId/': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/scroing/calculate': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/connections/connections/recommended': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/connections/connections/requests/received': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/connections/connections/established': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/connections/connections/established/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/connections/connections/requested': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/connections/add/connection': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/connections/connections/suggests': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/cohorts/user/autoenrollment/:courseId': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/profanity/startPdfProfanity': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/profanity/getPdfProfanityForContent/:contentId': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/catalog': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/scroing/fetch': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/portal/mdo/deptAction/userrole': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workallocation/v2/update': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/profileDetails/updateUser': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/frac/addDataNodeBulk': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/roleactivity/:txt': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/connections/update/connection': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workflowhandler/userWFApplicationFieldsSearch': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/details/detailV1': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/profileRegistry/getMasterNationalities': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/profileRegistry/getMasterLanguages': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/profileRegistry/getProfilePageMeta': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/notifications': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/notifications/settings': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/profileRegistry/searchUserRegistry': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workflowhandler/transition': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workflowhandler/nextActionSearch/:serviceName/:state': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workflowhandler/historyByApplicationIdAndWfId/:applicationId/:wfId':
    {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workflowhandler/workflowProcess/:wfId': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workflowhandler/updateUserProfileWf': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workflowhandler/userWfSearch': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/goals': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/goals/user': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/feedbackV2/config': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/profileRegistry/getUserRegistryById': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/profileRegistry/getUserRegistryById/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/profileRegistry/updateUserRegistry': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/workallocation/copy/workOrder': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/reset': {
      checksNeeded: [],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/assessment/submit/v2': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/assessment/get': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/connections/v2/connections/recommended/userDepartment': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/connections/v2/connections/recommended': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/connections/v2/connections/requests/received': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/connections/v2/connections/established': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/connections/v2/connections/established/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/connections/v2/connections/requested': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },

    '/protected/v8/connections/v2/add/connection': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/connections/v2/connections/suggests': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/connections/v2/update/connection': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/content/parents/:do_id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/content/:do_id/parent': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/training/content/:do_id/trainings/count': {
      checksNeeded: [],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/protected/v8/user/tnc/accept': {
      checksNeeded: [],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/public/v8/homePage/searchV6': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/public/v8/forgot-password/verify': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/public/v8/google/callback': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/public/v8/user': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [ROLE.PUBLIC],
    },
    '/proxies/v8/action/framework/v3/read/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [
        ROLE.PUBLIC,
      ],
    },
    '/proxies/v8/action/framework/v3/category/master/create': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [
        ROLE.PUBLIC,
      ],
    },
    '/proxies/v8/action/framework/v3/category/master/search': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [
        ROLE.PUBLIC,
      ],
    },
    '/proxies/v8/action/framework/v3/category/master/read/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [
        ROLE.PUBLIC,
      ],
    },
    '/proxies/v8/action/framework/v3/category/create': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [
        ROLE.PUBLIC,
      ],
    },
    '/proxies/v8/action/framework/v3/category/read/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [
        ROLE.PUBLIC,
      ],
    },
    '/proxies/v8/action/framework/v3/category/retire/:id': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [
        ROLE.PUBLIC,
      ],
    },
    '/proxies/v8/action/framework/v3/term/create': {
      checksNeeded: [CHECK.ROLE],
      // tslint:disable-next-line: object-literal-sort-keys
      ROLE_CHECK: [
        ROLE.PUBLIC,
      ],
    },
  },
  URL_PATTERN: [
    '/authApi/action/content/hierarchy/:do_id',
    '/authApi/action/content/parent/hierarchy',
    '/authApi/action/content/parent/hierarchy/:do_id',
    '/authApi/content/v3/create',
    '/authApi/content/v3/read/:do_id',
    '/authApi/content/v3/update/:do_id',
    '/authContent/:do_id',
    '/public/v8/google/callback',
    '/public/v8/user',
    '/proxies/v8/api/user/v2/read',
    '/proxies/v8/api/user/v2/read/:id',
    '/proxies/v8/certreg/v2/certs/download/:id',
    '/proxies/v8/course/batch/cert/v1/issue',
    '/proxies/v8/course/v1/enrol',
    '/proxies/v8/downloadCertificate/:id',
    '/proxies/v8/action/content/v3/hierarchy/add',
    '/proxies/v8/learner/course/v1/batch/create',
    '/proxies/v8/learner/course/v1/batch/list',
    '/proxies/v8/user/v1/read/:id',
    '/proxies/v8/sunbirdigot/read',
    '/proxies/v8/sunbirdigot/search',
    '/proxies/v8/discussion/user/v1/create',
    '/proxies/v8/LA/api/la/contentanalytics',
    '/proxies/v8/data/v1/system/settings/get/orgTypeList',
    '/proxies/v8/org/v1/search',
    '/proxies/v8/org/v1/update',
    '/proxies/v8/discussion/topic/:id/:slug',
    '/proxies/v8/discussion/topic/:tid/:tid/:slug',
    '/proxies/v8/discussion/v2/posts/:id/vote',
    '/proxies/v8/discussion/v2/posts/:id',
    '/proxies/v8/discussion/v2/posts/:id/bookmark',
    '/proxies/v8/learner/course/v1/user/enrollment/list/:id',
    '/proxies/v8/read/content-progres/:do_id',
    '/proxies/v8/content-progres/:do_id',
    '/proxies/v8/action/content/v3/hierarchy/:do_id',
    '/proxies/v8/action/content/v3/hierarchyUpdate',
    '/proxies/v8/action/content/v3/hierarchy/update',
    '/proxies/v8/action/content/v3/read/:do_id',
    '/proxies/v8/discussion/forum/v2/read',
    '/proxies/v8/discussion/category/list',
    '/proxies/v8/discussion/category/:id',
    '/proxies/v8/discussion/forum/tags',
    '/proxies/v8/action/content/v3/update/:do_id',
    '/proxies/v8/discussion/user/:id',
    '/proxies/v8/action/content/v3/create',
    '/proxies/v8/upload/action/content/v3/upload/:do_id',
    '/proxies/v8/getContent',
    '/proxies/v8/getContents',
    '/proxies/v8/logout/user',
    '/proxies/v8/getContents/content/:do_id/artifact/:do_id',
    '/proxies/v8/getContents/content/html/:do_id',
    '/proxies/v8/v1/content/retire',
    '/proxies/v8/action/content/v3/updateReviewStatus/:do_id',
    '/proxies/v8/action/content/v3/review/:do_id',
    '/proxies/v8/discussion/recent',
    '/proxies/v8/action/content/v3/publish/:do_id',
    '/proxies/v8/action/content/v3/reject/:do_id',
    '/proxies/v8/user/private/v1/assign/role',
    '/proxies/v8/user/v1/search',
    '/proxies/v8/org/v1/read',
    '/proxies/v8/org/v1/create',
    '/proxies/v8/private/content/v3/upload/:do_id',
    '/proxies/v8/discussion/tags',
    '/proxies/v8/user/v1/block',
    '/proxies/v8/user/v1/unblock',
    '/proxies/v8/data/v1/system/settings/get/orgTypeConfig',
    '/proxies/v8/learnervm/private/content/v3/publish/:do_id',
    '/proxies/v8/learnervm/private/content/v3/review/:do_id',
    '/proxies/v8/discussion/v2/topics',
    '/proxies/v8/discussion/v2/topics/:id',
    '/proxies/v8/discussion/tags/:tag',
    '/proxies/v8/discussion/user/:userKey/bookmarks',
    '/proxies/v8/discussion/user/:userKey/bookmark',
    '/proxies/v8/discussion/user/:userKey/upvoted',
    '/proxies/v8/discussion/user/:userKey/downvoted',
    '/proxies/v8/discussion/categories',
    '/proxies/v8/user/v1/autocomplete/:key',
    '/proxies/v8/user/v1/migrate',
    '/proxies/v8/user/private/v1/migrate',
    '/proxies/v8/user/private/v1/assign/role/userrole',
    '/proxies/v8/learner/course/v1/enrol',
    '/proxies/v8/learnervm/private/content/v3/retire/',
    '/proxies/v8/private/content/v3/update/:do_id',
    '/protected/v8/user/profileDetails/test',
    '/protected/v8/resource/',
    '/protected/v8/user/details',
    '/protected/v8/admin/userRegistration/bulkUpload',
    '/protected/v8/bulkUploadData/bulkUploadData',
    '/protected/v8/admin/bulk-upload/create-users',
    '/proxies/v8/admin/bulk-upload/create-users',
    '/protected/v8/connections/connections/recommended/userDepartment',
    '/protected/v8/discussionHub/categories/:cid/:slug?/:tid?',
    '/protected/v8/discussionHub/topics/recent',
    '/protected/v8/cohorts/:cohortType/:contentId',
    '/protected/v8/content/searchV5',
    '/protected/v8/user/content/like',
    '/protected/v8/user/iconBadge/unseenNotificationCount',
    '/protected/v8/user/telemetry',
    '/protected/v8/scrom/get/:id',
    '/protected/v8/user/progress/:contentId',
    '/protected/v8/user/rating/:contentId',
    '/protected/v8/user/progress',
    '/protected/v8/user/history/continue',
    '/protected/v8/portal/departmentType/',
    '/protected/v8/portal/spv/department',
    '/protected/v8/portal/spv/deptAction/',
    '/protected/v8/user/roles/getUsersV2',
    '/protected/v8/portal/spv/mydepartment',
    '/protected/v8/portal/mdo/mydepartment',
    '/protected/v8/user/profileDetails/createUser',
    '/protected/v8/user/profileRegistry/getUserRegistryByUser/:id',
    '/protected/v8/user/profileRegistry/createUserRegistryV2',
    '/protected/v8/user/profileRegistry/createUserRegistry',
    '/protected/v8/portal/deptAction',
    '/protected/v8/workflowhandler/historyByApplicationId/:applicationId',
    '/protected/v8/user/autocomplete/:query',
    '/protected/v8/user/evaluate/assessment/submit/v2',
    '/protected/v8/portal/spv/deptAction/userrole',
    '/protected/v8/training/content/:do_id/trainings/count',
    '/protected/v8/user/playlist',
    '/protected/v8/user/playlist/create',
    '/protected/v8/user/preference',
    '/protected/v8/v2/user/assessment/submit',
    '/protected/v8/workflowhandler/applicationsSearch',
    '/protected/v8/workallocation/getWorkOrders',
    '/protected/v8/workallocation/add/workorder',
    '/protected/v8/workallocation/getWorkOrderById/:workOrderId',
    '/protected/v8/workallocation/user/autocomplete/:searchTerm',
    '/protected/v8/frac/searchNodes',
    '/protected/v8/frac/:type/:key',
    '/protected/v8/workallocation/v2/add',
    '/protected/v8/workallocation/getWorkAllocationById/:workAllocationId',
    '/protected/v8/workallocation/update/workorder',
    '/protected/v8/workallocation/v2/update',
    '/protected/v8/workallocation/getWOPdf/:workOrderId',
    '/protected/v8/portal/cbp/mydepartment',
    '/protected/v8/user/badge',
    '/protected/v8/user/tnc',
    '/protected/v8/user/feedbackV2/content/:do_id',
    '/protected/v8/user/goals/action',
    '/protected/v8/user/goals/for-others',
    '/protected/v8/user/goals/common',
    '/protected/v8/user/mandatoryContent/checkStatus',
    '/protected/v8/user/rating/content/average-ratingInfo/:do_id',
    '/protected/v8/user/realTimeProgress/update/:do_id',
    '/protected/v8/social/post/timeline',
    '/protected/v8/user/history/:id',
    '/protected/v8/user/history',
    '/protected/v8/frac/getAllNodes/:type',
    '/protected/v8/frac/getNodeById/:id/:type',
    '/protected/v8/portal/listDeptNames',
    '/protected/v8/scroing/getTemplate/:templateId',
    '/protected/v8/portal/cbc/department',
    '/protected/v8/portal/cbc/department/:deptId/',
    '/protected/v8/portal/spv/department/:deptId/',
    '/protected/v8/scroing/calculate',
    '/protected/v8/connections/connections/recommended',
    '/protected/v8/connections/connections/requests/received',
    '/protected/v8/connections/connections/established',
    '/protected/v8/connections/connections/established/:id',
    '/protected/v8/connections/connections/requested',
    '/protected/v8/connections/add/connection',
    '/protected/v8/connections/connections/suggests',
    '/protected/v8/cohorts/user/autoenrollment/:courseId',
    '/protected/v8/profanity/startPdfProfanity',
    '/protected/v8/profanity/getPdfProfanityForContent/:contentId',
    '/protected/v8/catalog',
    '/protected/v8/scroing/fetch',
    '/protected/v8/portal/mdo/deptAction/userrole',
    '/protected/v8/user/profileDetails/updateUser',
    '/protected/v8/frac/addDataNodeBulk',
    '/protected/v8/roleactivity/:txt',
    '/protected/v8/connections/update/connection',
    '/protected/v8/workflowhandler/userWFApplicationFieldsSearch',
    '/protected/v8/user/details/detailV1',
    '/protected/v8/user/goals',
    '/protected/v8/user/goals/user',
    '/protected/v8/user/feedbackV2/config',
    '/protected/v8/user/profileRegistry/getMasterNationalities',
    '/protected/v8/user/profileRegistry/getMasterLanguages',
    '/protected/v8/user/profileRegistry/getProfilePageMeta',
    '/protected/v8/user/notifications',
    '/protected/v8/user/notifications/settings',
    '/protected/v8/user/profileRegistry/searchUserRegistry',
    '/protected/v8/workflowhandler/transition',
    '/protected/v8/workflowhandler/nextActionSearch/:serviceName/:state',
    '/protected/v8/workflowhandler/historyByApplicationIdAndWfId/:applicationId/:wfId',
    '/protected/v8/workflowhandler/workflowProcess/:wfId',
    '/protected/v8/workflowhandler/updateUserProfileWf',
    '/protected/v8/workflowhandler/userWfSearch',
    '/protected/v8/user/profileRegistry/getUserRegistryById',
    '/protected/v8/user/profileRegistry/getUserRegistryById/:id',
    '/protected/v8/user/profileRegistry/updateUserRegistry',
    '/protected/v8/user/topics/v2',
    '/protected/v8/workallocation/copy/workOrder',
    '/reset',
    '/protected/v8/assessment/get',
    '/protected/v8/assessment/submit/v2',
    '/protected/v8/connections/v2/connections/recommended/userDepartment',
    '/protected/v8/connections/v2/connections/recommended',
    '/protected/v8/connections/v2/connections/requests/received',
    '/protected/v8/connections/v2/connections/established',
    '/protected/v8/connections/v2/connections/established/:id',
    '/protected/v8/connections/v2/connections/requested',
    '/protected/v8/connections/v2/add/connection',
    '/protected/v8/connections/v2/connections/suggests',
    '/protected/v8/connections/v2/update/connection',
    '/protected/v8/content/parents/:do_id',
    '/protected/v8/content/:do_id/parent',
    '/protected/v8/user/tnc/accept',
    '/public/v8/homePage/searchV6',
    '/public/v8/forgot-password/verify',
    '/proxies/v8/LA/api/la/contentanalytics/:contentId/:type',
    '/proxies/v8/action/framework/v3/read/:id',
    '/proxies/v8/action/framework/v3/category/master/create',
    '/proxies/v8/action/framework/v3/category/master/search',
    '/proxies/v8/action/framework/v3/category/master/read/:id',
    '/proxies/v8/action/framework/v3/category/create',
    '/proxies/v8/action/framework/v3/category/read/:id',
    '/proxies/v8/action/framework/v3/category/retire/:id',
    '/proxies/v8/action/framework/v3/term/create',
  ],
}
