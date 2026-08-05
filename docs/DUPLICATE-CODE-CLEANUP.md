# Duplicate code cleanup — safety-tiered review

> **This is a research/documentation deliverable only.** No code has been
> changed as a result of this investigation. Every item below needs
> explicit sign-off before anyone touches it — the entire point of this
> document is to separate "safe to clean up" from "do not touch" *before*
> any refactor is attempted, so that closing SonarQube's duplication metric
> never comes at the cost of breaking a working production feature.

## Headline numbers (SonarQube, at time of writing)

| Metric | Value |
|---|---|
| Overall duplicated lines density | **26.8%** |
| Total duplicated lines | 12,389 |
| Total duplicated blocks | 6,058 |
| Total lines of code (ncloc) | 41,288 |
| Files with any duplication | 62 |

Investigation method: pulled every file's duplication data from SonarQube's
`/api/duplications/show` endpoint (exact matched line ranges, not just the
density percentage), then read the actual source on both sides of every
match to determine whether the "duplicate" text is truly interchangeable
or only superficially similar. This mattered — several clusters that Sonar
reports as byte-identical duplicates turned out, on inspection, to already
contain real behavioral divergence (see Level 3 findings below). Sonar's
duplicate detector matches token sequences; it cannot tell that two
similar-looking blocks encode different business rules, so its raw
percentage is not a safe proxy for "how much of this could be deleted."

---

## Special case #1: `src/utils/whitelistApis.ts` — NOT a cleanup candidate at all

This single file accounts for **1,574 of the 12,389 duplicated lines
(12.7% of all duplication in the repo)**, at an internal duplication
density of **81.6%** (5,309 duplicate blocks inside one 1,928-line file).
It is the single largest contributor to the 26.8% figure by a wide margin.

It is **not** copy-pasted logic — it is a large authorization table:
`API_LIST.URL` maps ~150+ literal request paths to
`{ checksNeeded: [...], ROLE_CHECK: [...] }` objects, consumed directly by
`src/utils/apiWhiteList.ts` via `_.get(API_LIST.URL, REQ_URL)` on **every
incoming request** — this is the live security gate for the whole app.

The repeated *shape* (`{ checksNeeded: [CHECK.ROLE], ROLE_CHECK: [...] }`)
across hundreds of different URL keys is what Sonar is matching — but
each key is a **different actual security boundary**. There is no way to
"deduplicate" this that doesn't risk either deleting a security check for
one URL or silently applying one URL's role list to a different URL.

**Verdict: do not include this file in any cleanup effort.** The
effort-to-risk ratio is about as bad as it gets in this codebase — the
only theoretically "safe" restructuring (grouping URLs by shared
role-config, e.g. `{ roles: [...], urls: [...] }`) would still require
changing `apiWhiteList.ts`'s lookup logic itself, which gates every
protected endpoint in the app. Recommend closing this out of scope
entirely rather than assigning it a tier.

## Special case #2: dead code found during this investigation

Three files turned out to be **unreferenced by the running application** —
discovered as a side effect of investigating their "duplication" with a
live sibling file. Deleting genuinely dead code is a different (and
generally much safer) kind of cleanup than de-duplicating live code, but
it still needs explicit confirmation that nothing external (docs, mobile
app clients, Postman collections, another service) targets these paths
before removal — that confirmation is a sign-off question, not something
resolvable by reading this repo alone.

| File | Status | Evidence |
|---|---|---|
| `src/protectedApi_v8/socialv2.ts` | Not mounted anywhere | Only reference in `src/` is its own test file; `protectedApiV8.ts` only mounts `social.ts`'s `socialApi` |
| `src/protectedApi_v8/connections.ts` | Not mounted anywhere | Its import **and** its `.use()` call are both commented out in `protectedApiV8.ts` (lines 17, 90); only `connections_v2.ts` is live |
| `src/publicApi_v8/userDataMigration.ts` | Not mounted anywhere | Only `forgotPassword.ts` is `.use()`-d at `/forgot-password/`; `userDataMigration.ts` has no mount call. **Also contains its own bug** (see below) |

**Important:** `userDataMigration.ts` isn't just dead — its `/verifyOtp`
route **skips real OTP verification entirely** and resets the user's
password unconditionally once the account is found, unlike the live
`forgotPassword.ts`, which correctly checks
`verifyOtpResponse.data.result.response === 'SUCCESS'` first. This is a
real OTP-bypass bug sitting in unreachable code today. If this file is
ever re-mounted for any reason, that bug must be fixed first. Recorded
here and cross-referenced in `docs/PROD-VERIFICATION.md`.

`socialv2.ts` is also not a full superset/subset of `social.ts` — it's
missing ~10 routes `social.ts` has (moderator/admin/forum endpoints), so
even setting aside the dead-code question, it was never a drop-in v2
replacement.

---

## Level 1 — genuinely safe, zero prod impact

Criteria: the duplicated block is provably identical in structure *and*
error handling on every side of the match, the only variance is a plain
string/constant (a URL, a log label, a field name) that can be passed as
a parameter, and no documented bug or security-sensitive logic overlaps
the block.

| # | Files | What's duplicated | What varies | Proposed extraction |
|---|---|---|---|---|
| L1-1 | `upsmfUser.ts`, `mpNHMUser.ts`, `bnrcUser.ts`, `signupWithAutoLoginOrgForm.ts` | Postgres pool bootstrap (`new Pool({...})` + error/connect/remove handlers) | Nothing — byte-identical | Shared `pgPool.ts` module |
| L1-2 | `upsmfUser.ts`, `mpNHMUser.ts`, `bnrcUser.ts` | `API_END_POINTS`, `msg91Headers`, `indianCountryCode`, `registrationSource`, `standardDob`, `userSuccessRegistrationMessage` | Nothing — byte-identical | Shared constants module |
| L1-3 | `upsmfUser.ts`, `mpNHMUser.ts`, `bnrcUser.ts` | Joi validators for `phone`, `firstName`, `lastName`, `district`, `email` | Nothing — identical text incl. error messages | Shared Joi fragments (`requiredPhoneValidator`, etc.) |
| L1-4 | `signupWithAutoLogin.ts`, `signupWithAutoLoginV2.ts`, `appSignUpWithAutoLogin.ts` | `API_END_POINTS`/`msg91Headers`/`indianCountryCode` (3-file-identical subset only — `emailOrMobileLoginSignIn.ts`'s map differs, see caveat) | Nothing among these 3 | Shared constants module; leave `emailOrMobileLoginSignIn.ts`'s map separate |
| L1-5 | `signupWithAutoLogin.ts`, `signupWithAutoLoginV2.ts`, `appSignUpWithAutoLogin.ts` | `createAccount()` helper (POST `user/v3/create`) | Nothing | Shared helper, parameterized on `profileData` |
| L1-6 | `signupWithAutoLogin.ts`, `signupWithAutoLoginV2.ts`, `appSignUpWithAutoLogin.ts` | `profileUpdate()` helper | Nothing | Shared helper |
| L1-7 | `signupWithAutoLogin.ts`, `signupWithAutoLoginV2.ts`, `appSignUpWithAutoLogin.ts`, `emailOrMobileLoginSignIn.ts` | `fetchUserBymobileorEmail()` (GET `user/v1/exists/...`) | Nothing — byte-identical in all 4 | Shared helper, parameterized on `(searchValue, searchType)`. **Scope any extraction to just these 4 files** — the same function also appears in `maternityFoundationAuth.ts`/`tnnmcAuthV2.ts`/`tnnmcAuth.ts`/`sashaktAuth.ts`/`tnaiAuth.ts`, which are Level 3 (see below); don't chase the full 9-file blast radius in one change |
| L1-8 | `social.ts`, `socialv2.ts`, `connections.ts`, `connections_v2.ts` | Generic catch-block error boilerplate + auth-header-object construction | Log-tag string only | Shared `sendErrorResponse`/`buildAuthHeaders` helpers (independent of the dead-code question in Special Case #2) |
| L1-9 | `myAnalytics.ts` (self-duplication) | Generic catch-block tail (~24 occurrences) | Nothing | Shared error handler |
| L1-10 | `leaderboard.ts` (self-duplication) | 10 routes' proxy-POST boilerplate (`/fetchLeaderBoardDetails`, `/leaderboardActivities`, etc.) + `updateApprovedPoints`/`updateConfiguration` pair | Only the endpoint constant (and one hardcoded ID override) | `proxyPost(res, endpoint, userIdOverride?, req)` helper |
| L1-11 | `publicSearch.ts` ↔ `ratingsSearch.ts` | The "primary query" object literal + the ~100-line "query" branch (ES search → Postgres competency lookup → secondary search → merge) | Nothing — line-by-line identical incl. variable names | Shared `handleQuerySearch(...)` function |
| L1-12 | `content.ts` (self-duplication, ~15 routes) | Org/rootOrg 400-guard + generic catch block | Optional log-label string only | `requireOrgHeaders(req,res)` + `handleApiError(res,err,label?)` |
| L1-13 | `content.ts` ↔ `home.ts` ↔ `publicContent.ts` | `searchAutoComplete` handler, `searchV6` handler, response-shaping tail | Only the `uuid` source (`extractUserIdFromRequest` vs constant) — **see Level 2 note**, cross-boundary extraction of the full `searchAutoComplete` block itself is L2, but the smaller response-shaping tail alone is L1 | Split: shape-tail as its own small helper now; leave the full search handlers for the L2 workstream |
| L1-14 | `content.ts` (self-duplication) | `hierarchy/update` vs `kb/:updateType` handlers | Endpoint-builder function/param only | Mechanical merge |
| L1-16 | `goals.ts` (self-duplication, ~12 routes) | Org-guard + axios call + catch, across `/share`, `/action/...`, `/common`, `/track/...`, etc. | Verb, endpoint, optional response-transform function | `withOrgValidation(req, res, coreFn)` wrapper |
| L1-17 | `rdbms.ts` (self-duplication, ~9 routes) | GET-proxy and POST-proxy boilerplate — the cleanest file found in this whole investigation | URL suffix + log label only | `proxyGet`/`proxyPost` helper pair; would deduplicate nearly the entire file |
| L1-18 | `discussionHub/writeApi.ts` (self-duplication, excl. the `/users` route — see Level 3) | `getRootOrg`/`extractUserIdFromRequest`/catch boilerplate across 8 routes; `topics` create vs reply body-build | Log label only | Shared boilerplate helper — **exclude the `/users` route and its neighborhood, which touches the documented never-invoked-closure bug** |
| L1-19 | `discussionHub/users.ts` (self-duplication, 7 of 9 routes) | `/bookmarks`, `/downvoted`, `/groups`, `/info`, `/posts`, `/upvoted`, `/watched`, `/about` — identical proxy skeleton | Endpoint function + log label only | `proxySlugResource(endpointFn, label, req, res)` — **do not fold in `/me` or `/email/:email`**, the latter touches the documented closure bug |
| L1-20 | `follow.ts` (self-duplication, ~6 routes) | Org-guard + POST + generic catch, across follow/unfollow/followers/following | Endpoint constant + body-builder only | `postWithOrgGuard(endpoint, buildBody, req, res)` |
| L1-21 | `roleActivity.ts` — `getAllRoles()` | Repeated hardcoded role/activity object literals (static seed data, not request logic) | Literal string/id values only | Convert to a data array (`ROLE_SEED_DATA`) — zero runtime behavior change since it's static data either way |
| L1-22 | `recommendation.ts` (self-duplication) | Org/header-extraction guard; "check array → map to processContent → shuffle" idiom; generic catch — each repeated 2-3× across `/`, `/interestBased`, `/:recommendationType` | Nothing | `extractOrgHeaders`, `mapAndShuffleContent`, `handleRecommendationError` helpers |
| L1-23 | `feedbackV2.ts` — clusters 1 &amp; 2 only (NOT cluster 3, see Level 3) | `/platform` vs `sendSentimentNeutralFeedback` middleware body-build; generic catch block | One extra field (`sentiment`, harmless if undefined) | `submitFeedback(req,res,extraFields)`, `handleFeedbackError(err,res)` |
| L1-24 | `scoring.ts` (self-duplication) | Auth-header-object construction + generic catch, across `/calculate`, `/fetch`, `getTemplate` | Endpoint constant + param name only | `scoringAuthHeaders(...)`, `handleScoringError(...)` |

**Total: 23 clusters spanning roughly 20 files** (L1-15 moved to Level 2 as
L2-13 after verification found real divergence — see below). This is the safe,
immediately-actionable subset — pure boilerplate (error handling, header
construction, generic proxy-and-forward shapes, or literal static data)
with no documented bug and no verified behavioral divergence anywhere in
the matched text.

---

## Level 2 — real impact, but plannable with care

Criteria: the blocks are functionally equivalent *today*, but
consolidating them is a genuine refactor (parameterizing on more than a
plain constant, merging resource pools, or touching a live auth/business
path) rather than a mechanical no-op — it needs a behavior-preserving
design and regression testing before merging, not just a find/replace.

| # | Files | What's duplicated | Why it's not Level 1 | What a safe plan looks like |
|---|---|---|---|---|
| L2-1 | `upsmfUser.ts`, `mpNHMUser.ts`, `bnrcUser.ts` | Joi `.when('role', ...)` conditional validators for `instituteName`/`instituteType`/`facultyType`/`courseSelection` | Text is identical today only because all 3 orgs happen to use the literal role names `'Student'`/`'Faculty'` — each file separately owns its full `role` enum elsewhere; a rename in one org would silently break a shared fragment | Extract only after confirming role-name stability across all 3 orgs' product roadmaps; add explicit tests per org before merging |
| L2-2 | `signupWithAutoLogin.ts` vs `signupWithAutoLoginV2.ts`/`appSignUpWithAutoLogin.ts`/`emailOrMobileLoginSignIn.ts` | `updateRoles()` helper | `signupWithAutoLogin.ts` uses `axiosRequestConfig` (default timeout); the other three use `axiosRequestConfigLong` — a real timeout-behavior difference, not cosmetic | Decide which timeout is correct for `signupWithAutoLogin.ts` before merging, don't silently homogenize |
| L2-3 | `emailOrMobileLoginSignIn.ts` (self-duplication, `/auth` vs `/authv2/*`) | Token-exchange-and-session-establishment tail (POST → jwt_decode → session/kauth wiring → `getCurrentUserRoles` → response) | Same file, same author, verified identical — but still a live auth path exercised by two different grant types (password vs authorization_code) | `exchangeTokenAndEstablishSession(transformedData, req, res)` helper taking the pre-built grant payload; add regression tests for both `/auth` and `/authv2` before merging |
| L2-4 | `connections.ts` ↔ `connections_v2.ts` (5 of the simpler routes: requested/received/established/established-by-id/add/update) | Byte-identical route bodies | `connections.ts` is dead today (Special Case #2), so there's no *live* second caller to preserve — flagged L2 rather than L1 only because re-enabling the commented-out v1 mount would create a route collision on the same sub-path | If keeping v1 alive is ever reconsidered, resolve the routing collision explicitly; otherwise this converges to "just delete the dead file" |
| L2-5 | `myAnalytics.ts` (self-duplication, ~24 of 28 routes) | Generic axios-forward-and-respond shape | 3-4 real outliers: `/myskills` uses a different userId-resolution fallback; `/assessments` &amp; `/certification` reshape the response before sending; 2 routes use a middleware-chain pattern instead of inline axios | `forwardMyAnalytics(req,res,method,urlSuffix,queryParams?,body?,transform?)` — outliers get the optional `transform`/override params or are excluded entirely |
| L2-6 | `workallocation.ts` (self-duplication, 14 routes) | Validation-tail + header-object + response-forward + catch | Auth mechanism genuinely differs v1 (`extractAuthorizationFromRequest`, no token header) vs v2 (`SB_API_KEY` + `x-authenticated-user-token`) routes; validation target/presence differs per route; **a pre-existing buggy `logError(Error + err)` call must be preserved as-is, not silently "fixed"** during extraction | `forwardWorkAllocation(...,{authMode:'v1'|'v2', validate?})`; keep the buggy log call verbatim unless a separate, explicitly-approved bugfix is done first |
| L2-7 | `workflow-handler.ts` (self-duplication, 9 routes) | Header-object + response-forward + catch | POST routes validate org headers; GET routes don't — systematic, not random. `/workflowProcess` uniquely omits the `org` header entirely | `forwardWorkflow(...,{requireOrgValidation, includeOrgHeader?, includeWid?})` |
| L2-8 | `leaderboard.ts` — `badgeWon`/`badgeYetToWin` | Same request-building as the Level-1 leaderboard cluster | Extra response-processing branch (`processBadgeArray`/`processAllBadges`) and a different success-path response call (`res.send` vs `res.status().send()`) | Preserve the processing branch explicitly in the shared helper, don't drop it |
| L2-9 | `publicSearch.ts` ↔ `ratingsSearch.ts` | `postgresConnectionDetails`/`pool = new Pool(...)` config object | Data is identical, but merging means combining two separate live `pg.Pool` connection-pool instances into one — an operational change, not just a text edit | Confirm connection-pool sizing/behavior is equivalent before merging pools; test under load |
| L2-10 | `goals.ts` vs `playlist.ts` — create-goal vs create-playlist | Two-step "create content, then patch hierarchy" scaffolding | Request-builder functions genuinely differ (`formGoalRequestObj` vs `formPlaylistRequestObj`), and goals.ts's catch reshapes the error body via `transformGoalUpsertResponse` while playlist.ts's doesn't | Extract the scaffolding only, keep the builder functions and the extra error-transform as explicit parameters |
| L2-11 | `discussionHub/writeApi.ts` — `bookmark` vs `vote`, and `follow` vs `tags` | POST-body-build + axios + catch | `bookmark` discards the client body (`{_uid}` only) while `vote` forwards it (`{...req.body,_uid}`); `follow` calls `getUserUID()` (with a `// TODO` marker) while `tags` skips that step entirely | Preserve both differences as explicit parameters; do not assume they're accidental without asking the route owner |
| L2-12 | `home.ts` ↔ `content.ts` — `/searchAutoComplete` and `/searchV6` | ~80 and ~24 lines of live Elasticsearch query-building/ranking logic, effectively line-for-line identical | Only variance is how the acting "uuid" is resolved (hardcoded admin constant on the public/unauthenticated side vs `extractUserIdFromRequest` on the protected side) — but this crosses the public/protected trust boundary and the block is large, live search-ranking logic | `buildSearchAutoCompleteHandler(resolveUuid)` factory, instantiated once per file; treat as its own workstream, not a quick hoist |
| L2-13 | `goals.ts` ↔ `playlist.ts` — `PATCH /:goalId` vs `PATCH /:playlistId` | Two-call "update content, then patch hierarchy via `/content/v3/hierarchy/update`" scaffold — **reclassified from L1-15 after verification found real divergence** | `formPlaylistupdateObj`, imported from `service/goals.ts` in one file and `service/playlist.ts` in the other, look identical by name but are NOT: goals' version reads `req.name`, playlist's reads `req.playlist_title` — genuinely different request-body contracts. `transformToSbExtPatchRequest` in both service files IS byte-identical (param name only differs) | Extract the two-axios-call scaffold with the transform functions passed in as parameters (`patchContentViaHierarchyUpdate(id, request, auth, formUpdateObj)`), not hardcoded — never assume same-named imports from different modules are the same function without reading both |

**Total: 13 clusters.** These are real, worthwhile dedup targets, but each
needs a short design note and test plan before touching — none of them
are "safe to just do."

---

## Level 3 — do not touch without deep functional review

Criteria: actual verified discrepancies were found between the "duplicate"
copies (different validation, different response contracts, different
error-handling behavior), or the block overlaps a documented bug, or it's
part of a family already known to have diverged (auth-provider token
exchanges, v1/v2 signup pairs) where trusting surface-level similarity has
previously led to missed bugs in this exact codebase.

| # | Files | What looks duplicated | The actual discrepancy / risk found |
|---|---|---|---|
| L3-1 | `upsmfUser.ts`, `mpNHMUser.ts`, `bnrcUser.ts` | `accessDeniedMessage`, `getUserDesignationFromRole` | Different contact emails per org; entirely different role→designation maps per org (core business data) |
| L3-2 | `upsmfUser.ts`, `mpNHMUser.ts` | `UserDetails` interface tail, `ERHMS_CODE_KEY`/`GOV_KEY` | Surrounding interface fields differ per org; the "shared" constants don't even exist in `bnrcUser.ts` |
| L3-3 | `upsmfUser.ts`, `mpNHMUser.ts`, `bnrcUser.ts` | `role` Joi validator + nested conditional chains | Different `role.valid(...)` lists per org, different messages, extra branch in upsmf not present in mpNHM — core per-org validation logic |
| L3-4 | `upsmfUser.ts`, `mpNHMUser.ts`, `bnrcUser.ts` | `/createUser` post-existing-user branch | References already-divergent `accessDeniedMessage`; catch-block log text differs; control-flow shape matches but content doesn't |
| L3-5 | `upsmfUser.ts`, `mpNHMUser.ts`, `bnrcUser.ts` | `createUser()`/`assignRoleToUser()` helpers | **Bug found:** all three reuse `CONSTANTS.BNRC_USER_DEFAULT_PASSWORD` regardless of org — needs a naming/security decision. mpNHM alone adds a `timeout: 60000` the others lack |
| L3-6 | `upsmfUser.ts`, `mpNHMUser.ts`, `bnrcUser.ts` | `userProfileUpdate()` | Different professionalDetails field sets per org (`ERHMS_CODE_KEY`/`hrmsId` vs `bnrcRegistrationNumber`/`nin`), different state names, different designations per role per org — the most org-specific logic in the file set |
| L3-7 | `upsmfUser.ts`, `mpNHMUser.ts`, `bnrcUser.ts` | `updateUserStatusInDatabase()` | **Bug found:** `bnrcUser.ts`'s version `break`s out of its retry loop and unconditionally `return true`s — a fully-failed DB audit insert is reported as success, unlike upsmf/mpNHM which correctly return `false`. Also: different table names/column counts per org, and mpNHM alone converts `dob` via a leftover `cassandra-driver` type despite Cassandra not being used elsewhere in the file |
| L3-8 | `upsmfUser.ts`, `mpNHMUser.ts`, `bnrcUser.ts` | `migrateUserToX()` | **Bug found:** `mpNHMUser.ts` builds `` `India, , ${district}` `` — the state name is literally blank — vs upsmf's `"Uttar Pradesh"` and bnrc's `"Bihar"` |
| L3-9 | `upsmfUser.ts`, `mpNHMUser.ts`, `bnrcUser.ts` | OTP send/resend/validate handlers | **Bug found:** `mpNHMUser.ts`'s catch blocks use `logInfo` instead of `logError` for OTP failures — these won't surface in error-level monitoring/alerting the way upsmf/bnrc's do. Also copy-paste leftover log text referencing "BNRC" in the other two files' OTP handlers |
| L3-10 | `signupWithAutoLogin.ts`, `signupWithAutoLoginV2.ts`, `appSignUpWithAutoLogin.ts` | OTP-send-after-signup block | `appSignUpWithAutoLogin.ts` returns an extra `userUUId` field the other two don't — a real response-contract difference for any client parsing it |
| L3-11 | `signupWithAutoLogin.ts`, `signupWithAutoLoginV2.ts`, `appSignUpWithAutoLogin.ts` | Mobile-OTP-verify-via-MSG91 block | Sits inside `validateOtpWithLogin`, already documented (PROD-VERIFICATION.md changes Q/R) as having independently-occurring double-send bugs in 2 of these 3 files |
| L3-12 | `signupWithAutoLogin.ts`, `signupWithAutoLoginV2.ts`, `appSignUpWithAutoLogin.ts` | Email-OTP-verify + outer control flow of `validateOtpWithLogin` | Three genuinely different request-body contracts: different field names for phone (`phone` vs none vs `mobileNumber`) and for the user id (`userUUId`/`userUUID` vs `userId` vs `userId`/`userUUID`) |
| L3-13 | `signupWithAutoLogin.ts`, `signupWithAutoLoginV2.ts` | Keycloak token-exchange + session-establishment block | **Highest-risk cluster in the signup family.** Different `client_id`/`client_secret`/grant type (`portal`+password vs `aastrika-sso-login`+`offline_access`, no password); `appSignUpWithAutoLogin.ts`'s equivalent skips session/kauth entirely (stateless token passthrough) — three fundamentally different auth strategies masquerading as "the same block" |
| L3-14 | `publicSearch.ts` ↔ `ratingsSearch.ts` | "No query" search branch | publicSearch forces `contentType: ['Course','CourseUnit']` unconditionally (ratingsSearch doesn't), uses `limit:200` vs `limit:20`, and ratingsSearch alone calls `getCombinedRatingsResult` to enrich with ratings — real functional divergence |
| L3-15 | `discussionHub/writeApi.ts` — `/users` route neighborhood | Boilerplate adjacent to `createDiscussionHubUser` | Overlaps the documented `return async () => {...}` never-invoked-closure bug — the route always sends `undefined` and never actually creates the NodeBB user. A generic helper here would either mask or interact unpredictably with the existing bug |
| L3-16 | `feedbackV2.ts` — cluster 3 only | Boilerplate bracketing `GET /:feedbackId` and `GET /categories` | Directly brackets the two routes in the documented route-shadowing bug (`/categories` is unreachable, shadowed by `/:feedbackId`) — touching this risks silently "fixing" the shadowing as an unplanned refactor side effect |
| L3-17 | `network.ts` (self-duplication, 9 routes) | Org/user validation + header-object + response-forward | **Security-relevant divergence found:** `/connections/established/:id` derives the target `userId` from the **path parameter**, not from the authenticated caller — i.e. it looks up a *different* user's established connections by id, unlike every other route in the file. Separately, `/connections/recommended` and its `userDepartment` variant omit `Authorization`/`x-authenticated-user-token` entirely from the outbound call. Needs an explicit access-control review before any merge — cross-reference `docs/PROD-VERIFICATION.md` |
| L3-18 | `connections_v2.ts` — `suggests`/`recommended`/`recommended/userDepartment` | Same URL, "looks" like `connections.ts`'s dead v1 equivalent | Verified divergence: v1 used `extractUserIdFromRequest` (session-based fallback), v2 uses `extractUserId` (Keycloak-JWT-`sub`-based fallback) — two different user-identity resolution mechanisms. `userDepartment` additionally uses a completely different upstream API, request shape, and error guard between the two |
| L3-19 | `publicCertifcateFlinkv2.ts` ↔ `mobileAppApi.ts` | userid/courseid/secretKey extraction + Cassandra query + the critical secret-key check | **The documented CRITICAL auth-bypass bug (change AR) is inside this exact duplicated block**, copied verbatim into `mobileAppApi.ts`. Any fix must be applied and re-verified in both places, or the bypass persists via the second route |
| L3-20 | `tnaiAuth.ts`, `tnnmcAuth.ts`, `sashaktAuth.ts`, `maternityFoundationAuth.ts` (+ `tnnmcAuthV2.ts`, out of cluster scope) | The entire auth-provider-token-exchange family: createUser/userRoles/profileUpdate skeleton, JWT-decode+session block, qs.stringify+generateToken block | **Confirmed real divergence, not assumed:** on Keycloak-exchange failure, tnai/sashakt/tnnmc respond `302` but `maternityFoundationAuth.ts` responds `400` — inside a block Sonar reports as byte-identical. Also: HTTP verb differs (GET for sashakt, POST for the rest), token-transport-to-provider differs completely per provider (JSON body vs Bearer header vs APIM subscription key vs HMAC-signed custom headers), and each has unique side effects (Cassandra audit insert, name-splitting, designation-mapping, phone-normalization). `tnnmcAuth.ts` additionally has its own known-divergent sibling `tnnmcAuthV2.ts` from earlier in this campaign — first-party evidence this family regresses silently |
| L3-21 | `userDataMigration.ts` ↔ `forgotPassword.ts` | Nearly the entire file | Not a dedup candidate — it's a dead-code decision. The dead copy also **skips OTP verification entirely** (see Special Case #2) |

**Total: 21 clusters.** Every one of these either has a confirmed,
verified discrepancy, overlaps a documented bug, or belongs to a family
this codebase has already seen regress silently. None should be touched
as part of a "reduce duplication" pass — several of them are, on their
own, legitimate bug-fix or security-review items independent of the
duplication question.

---

## Recommended sequencing, if this work is approved

1. **Do not touch `whitelistApis.ts`.** Not a cleanup target — see Special
   Case #1.
2. **Resolve the dead-code question first** (Special Case #2) — confirming
   whether `socialv2.ts`, `connections.ts`, and `userDataMigration.ts` can
   be deleted removes ~2,000+ duplicated lines with the least behavioral
   risk of anything in this document, since by definition nothing live
   calls them today. This needs a sign-off confirming no external
   consumer depends on those paths, not a code change.
3. **Level 1 (24 clusters)** is the safe next batch — pure boilerplate
   extraction, zero behavior change, verified by direct line-by-line
   reading, not just Sonar's density number.
4. **Level 2 (12 clusters)** should each get a short design note + test
   plan before touching; do them one at a time, not as a batch.
5. **Level 3 (21 clusters)** should not be scheduled as "cleanup" at all.
   Several items inside it (L3-5, L3-7, L3-8, L3-9, L3-17, L3-19) are
   real bugs independent of duplication and belong in a bug-fix triage
   process — cross-referenced into `docs/PROD-VERIFICATION.md` — with
   their own sign-off, separate from any dedup initiative.

**On the metric itself:** even completing every Level 1 and Level 2 item
above would not move SonarQube's 26.8% figure dramatically, because
`whitelistApis.ts` alone (which must stay untouched) accounts for 12.7%
of all duplication on its own. Recommend treating "reduce duplication
density" as a secondary benefit of a genuine code-quality pass, not the
primary goal — chasing the number itself would create pressure to touch
Level 3 code, which is exactly the risk this document exists to prevent.
