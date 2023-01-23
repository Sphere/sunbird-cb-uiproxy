// tslint:disable-next-line: all
const env = process.env;
const HTTPS_HOST = env.HTTPS_HOST || "https://aastrika-sb.idc.tarento.com";
export const CONSTANTS = {
  ACCESS_CONTROL_API_BASE: env.ACCESS_CONTROL_API_BASE || env.SBEXT_API_BASE,
  ANALYTICS_TIMEOUT: env.ANALYTICS_TIMEOUT || 10000,
  APP_ANALYTICS: env.LA_HOST_PROXY || "http://localhost:portNUmber",
  APP_CONFIGURATIONS: env.APP_CONFIGURATIONS || "/app-config",
  APP_LOGS: env.APP_LOGS || "/logs",
  ATTENDANCE_API_BASE: env.ATTENDANCE_API_BASE || env.SB_EXT_API_BASE_2,
  AUTHORING_BACKEND: env.SUNBIRD_BACKEND || "http://localhost:3011",
  BADGE_API_BASE: env.BADGE_API_BASE || env.SB_EXT_API_BASE_2,
  NETWORK_HUB_SERVICE_BACKEND:
    env.NETWORK_HUB_SERVICE_BACKEND || "http://localhost:3013",

  CASSANDRA_IP: env.CASSANDRA_IP || "",
  CASSANDRA_KEYSPACE: env.CASSANDRA_KEYSPACE || "bodhi",
  CASSANDRA_PASSWORD: env.CASSANDRA_PASSWORD || "",
  CASSANDRA_USERNAME: env.CASSANDRA_USERNAME || "",
  CERTIFICATE_DOWNLOAD_KEY: env.CERTIFICATE_DOWNLOAD_KEY,
  CLUSTER_THREAD: env.CLUSTER_THREAD || 1,
  COMPETENCY_API_BASE:
    env.COMPETENCY_API_BASE || "http://compentency-tool-service:8080",
  CONTENT_API_BASE: env.CONTENT_API_BASE || "http://localhost:5903",
  CONTENT_HIERARCHY: env.CONTENT_HIERARCHY || "http://localhost:5903/hierarchy",
  CONTENT_META_FETCH_API_BASE:
    env.CONTENT_META_FETCH_API_BASE || "http://localhost:5906",
  CONTENT_STORE_DEVELOPMENT_BASE: "",
  CORS_ENVIRONMENT: env.CORS_ENVIRONMENT || "prod",
  COUNTER: "http://localhost:5903",
  DECRYPTION_API_BASE:
    env.DECRYPTION_API_BASE || "http://decryption-service:8084",
  DEFAULT_ORG: env.DEFAULT_ORG || "dopt",
  DEFAULT_ROOT_ORG: env.DEFAULT_ROOT_ORG || "igot",
  ENTITY_API_BASE: env.ENTITY_API_BASE || "http://10.1.2.120:8083",
  ES_BASE: env.ES_BASE || "http://localhost:9200",
  ES_IP: env.ES_IP || "10.1.1.131:9200",
  ES_PASSWORD: env.ES_PASSWORD || "iGOT@123+",
  ES_USERNAME: env.ES_USERNAME || "elastic",
  FEEDBACK_API_BASE: env.FEEDBACK_API_BASE || env.SB_EXT_API_BASE_2,
  GAMIFICATION_API_BASE:
    env.GAMIFICATION_API_BASE || "http://localhost:port-number",
  GOALS_API_BASE: env.GOALS_API_BASE || env.SB_EXT_API_BASE_2,
  HIERARCHY_API_BASE: env.HIERARCHY_API_BASE,
  HTTPS_HOST,
  IAP_BACKEND_AUTH: env.IAP_BACKEND_AUTH || "",
  IAP_CLIENT_SECRET: env.IAP_CLIENT_SECRET,
  IAP_CODE_API_BASE: env.IAP_CODE_API_BASE || "",
  IAP_PROFILE_API_BASE: env.IAP_PROFILE_API_BASE || "",
  ILP_FP_PROXY: env.ILP_FP_PROXY || "http://localhost:port",
  INTEREST_API_BASE: env.INTEREST_API_BASE || env.SB_EXT_API_BASE_2,

  IS_CASSANDRA_AUTH_ENABLED: Boolean(env.CASSANDRA_AUTH_ENABLED),
  IS_DEVELOPMENT: env.NODE_ENV === "development",
  JAVA_API_BASE: env.JAVA_API_BASE || "http://localhost:5825",
  KB_TIMEOUT: env.KB_TIMEOUT || 60000,
  KEYCLOAK_ADMIN_PASSWORD: env.KEYCLOAK_ADMIN_PASSWORD || "",
  KEYCLOAK_ADMIN_USERNAME: env.KEYCLOAK_ADMIN_USERNAME || "",
  // tslint:disable-next-line: object-literal-sort-keys
  KC_NEW_USER_DEFAULT_PWD: env.KC_NEW_USER_DEFAULT_PWD || "User@123",
  KEYCLOAK_CLIENT_SECRET: env.client_secret,
  KEYCLOAK_CLIENT_SECRET_SASHAKT: env.KEYCLOAK_CLIENT_SECRET_SASHAKT,
  KEYCLOAK_REALM: env.KEYCLOAK_REALM || "sunbird",
  KEYCLOAK_REDIRECT_URL: env.KEYCLOAK_REDIRECT_URL || "https://requestbin.io/",
  KEYCLOAK_SESSION_TTL: 30 * 24 * 60 * 60 * 1000,
  KHUB_CLIENT_SECRET: env.KHUB_CLIENT_SECRET || "axc123",
  KHUB_GRAPH_DATA: env.KHUB_GRAPH_DATA || "http://localhost:3016",

  KHUB_SEARCH_BASE: env.KHUB_SEARCH_BASE || "http://localhost:3014",
  KNOWLEDGE_MW_API_BASE:
    env.KNOWLEDGE_MW_API_BASE || "http://knowledge-mw-service:5000",
  KONG_API_BASE: env.KONG_API_BASE || "https://sphere.aastrika.org/api",
  MSG91BASE: env.MSG91BASE || "http://localhost:3300",
  MSG91KEY: env.MSG91KEY || "http://localhost:3301",
  MSG91TEMPLATEID: env.MSG91TEMPLATEID || "http://localhost:3302",
  POST_ASSESSMENT_BASE: env.POST_ASSESSMENT_BASE || "http://localhost.com",
  POST_ASSESSMENT_CLIENT_ID: env.POST_ASSESSMENT_CLIENT_ID || "",
  POST_ASSESSMENT_CLIENT_SECRET: env.POST_ASSESSMENT_CLIENT_SECRET || "",
  S3_BUCKET_URL:
    env.S3_BUCKET_URL || "https://sunbirdcontent.s3-ap-south-1.amazonaws.com/",
  LEADERBOARD_API_BASE: env.LEADERBOARD_API_BASE || env.SB_EXT_API_BASE_2,
  LEARNING_HISTORY_API_BASE:
    env.LEARNING_HISTORY_API_BASE || env.SB_SEXT_API_BASE_3,
  LEARNING_HUB_API_BASE: env.LEARNING_HUB_API_BASE || env.SB_EXT_API_BASE_2,
  LIKE_API_BASE: env.LIKE_API_BASE || env.SB_EXT_API_BASE_2,
  MULTI_TENANT_KEYCLOAK:
    env.MULTI_TENANT_KEYCLOAK || "igot,https://igot-dev.in/auth,sunbird",
  NAVIGATOR_JSON_HOST:
    env.NAVIGATOR_JSON_HOST ||
    "http://localhost:3007/web-hosted/navigator/json",
  NODE_API_BASE: env.NODE_API_BASE || "http://localhost:5001",
  NODE_API_BASE_2: env.NODE_API_BASE_2 || "http://localhost:3009",
  NODE_API_BASE_2_CLIENT_ID: env.NODE_API_BASE_2_CLIENT_ID || "admin",
  NODE_API_BASE_2_CLIENT_SECRET:
    env.NODE_API_BASE_2_CLIENT_SECRET || "MdiDn@342$",
  NODE_API_BASE_3: env.NODE_API_BASE_3 || "http://localhost:3015",
  NOTIFICATIONS_API_BASE: env.NOTIFICATIONS_API_BASE || "http://localhost:5805",
  DISCUSSION_HUB_API_BASE:
    env.DISCUSSION_HUB_API_BASE || "http://localhost:4567",
  DISCUSSION_HUB_MIDDLEWARE:
    env.DISCUSSION_HUB_MIDDLEWARE || "http://localhost:3002",
  DISCUSSION_HUB_DEFAULT_PASSWORD:
    env.DISCUSSION_HUB_DEFAULT_PASSWORD || "nodebbUser123$",
  DISCUSSION_HUB_WRITE_API_KEY:
    env.DISCUSSION_HUB_WRITE_API_KEY || "5aaf0ac3-c7ad-4e06-bc1b-5311d462cef3",
  DISCUSSION_HUB_WRITE_API_UID: env.DISCUSSION_HUB_WRITE_API_UID || 1,
  OPEN_SABER_USER_REGISTRY_BASE:
    env.OPEN_SABER_USER_REGISTRY_BASE || "http://localhost:8005",
  PID_API_BASE: env.PID_API_BASE || "http://localhost:3304",
  PORTAL_API_WHITELIST_CHECK: env.PORTAL_API_WHITELIST_CHECK || "false",
  PORTAL_REALM: env.PORTAL_REALM || "sunbird",
  PLAYLISTV1_API_BASE: env.PLAYLISTV1_API_BASE || env.SBEXT_API_BASE_2,
  PLAYLIST_API_BASE: env.PLAYLIST_API_BASE || env.SBEXT_API_BASE,
  // tslint:disable-next-line:ban
  PORTAL_PORT: parseInt(env.PORTAL_PORT + "", 10) || 3003,
  PREFERENCE_API_BASE: env.PREFERENCE_API_BASE || env.SB_EXT_API_BASE_4,
  PROGRESS_API_BASE: env.PROGRESS_API_BASE || env.SB_EXT_API_BASE_2,
  RATING_API_BASE:
    env.RATING_API_BASE || env.SB_EXT_API_BASE_2 || "http://localhost:7001",
  RECOMMENDATION_API_BASE: env.RECOMMENDATION_API_BASE || env.SBEXT_API_BASE,
  RESET_PASSWORD: "",
  ROLES_API_BASE: env.ROLES_API_BASE || env.SB_EXT_API_BASE_2,
  SASHAKT_USER_DETAILS_URL: env.SASHAKT_USER_DETAILS_URL,
  SB_EXT_API_BASE: env.SBEXT_API_BASE || "http://localhost:5902",
  SB_EXT_API_BASE_2: env.SBEXT_API_BASE_2 || "http://localhost:7001",
  // SB_EXT_API_BASE_2: env.SB_EXT_API_BASE_2,
  SB_EXT_API_BASE_3:
    env.SBEXT_API_BASE_3 || env.SBEXT_API_BASE_2 || "http://localhost:7002",
  SB_EXT_API_BASE_4:
    env.SBEXT_API_BASE_4 ||
    env.SBEXT_API_BASE_2 ||
    env.SB_EXT_BASE_4 ||
    "http://localhost:7002",
  // SB_EXT_API_BASE_4: env.SB_EXT_API_BASE_4,

  SCORM_PLAYER_BASE: env.SCORM_PLAYER_BASE || "http://localhost:port",
  SEARCH_API_BASE: env.SEARCH_API_BASE || env.SBEXT_API_BASE,
  SOCIAL_TIMEOUT: env.SOCIAL_TIMEOUT || 10000,
  STATIC_ILP_PROXY: env.STATIC_ILP_PROXY || "http://localhost:3005",
  SUBMISSION_API_BASE: env.SUBMISSION_API_BASE || env.SB_EXT_API_BASE_2,

  TELEMETRY_API_BASE: env.TELEMETRY_API_BASE || "http://localhost:8090",
  TELEMETRY_SB_BASE: env.TELEMETRY_SB_BASE || "http://localhost:9090",
  TIMEOUT: env.TIMEOUT || 10000,
  TIMESPENT_API_BASE: env.TIMESPENT_API_BASE || env.SB_EXT_API_BASE_2,
  TNC_API_BASE: env.TNC_API_BASE || env.SB_EXT_API_BASE_4,
  USER_ANALYTICS: `${HTTPS_HOST}/LA1`,
  USER_CREATE_API_BASE: env.USER_CREATE_API_BASE,
  USER_CREATE_PASSWORD: env.USER_CREATE_PASSWORD || "C9Mg4@0q!J",
  USER_CREATE_USERNAME: env.USER_CREATE_USERNAME || "ui-client",
  USER_DETAILS_API_BASE: env.USER_DETAILS_API_BASE || env.SB_EXT_API_BASE_2,
  USER_PROFILE_API_BASE: env.USER_PROFILE_API_BASE || "http://localhost:3004",
  USER_SUNBIRD_DETAILS_API_BASE: "https://igot-sunbird.idc.tarento.com",
  USER_BULK_UPLOAD_DIR: env.USER_BULK_UPLOAD_DIR,
  USE_SERVING_HOST_COUNTER: env.USE_SERVING_HOST_COUNTER,
  VIEWER_PLUGIN_RDBMS_API_BASE:
    process.env.VIEWER_PLUGIN_RDBMS_API_BASE || "http://localhost:5801",
  WEB_HOST_PROXY: env.WEB_HOST_PROXY || "http://localhost:3007",

  COHORTS_API_BASE: env.COHORTS_API_BASE || env.SB_EXT_API_BASE_2,
  CONTENT_SOURCE_API_BASE: env.CONTENT_SOURCE_API_BASE || env.SB_EXT_API_BASE_2,
  CONTINUE_LEARNING_API_BASE:
    env.CONTINUE_LEARNING_API_BASE || env.SB_EXT_API_BASE_2,
  FRAC_API_BASE: env.FRAC_API_BASE || "https://igot-frac-dev.tarento.com",
  NETWORK_SERVICE_BACKEND: env.NETWOR_SERVICE_API_BASE || "http:localhost:7001",
  CONTENT_VALIDATION_API_BASE:
    env.CONTENT_VALIDATION_API_BASE || "http://localhost:6590",
  PROFANITY_SERVICE_API_BASE:
    env.PROFANITY_SERVICE_API_BASE || "http://localhost:4001",
  DISCUSSION_CATEGORY_LIST:
    env.DISCUSSION_CATEGORY_LIST ||
    "cid[]=5&cid[]=6&cid[]=8&cid[]=9&cid[]=10&cid[]=11&cid[]=12&cid[]=13",
  WORKFLOW_HANDLER_SERVICE_API_BASE:
    env.WORKFLOW_HANDLER_SERVICE_API_BASE || "http://localhost:5099",
  SUNBIRD_PROXY_URL:
    env.SUNBIRD_PROXY_URL ||
    "https://igot-sunbird.idc.tarento.com/apis/proxies/v8/action",
  SUNBIRD_PROXY_API_BASE:
    env.SUNBIRD_PROXY_API_BASE || "https://igot-dev.in/api",
  SCORING_SERVICE_API_BASE:
    env.SCORING_SERVICE_API_BASE || "http://localhost:7014",
  // tslint:disable-next-line:max-line-length
  SB_API_KEY: env.SB_API_KEY || "",
  LEARNER_SERVICE_API_BASE:
    env.LEARNER_SERVICE_API_BASE || "http://learner-service:9000",
  X_Channel_Id: env.X_CHANNEL_ID || "",
  NOTIFICATION_SERVIC_API_BASE:
    env.NOTIFICATION_SERVIC_API_BASE || "http://notification-service:9000",
  NOTIFY_SEND_FOR_REVIEW_BODY:
    "You have received request to review the content #contentLink",
  NOTIFY_REVIEW_FAILED:
    "The content #contentLink which sent for review requires few more changes. Please contact the reviewers.",
  NOTIFY_REVIEW_COMPLETED_BODY:
    "The content #contentLink is successfully reviewed and sent to publishers to publish the Content.",
  NOTIFY_SEND_FOR_PUBLISH_BODY:
    "You have received request to publish the content #contentLink",
  NOTIFY_PUBLIST_FAILED:
    "The content #contentLink which sent for publish requires few more changes. Please contact the publishers.",
  NOTIFY_PUBLISH_COMPLETED_BODY:
    "The content #contentLink is successfully published." +
    " The content will be available for the users in few hours.",
  NOTIFY_EMAIL_TEMPLATE_ID: "emailtemplate",
  CONTENT_SERVICE_API_BASE:
    env.CONTENT_SERVICE_API_BASE || "http://content-service:9000",
  VM_LEARNING_SERVICE_URL: env.VM_LEARNING_SERVICE_URL,
  // tslint:disable-next-line: max-line-length
  CERT_AUTH_TOKEN: "",
  GOOGLE_CLIENT_ID: env.google_client_id || "",
  BULK_USER: env.BULK_USER || "Sunbird@123",
};

export const RESTRICTED_PYTHON_STMT: string[] = process.env
  .RESTRICTED_CHARACTERS
  ? process.env.RESTRICTED_CHARACTERS.split("###")
  : [];
