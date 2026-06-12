# sunbird-cb-uiproxy

A Node.js/Express-based API proxy and gateway for the Sunbird Content-Based (CB) platform. It acts as the middleware layer between the frontend UI and various backend microservices, handling authentication, request routing, and data transformation.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [API Structure](#api-structure)
  - [Public APIs](#public-apis-publicv8)
  - [Protected APIs](#protected-apis-protectedv8)
  - [Proxy Routes](#proxy-routes-proxiesv8)
- [Authentication](#authentication)
- [Testing](#testing)
- [Docker](#docker)
- [CI/CD](#cicd)

---

## Overview

`sunbird-cb-uiproxy` serves as the backend-for-frontend (BFF) layer for the Aastrika/iGOT Sunbird platform. It:

- Exposes **public APIs** for authentication, signup, and content discovery
- Exposes **protected APIs** (Keycloak JWT-authenticated) for user management, learning progress, social features, and more
- **Proxies** requests to downstream microservices (Kong, Knowledge MW, Content Service, Learner Service, etc.)
- Manages **real-time communication** via Socket.IO for notifications
- Supports **multi-tenancy** via org/rootOrg headers
- Scales horizontally using Node.js **cluster mode**

---

## Architecture

```
Browser / Mobile App
        │
        ▼
┌─────────────────────────────────────┐
│         sunbird-cb-uiproxy          │
│  Port: 3003                         │
│                                     │
│  ┌─────────────┐  ┌──────────────┐  │
│  │ Public APIs  │  │Protected APIs│  │
│  │ /public/v8/ │  │/protected/v8/│  │
│  └─────────────┘  └──────────────┘  │
│         │                │          │
│  ┌──────────────────────────────┐   │
│  │        Proxy Layer           │   │
│  │       /proxies/v8/           │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
        │
        ├── Kong API Gateway
        ├── Knowledge MW Service
        ├── Content Service
        ├── Learner Service
        ├── Notification Engine (:3013)
        ├── FRAC Service
        ├── Discussion Service
        └── Registry Service
```

**Databases used internally:**

#### Cassandra — Most heavily used

Primary role: HTTP session persistence + Sunbird's main transactional store.

| Use Case | Keyspace | Table(s) |
|---|---|---|
| HTTP session persistence | `portal` | `sessions` (via `cassandra-store`) |
| Event lifecycle (create / update / retrieve) | `sunbird` | `rc_events`, `rc_events_users` |
| OTP authentication | `sunbird` | `otp` |
| Assessment submission tracking | `sunbird_courses` | `user_assessment_info` |
| User identity / Keycloak UUID mapping | `bodhi` | `eagle_unique_identifiers`, `eagle_uuid_master` |
| Bulk user upload tracking | `sunbird` | `user_sso_bulkupload_v2` |
| User access paths & permissions | `bodhi` | `user_access_paths`, `bulk_user_upload_detail` |
| User profile journey audit trail | `sunbird` | `user_profile_journey` |

Key files: `src/configs/session.config.ts`, `src/protectedApi_v8/rcEvents.ts`, `src/publicApi_v8/userOtp.ts`, `src/utils/assessmentSubmitHelper.ts`, `src/utils/keycloak-user-creation.ts`, `src/protectedApi_v8/admin/bulkUploadUser.ts`, `src/protectedApi_v8/admin/userRegistration.ts`, `src/protectedApi_v8/user/profile-details.ts`

#### PostgreSQL — Competency data + State-specific registrations

| Use Case | Table | Files |
|---|---|---|
| Competency/skill node lookup (feeds Elasticsearch filters) | `public.data_node` | `publicSearch.ts`, `courseRecommendation.ts`, `recommendationEngineV2.ts` |
| Madhya Pradesh NHM user registration | `mp_registration_data` | `publicApi_v8/mpNHMUser.ts` |
| Bihar NRHM (BNRC) user registration | `bnrc_registration_data_prod` | `publicApi_v8/bnrcUser.ts` |

The `data_node` table is the bridge between search and recommendations: APIs first do an `ILIKE` query on `data_node` to resolve competency IDs, then use those IDs to build Elasticsearch `terms` filters across competency levels 1–5.

#### Elasticsearch — Search & Autocomplete

| Use Case | Index | Files | Access Method |
|---|---|---|---|
| User autocomplete (firstName / lastName matching) | `user_alias` | `protectedApi_v8/autoCompletev2.ts` | `elasticsearch` npm client |
| Homepage and content search autocomplete | content indices | `publicApi_v8/home.ts`, `protectedApi_v8/content.ts` | HTTP (`axios` → `ES_BASE`) |
| Infosys radio content search | `lexcontentindex` | `protectedApi_v8/infyradio.ts` | HTTP (`axios` → `ES_BASE`) |
| Topic autocomplete | `lex_topic` | `protectedApi_v8/user/topic.ts` | HTTP (`axios` → `ES_BASE`) |

#### MongoDB — Declared but not actively used

`MONGODB_URL` is defined in `src/utils/env.ts` but no MongoDB client, collections, or queries exist in the codebase. Reserved for future use.

---

## Tech Stack

| Category | Technology | Version |
|---|---|---|
| Runtime | Node.js | 20.19.2 |
| Language | TypeScript | 4.2.4 |
| Framework | Express.js | 4.22.2 |
| Authentication | Keycloak (`keycloak-connect`), Google OAuth (`google-auth-library`) | 7.0.1 / 7.10.0 |
| JWT | `jsonwebtoken` | 9.0.2 |
| Real-time | Socket.IO | 4.8.1 |
| HTTP Client | Axios | 0.19.1 |
| Databases | Cassandra (`cassandra-driver`), PostgreSQL (`pg`), Elasticsearch | 4.6.4 / 8.11.3 / 16.7.2 |
| Cloud | AWS SDK, Firebase Admin | 2.1693.0 / 11.11.1 |
| Logging | Pino | 6.11.3 |
| Utilities | Lodash | 4.18.1 |
| Build | Gulp | 4.0.2 |
| Package Manager | Yarn | 1.22.22 |
| Process Manager | Node cluster / Nodemon | — / 1.19.1 |
| Containerization | Docker | — |
| CI/CD | Jenkins | — |

---

## Prerequisites

- **Node.js** >= 14.x
- **Yarn** >= 1.22.x
- **Keycloak** instance running
- **Cassandra** (for session storage)
- Access to backend services (Kong, Knowledge MW, etc.)

---

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd sunbird-cb-uiproxy

# Install dependencies
yarn install

# Build TypeScript
yarn build
```

---

## Environment Variables

Copy `env-file` and populate with your values. Key variables:

| Variable | Description | Default |
|---|---|---|
| `HTTPS_HOST` | Main server base URL | `https://aastrika-sb.idc.tarento.com` |
| `PORTAL_PORT` | Server port | `3003` |
| `KONG_API_BASE` | Kong API gateway base URL | `https://sphere.aastrika.org/api` |
| `KNOWLEDGE_MW_API_BASE` | Knowledge middleware base URL | — |
| `SUNBIRD_PROXY_API_BASE` | Sunbird API gateway base URL | — |
| `CASSANDRA_IP` | Cassandra host IP | `10.0.75.1` |
| `CASSANDRA_KEYSPACE` | Cassandra keyspace | — |
| `CASSANDRA_USERNAME` | Cassandra username | — |
| `CASSANDRA_PASSWORD` | Cassandra password | — |
| `MONGODB_URL` | MongoDB connection string | — |
| `POSTGRES_HOST` | PostgreSQL host | — |
| `POSTGRES_PORT` | PostgreSQL port | — |
| `POSTGRES_DATABASE` | PostgreSQL database name | — |
| `POSTGRES_USER` | PostgreSQL username | — |
| `POSTGRES_PASSWORD` | PostgreSQL password | — |
| `ES_BASE` | Elasticsearch base URL | — |
| `ES_USERNAME` | Elasticsearch username | — |
| `ES_PASSWORD` | Elasticsearch password | — |
| `S3_BUCKET_URL` | AWS S3 bucket URL for content | — |
| `CDN_DOMAIN` | CDN domain for assets | — |
| `SB_API_KEY` | Sunbird API key | — |
| `KEYCLOAK_SESSION_SECRET` | Keycloak session secret | — |
| `KC_NEW_USER_DEFAULT_PWD` | Default password for new Keycloak users | — |
| `CLUSTER_THREAD` | Number of worker threads | `1` |
| `NODE_ENV` | Environment (`development`/`production`) | — |
| `CORS_ENVIRONMENT` | CORS mode (`dev`/`prod`) | — |
| `PORTAL_API_WHITELIST_CHECK` | Enable API whitelist validation | `false` |
| `TIMEOUT` | HTTP request timeout (ms) | `10000` |
| `X_CHANNEL_ID` | Channel ID for Sunbird APIs | `0131397178949058560` |
| `NOTIFICATION_SERVIC_API_BASE` | Notification service base URL | — |

---

## Running the Application

```bash
# Production (after build)
yarn start

# Development with hot-reload (Aastrika dev config)
yarn start:dev

# Development for staging
yarn start:stage

# iGOT staging
yarn start:igot

# With nodemon (generic)
yarn start:nodemon
```

The server starts on port `3003` by default.

---

## API Structure

The proxy exposes three route groups mounted in `src/server.ts`:

| Route Group | Mount Path | Auth Required |
|---|---|---|
| Public APIs | `/public/v8/` | No |
| Protected APIs | `/protected/v8/` | Yes (Keycloak JWT) |
| Proxy Routes | `/proxies/v8/` | Varies |

---

## Public APIs (`/public/v8/`)

No authentication required. Used for login, registration, content discovery.

| Route | Description |
|---|---|
| `GET /public/v8/` | Health check for public API |
| `/public/v8/assets/*` | Proxy to public web client assets |
| `/public/v8/competency/*` | Public competency user data |
| `/public/v8/tnc/*` | Terms and conditions |
| `/public/v8/signup/*` | User signup with unique code |
| `/public/v8/signupWithAutoLogin/*` | Signup and auto-login |
| `/public/v8/signupWithAutoLoginV2/*` | Signup and auto-login (v2) |
| `/public/v8/signupWithAutoLoginOrgForm/*` | Org-form based signup and auto-login |
| `/public/v8/homePage/*` | Homepage data — latest courses, search, catalog |
| `/public/v8/register/*` | Custom signup form |
| `/public/v8/emailMobile/*` | Email/mobile login and signup |
| `/public/v8/login/*` | Login via email/mobile |
| `/public/v8/google/*` | Google OAuth sign-in |
| `/public/v8/forgot-password/*` | Forgot password / reset via OTP |
| `/public/v8/publicContent/*` | Public content endpoints |
| `/public/v8/certificate/*` | Certificate validation |
| `/public/v8/sashaktAuth/*` | Sashakt SSO authentication |
| `/public/v8/appCertificateDownload/*` | Certificate download for mobile apps |
| `/public/v8/publicCertificateFlinkv2/*` | Certificate Flink v2 |
| `/public/v8/mobileApp/*` | Mobile application-specific APIs |
| `/public/v8/publicSearch/*` | Content search (unauthenticated) |
| `/public/v8/publicTelemetry/*` | Telemetry event tracking |
| `/public/v8/competencyAssets/*` | Competency asset retrieval |
| `/public/v8/competencyReporting/*` | Competency reporting data |
| `/public/v8/appSignUpWithAutoLogin/*` | Mobile app signup with auto-login |
| `/public/v8/maternityFoundation/*` | Maternity Foundation SSO auth |
| `/public/v8/userReporting/*` | User reporting endpoints |
| `/public/v8/deactivateUser/*` | User account deactivation |
| `/public/v8/testUserOtp/*` | OTP generation and verification for users |
| `/public/v8/ssoLogin/*` | SSO login handling |
| `/public/v8/tnai/*` | TNAI authentication |
| `/public/v8/tnnmc/*` | TNNMC authentication (v2) |
| `/public/v8/mnc/*` | Maharashtra Nursing Council authentication |
| `/public/v8/bnrcUserCreation/*` | BNRC user creation |
| `/public/v8/courseRecommendation/*` | Course recommendations (public) |
| `/public/v8/ratingsSearch/*` | Content ratings search |
| `/public/v8/upsmfUserCreation/*` | UPSMF user creation |
| `/public/v8/mpNHMUserCreation/*` | MP NHM user creation |
| `/public/v8/publicReadForm/*` | Public form reading |

---

## Protected APIs (`/protected/v8/`)

Require a valid Keycloak JWT token in the `Authorization: Bearer <token>` header.

### Core

| Route | Description |
|---|---|
| `GET /protected/v8/` | Health check for protected API |
| `/protected/v8/content/*` | Content hierarchy, search, reorder |
| `/protected/v8/catalog/*` | Catalog management |
| `/protected/v8/assessment/*` | Assessment endpoints |
| `/protected/v8/assessmentCompetency/*` | Assessment-competency mapping |
| `/protected/v8/concept/*` | Concept graph management |
| `/protected/v8/certifications/*` | Certification management |
| `/protected/v8/cohorts/*` | Cohort management |
| `/protected/v8/competency/*` | Competency framework |
| `/protected/v8/entityCompetency/*` | Entity-competency mapping |
| `/protected/v8/profanity/*` | Content profanity/validation |
| `/protected/v8/counter/*` | Counter service |

### Learning & Progress

| Route | Description |
|---|---|
| `/protected/v8/leaderboard/*` | Leaderboard rankings |
| `/protected/v8/recommendation/*` | Content recommendations |
| `/protected/v8/recommendationEngineV2/*` | ML-based recommendation engine v2 |
| `/protected/v8/autoEnrollmentv2/*` | Auto-enrollment in courses |
| `/protected/v8/autoCompletev2/*` | Auto-completion of course segments |
| `/protected/v8/updateProgressv2/*` | Learning progress tracking v2 |
| `/protected/v8/updateProgressv3/*` | Learning progress tracking v3 |
| `/protected/v8/attended-content/*` | Attended/viewed content tracking |
| `/protected/v8/userEnrolledInSource/*` | Enrollment source tracking |
| `/protected/v8/playlist/*` | Playlist management |
| `/protected/v8/scrom/*` | SCORM compliance tracking |
| `/protected/v8/scroing/*` | Scoring engine |

### Social & Community

| Route | Description |
|---|---|
| `/protected/v8/social/*` | Social features (likes, shares, comments) |
| `/protected/v8/connections/*` | User connections (v2) |
| `/protected/v8/network/*` | Network connections |
| `/protected/v8/networkHub/*` | Network hub |
| `/protected/v8/discussionHub/*` | Discussion hub (categories, topics, posts) |
| `/protected/v8/khub/*` | Knowledge hub |

### Events & Training

| Route | Description |
|---|---|
| `/protected/v8/events/*` | Event management |
| `/protected/v8/event-external/*` | External event integration |
| `/protected/v8/training/*` | Training management |

### Administration

| Route | Description |
|---|---|
| `/protected/v8/admin/*` | Admin panel (bulk upload, SSO mapping, roles) |
| `/protected/v8/dept/*` | Department management |
| `/protected/v8/workallocation/*` | Work allocation |
| `/protected/v8/workflowhandler/*` | Workflow management |
| `/protected/v8/frac/*` | FRAC (Framework for Role and Competency) integration |
| `/protected/v8/roleactivity/*` | Role activity management |
| `/protected/v8/resource/*` | Keycloak resource/role management |
| `/protected/v8/portal/*` | Portal v3 APIs |

### Certificates & Ratings

| Route | Description |
|---|---|
| `/protected/v8/creatorCertificateTemplate/*` | Certificate template management |
| `/protected/v8/rcCert/*` | RC certificate management |
| `/protected/v8/sunbirdrRcCertificate/*` | Sunbird RC certificate events |
| `/protected/v8/ratings/*` | Extended content ratings (CB) |

### Misc

| Route | Description |
|---|---|
| `/protected/v8/navigator/*` | Navigation data |
| `/protected/v8/translate/*` | Translation services |
| `/protected/v8/profileupdatev2/*` | User profile update v2 |
| `/protected/v8/AI/*` | AI Hub Research service |

### User Sub-Routes (`/protected/v8/user/*`)

| Route | Description |
|---|---|
| `/protected/v8/user/profile/*` | User profile read/write |
| `/protected/v8/user/dashboard/*` | User learning dashboard |
| `/protected/v8/user/progress/*` | Learning progress |
| `/protected/v8/user/content/*` | User-specific content |
| `/protected/v8/user/activity/*` | User activity log |
| `/protected/v8/user/group/*` | Group management |
| `/protected/v8/user/notifications/*` | User notifications |
| `/protected/v8/user/feedback/*` | Feedback collection |
| `/protected/v8/user/goals/*` | Learning goal management |
| `/protected/v8/user/badge/*` | Badge management |
| `/protected/v8/user/skills/*` | Skill tracking |
| `/protected/v8/user/roles/*` | Role assignment |
| `/protected/v8/user/ratings/*` | Content ratings |
| `/protected/v8/user/follow/*` | Follow/unfollow users |
| `/protected/v8/user/playlist/*` | Personal playlists |
| `/protected/v8/user/preference/*` | User preferences |
| `/protected/v8/user/history/*` | Learning history |
| `/protected/v8/user/miniProfile/*` | Mini profile view |
| `/protected/v8/user/myAnalytics/*` | Personal analytics |
| `/protected/v8/user/share/*` | Content sharing |
| `/protected/v8/user/evaluate/*` | Evaluation endpoints |
| `/protected/v8/user/exercise/*` | Exercise tracking |
| `/protected/v8/user/email/*` | Email management |
| `/protected/v8/user/tnc/*` | TNC acceptance |
| `/protected/v8/user/validate/*` | User validation |
| `/protected/v8/user/viewprofile/*` | View other user profiles |
| `/protected/v8/user/autocomplete/*` | Autocomplete suggestions |
| `/protected/v8/user/account-settings/*` | Account configuration |
| `/protected/v8/user/accessControl/*` | Access control checks |
| `/protected/v8/user/token/*` | Token management |
| `/protected/v8/user/rc-certificate/*` | RC certificate for user |
| `/protected/v8/user/profileRegistry/*` | Profile registry |
| `/protected/v8/user/mandatoryContent/*` | Mandatory content tracking |
| `/protected/v8/user/topics/*` | Topics management |
| `/protected/v8/user/telemetry/*` | User telemetry |

---

## Proxy Routes (`/proxies/v8/`)

Transparent HTTP proxies forwarding to backend services.

| Route | Description | Backend |
|---|---|---|
| `GET /proxies/v8/getContent` | Get single content item | Knowledge MW |
| `GET /proxies/v8/getContents/*` | Content delivery via S3 | AWS S3 |
| `GET /proxies/v8/getContentsv2/*` | Content delivery via CloudFront | CloudFront CDN |
| `GET /proxies/v8/getContentsv3/*` | Content delivery via CDN domain | CDN Domain |
| `GET /proxies/v8/logout/user` | Logout user from Keycloak | Keycloak |
| `POST /proxies/v8/upload/action/*` | Upload content to backend | Content Service |
| `POST /proxies/v8/private/upload/*` | Private file uploads | Content Service |
| `* /proxies/v8/content/*` | Content management | Knowledge MW |
| `* /proxies/v8/contentv3/*` | Content v3 operations | Knowledge MW |
| `* /proxies/v8/registry/*` | Registry operations | Registry Service |
| `* /proxies/v8/action/*` | General action APIs | Knowledge MW |
| `* /proxies/v8/action/questionset/v1/*` | Question set management | QML Service |
| `* /proxies/v8/action/question/v1/*` | Question management | QML Service |
| `* /proxies/v8/learner/*` | Learner APIs | Learner Service |
| `* /proxies/v8/user/*` | User APIs | Kong Gateway |
| `* /proxies/v8/org/*` | Organization APIs | Kong Gateway |
| `* /proxies/v8/api/*` | General API pass-through | Kong Gateway |
| `* /proxies/v8/data/*` | Data endpoints | Kong Gateway |
| `* /proxies/v8/notification/*` | Notification APIs | Notification Engine |
| `* /proxies/v8/discussion/*` | Discussion forums | Discussion Service |
| `* /proxies/v8/forms/*` | Form service | Form Service |
| `* /proxies/v8/ext-forms/*` | External form service | Form Service |
| `* /proxies/v8/entity/v1/*` | Entity APIs | FRAC Service |
| `POST /proxies/v8/userData/v1/bulkUpload` | Bulk user data upload | Kong Gateway |
| `GET /proxies/v8/certreg/v2/certs/download/*` | Certificate download | Certificate Registry |
| `POST /proxies/v8/course/batch/cert/v1/issue` | Issue course certificate | Learner Service |
| `POST /proxies/v8/notifyContentState` | Content state notifications | Notification Service |
| `GET /proxies/v8/ilp-api/*` | ILP service proxy | ILP Service |
| `GET /proxies/v8/scorm-player/*` | SCORM player | SCORM Service |
| `GET /proxies/v8/LA/*` | Learning Analytics | Analytics Service |
| `GET /proxies/v8/sunbirdigot/*` | Sunbird iGOT search | Sunbird Search |
| `* /proxies/v8/assets/*` | Static assets | CDN / Static Server |
| `* /proxies/v8/web-hosted/*` | Web-hosted resources | Web Host |

---

## Authentication

- **Mechanism**: Keycloak (OpenID Connect / JWT)
- **Protected routes**: All `/protected/*` routes require `Authorization: Bearer <token>`
- **Public routes**: `/public/*` routes do not require authentication
- **Socket.IO**: JWT is validated on WebSocket connection
- **SSO Integrations**: Google OAuth, Sashakt, TNAI, TNNMC, MNC, Maternity Foundation

---

## Testing

```bash
# Run tests
npm run test

# Run tests with coverage report
npm run test-with-coverage
```

Coverage reports are generated in `/coverage/` (lcov format).

---

## Docker

```bash
# Build image
docker build -f Dockerfile -t sunbird-cb-uiproxy .

# Build for production
docker build -f Dockerfile.main -t sunbird-cb-uiproxy:prod .

# Run container
docker run -p 3003:3003 --env-file env-file sunbird-cb-uiproxy
```

---

## CI/CD

- **Jenkins**: `Jenkinsfile`, `Jenkinsfile-sun`, `Jenkinsfile-sonar`
- **SonarQube**: Code quality scanning via `Jenkinsfile-sonar`
- **Build script**: `build.sh`, `dockbuild-prod.sh`
- **Linting**: `yarn lint` (TSLint)
- **Git hooks**: Husky (pre-commit lint)
