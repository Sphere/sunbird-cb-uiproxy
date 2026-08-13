# Production verification checklist

> **Read this before deploying.** Source files changed, plus three dead files
> removed. Everything here was tested locally, and the whitelistApis.ts
> change (CHANGE 7) was verified with a deep structural-equality check, not
> just passing tests. The items under "Must be verified in production" touch
> external systems (Keycloak, SSO partners) that cannot be exercised from a
> developer machine.

Branch: `feat-sonarqube-integration`
Source files changed: `src/utils/keycloak-user-creation.ts` (CHANGE 2),
`src/utils/randomPasswordGenerator.ts` (CHANGE 1),
`src/protectedApi_v8/navigator.ts` (CHANGE 3),
`src/utils/dataAlterer.ts` (CHANGE 4),
`src/protectedApi_v8/user/realTimeProgress.ts` (CHANGE 5),
`src/utils/whitelistApis.ts` (CHANGE 7).
Source files removed as confirmed-dead code (CHANGE 6):
`src/protectedApi_v8/connections.ts`, `src/protectedApi_v8/socialv2.ts`,
`src/publicApi_v8/userDataMigration.ts` (plus their 3 test files).

**Note:** a CSPRNG shuffle fix for `contentHelpers.ts`/`assessment.ts` was
made, verified, then reverted alongside an unrelated batch of changes, and
was not re-applied — those two files currently still use `Math.random()`
for shuffling (not security-relevant; already reviewed "safe" in Sonar, see
the "Pre-existing issues NOT changed" section). Flagging so this isn't
mistaken for a change that's actually in this branch.

**Test coverage:** Jest suite green throughout. Every real defect discovered
while writing these tests is documented below (sections CHANGE 1/2, then
A through BV) — each includes what the issue is, why it wasn't fixed
outright, and what to check in production before treating it as resolved.
**None of the findings below were fixed without explicit sign-off** — the
only behavioral changes in this entire body of work are CHANGE 1 through 7.

---

## CHANGE 1 — Password generator moved to a CSPRNG

**File:** `src/utils/randomPasswordGenerator.ts`
**Sonar:** rule S2245, 3 security hotspots, MEDIUM risk, `weak-cryptography`

### What the issue was

`generateRandomPassword()` used `Math.random()` to build passwords. V8 implements
`Math.random()` with xorshift128+, a non-cryptographic PRNG whose internal state
can be recovered from a small number of observed outputs. An attacker able to
see a few generated passwords could predict passwords generated for other users.

These are **real account credentials**, only 8 characters long, issued by 7
sign-up paths:

| File | Line |
|---|---|
| `src/publicApi_v8/tnaiAuth.ts` | 94 |
| `src/publicApi_v8/tnnmcAuth.ts` | 118 |
| `src/publicApi_v8/tnnmcAuthV2.ts` | 69 |
| `src/publicApi_v8/maharastraNursingCouncilAuth.ts` | 42 |
| `src/publicApi_v8/sashaktAuth.ts` | 76 |
| `src/publicApi_v8/maternityFoundationAuth.ts` | 83 |
| `src/publicApi_v8/emailOrMobileLoginSignIn.ts` | 70, 298, 469 |

This was invisible before because the old `sonar.exclusions` list explicitly
excluded `randomPasswordGenerator.ts` from analysis.

### Why it was fixed this way

Randomness now comes from `crypto.randomBytes` via a local `secureRandomInt()`
helper using **rejection sampling** (taking `value % max` directly would bias
results toward the low end).

`crypto.randomInt()` would have been the obvious choice, but this project pins
`@types/node@12.0.4` and `randomInt` did not exist until Node 14.10 — using it
**fails TypeScript compilation**. `randomBytes` needs no dependency or lockfile
change.

**The algorithm, charsets, option handling and output length are unchanged.**
Only the source of randomness differs.

### Impact

- **Functional impact: none.** Same signature, same return type, same length,
  same character set. Callers are untouched.
- **Security impact: positive.** Generated passwords are no longer predictable.
- **Passwords already issued remain valid.** This does not invalidate, rotate,
  or migrate any existing credential.
- **Performance:** negligible — a few bytes of entropy per password.

### Verified locally

- 8/8 unit tests pass (`npm run test:unit`)
- 2000 generated passwords: all length 8, all 2000 distinct, all within charset
- Empty/unknown options still return `''` exactly as before
- **The 7 behavioural tests pass identically against BOTH the old `Math.random`
  implementation and the new CSPRNG one** — this is the direct evidence that
  behaviour did not change
- The security regression test **fails** against the old implementation and
  passes against the new one, so it genuinely guards the fix

### MUST BE VERIFIED IN PRODUCTION

- [ ] **Each SSO sign-up path issues a working password.** Register one new user
      through **every** flow listed in the table above and confirm the account is
      created *and* can subsequently log in. The generated password is sent to
      Keycloak, so a malformed value would surface as a failed login, not a
      failed signup.
- [ ] **`emailOrMobileLoginSignIn.ts` has three separate call sites** (lines 70,
      298, 469). Exercise all three, not just the first — they are different
      flows.
- [ ] Confirm any password-policy validation in Keycloak still accepts the
      generated format (same charset and length as before, so it should).
- [ ] Watch for `ERROR IN METHOD createKeycloakUser` in logs during the first
      hours after deploy.

---

## CHANGE 2 — Removed unreachable try/catch around a returned promise

**File:** `src/utils/keycloak-user-creation.ts`, function `getAuthToken()`
**Sonar:** rule S4822, 1 bug, MAJOR — the only bug in the codebase.
Reliability rating **C → A**.

### What the issue was

`getAuthToken()` is `async` and did `return new Promise(...)` **without**
`await`, wrapped in a `try/catch`. Because the promise was returned rather than
awaited, the `catch` block could never observe an async rejection — it was dead
code. Rejections propagated to the caller unlogged.

### Why it was fixed this way

A `.catch()` was attached to the promise that **logs and rethrows**, and the
now-provably-unreachable `try/catch` was removed.

**The obvious fix would have been a regression.** Adding `await` would have let
the `catch` block run — and it ended with `return err`, which would convert a
rejected promise into a *resolved* promise containing an `Error`. Both callers
would then have treated a failure as success:

- `src/protectedApi_v8/admin/userRegistration.ts:189` — relies on `.catch()` to
  send HTTP 400
- `src/protectedApi_v8/admin/userRegistration.ts:465` — relies on `.catch()` to
  return a failure string

Auth failures would have been silently swallowed. `await` was therefore
deliberately **not** used.

Removing the `try/catch` is safe because nothing inside it can throw
synchronously: the block contains only an object literal (cannot throw) and
`new Promise(...)` — and per spec a Promise executor that throws is converted
into a rejection by the constructor, so it never escapes.

### Impact

- **Functional impact: none.** The function still returns a promise that
  **rejects** on failure, with the same error object. Both callers behave
  identically.
- **Observable difference: one extra log line** —
  `ERROR ON Keycloak openid-connect/token >` — now emitted when the token call
  fails. Previously the failure was silent.

### MUST BE VERIFIED IN PRODUCTION

- [ ] **Successful token retrieval** — register a user via
      `userRegistration.ts` and confirm the flow completes as before.
- [ ] **Failure still returns HTTP 400.** Force a Keycloak token failure (bad
      credentials or Keycloak unreachable) and confirm the API still responds
      **400** with `1004: User getAuthToken failed !!`. If it returns 200 or
      hangs, the rejection contract has broken — roll back.
- [ ] Confirm the new `ERROR ON Keycloak openid-connect/token >` log line
      appears on failure. Its absence on a known failure means the `.catch()`
      is not wired.

---

## CHANGE 3 — navigator.ts: converted nested if/else to early returns

**File:** `src/protectedApi_v8/navigator.ts`, `GET /lp` route
**Sonar:** rule S3776 (Cognitive Complexity), 16 vs. 15 allowed

### What changed and why

Three levels of nested `if (cond) { A } else { B }` became `if (cond) { A; return } B`. This is a provably equivalent transformation: when `cond` is true both versions run only `A`; when false, both run only `B`. No response, status code, or error body changes for any input.

### Verified

All 23 existing tests for this route (covering every branch: success, topics-filter, missing-data, out-of-range, and the pre-existing documented dead-validation bug) pass unchanged. Full suite green, clean build.

### MUST VERIFY IN PROD

- [ ] None — the transformation is behaviorally provable from the diff alone (each branch does the identical thing before and after), and full test coverage of every branch confirms it.

---

## CHANGE 4 — dataAlterer.ts: extracted two branches of `hierarchy()` into named helpers

**File:** `src/utils/dataAlterer.ts`
**Sonar:** rule S3776 (Cognitive Complexity), 17 vs. 15 allowed

### What changed and why

`hierarchy()`'s two `if`/`else if` branches (the `data.request` case and the `data.params.status === 'successful'` case) do unrelated things. Each branch's exact code (character-for-character) now lives in its own named function (`swapFirstMatchingHierarchyContentType`, `swapChildrenContentType`), called from the same condition, receiving the same mutable `data` object by reference. Since JS passes objects by reference, moving code into a named function changes nothing about what runs or what gets mutated.

### Verified

All 15 existing tests (covering both branches plus edge cases: no children, no content, non-successful status) pass unchanged, 100% line coverage maintained. Full suite green, clean build.

### MUST VERIFY IN PROD

- [ ] None — same reasoning as CHANGE 3.

---

## CHANGE 5 — realTimeProgress.ts: `var` → `const`

**File:** `src/protectedApi_v8/user/realTimeProgress.ts`, lines 49 and 55
**Sonar:** rule S3504, 2 findings

### What changed and why

Two `var` declarations (`data`, `config`) inside the `POST /update/:contentId` handler were changed to `const`. Both are assigned once and never reassigned, and used only within the same block where declared — no reliance on `var`'s function-scope hoisting. Purely mechanical.

### Verified

All 14 existing tests for this route pass unchanged. Full suite green, clean build.

### MUST VERIFY IN PROD

- [ ] None.

---

## CHANGE 6 — Removed 3 confirmed-dead files

**Files removed:** `src/protectedApi_v8/connections.ts`, `src/protectedApi_v8/socialv2.ts`,
`src/publicApi_v8/userDataMigration.ts`, and their 3 test files
**Reason:** duplicate-code cleanup (these contributed ~830 of the ~10,800 duplicated
lines Sonar was reporting); none of them can execute in production.

### Why each one is confirmed dead, not just untested

- **`connections.ts`** — its route path (`/connections`) is live, but mounted to `connections_v2.ts` instead. The old import is explicitly commented out in `protectedApiV8.ts` (`// import { connectionsApi } from './connections'`), with a `// tslint:disable-next-line: no-commented-code` marker above it, consistently across multiple past commits — a deliberate, stable v1→v2 migration, not an accident.
- **`socialv2.ts`** — exactly one commit in its entire git history ("initial commit"). Added once, never imported anywhere, ever.
- **`userDataMigration.ts`** — defines the exact same two routes (`POST /reset/proxy/password`, `POST /verifyOtp`) as the separately-mounted `forgotPassword.ts`. A genuine old/new pair; the old file's path has zero references in either router file across all of git history.

Additional verification beyond grep: neither `protectedApiV8.ts` nor
`publicApiV8.ts` (nor `server.ts`/`index.ts`) contains any dynamic or
wildcard route-loading mechanism (`readdir`, `glob`, computed `require()`)
that could reach these files indirectly — every route is a static `import` +
`.use()` call. Both router files also have their own pre-existing,
independently-maintained test suites (`protectedApiV8.test.ts`,
`publicApiV8.test.ts`) that assert a **complete, exhaustive manifest** of
every sub-router actually mounted (~50 and ~35 entries respectively) — a
manifest whose entire purpose is catching exactly this kind of wiring
mistake. Neither manifest includes any of the 3 removed files; both include
their replacements (`connections_v2`, `forgotPassword`).

### Verified

- Full suite: 213 test suites (down from 216 — exactly the 3 removed test
  files, nothing else), all passing.
- Clean build: `dist/` went from 272 → 269 files (exactly the 3 removed
  source files), 0 leaked `.test.js` files, no compile errors.
- No other file in the repository references any of the 3 removed files
  (checked all file types, not just `.ts`, across the whole repo, not just
  `src/`).

### MUST VERIFY IN PROD

- [ ] Nothing functional — dead code cannot affect running behavior by
      definition. The only meaningful post-deploy check is **negative**: confirm
      no error/404 spike appears for `/connections` or `/forgot-password/`
      style traffic after this deploys, which would indicate the "dead" file
      was actually reachable through some path this investigation missed
      (considered extremely unlikely given the evidence above, but worth a
      quick log check since this is the one change in this batch that removes
      code rather than restructuring it).

---

## CHANGE 7 — whitelistApis.ts: deduplicated the security authorization table

**File:** `src/utils/whitelistApis.ts` (1,928 → ~725 lines), plus a new
`src/utils/whitelistApis.test.ts` structural regression test.
**Sonar:** duplicated blocks 5,309 → 749 (a further ~85% drop from this
change alone; -93% from the original count across this session's whole
duplication cleanup).

### What changed and why

`API_LIST.URL` maps 306 route paths to authorization rule objects
(`{ checksNeeded, ROLE_CHECK }`). 301 of those 306 routes shared one of
exactly 3 rule combinations, each repeated as an inline object literal.
Replaced with 3 named, `Object.freeze()`-protected preset constants
(`PUBLIC_ROLE_RULE`, `ADMIN_LEADER_PUBLIC_ROLE_RULE`, `NO_CHECKS_RULE`),
referenced by name from each matching route. The 5 routes with a genuinely
unique combination were left as inline literals (introducing a named preset
used by only one route adds a name to remember for no benefit).

`Object.freeze()` on the shared constants is defensive, not a behavior
change: `apiWhiteList.ts`'s `isAllowed()` — the only consumer — only ever
*reads* `checksNeeded`/`ROLE_CHECK` (via `_.isEmpty`, `.forEach()`,
`_.get()`, `_.includes()`, `_.intersection()`), never mutates them, verified
by reading every call site. Freezing only changes behavior if something
*later* tries to mutate a shared object — it would throw instead of silently
corrupting every route sharing that reference.

### Why this is provably zero-impact, not just "probably fine"

Ran a Node script doing `assert.deepStrictEqual()` between the final
`API_LIST` object and the original git-committed version — a deep structural
comparison of all 306 route entries and every nested value. This is stronger
than "tests still pass": it proves the actual data structure consumed at
runtime is byte-for-byte identical, not just that the specific scenarios the
existing tests happen to cover are unaffected. Re-ran this check after every
subsequent edit to the file; always passed.

### Verified

- Deep-equality check: PASS (see above).
- Existing `apiWhiteList.test.ts` (17 tests, the real access-control
  behavior tests): pass unchanged.
- New `whitelistApis.test.ts` (3 tests): route count stays at 306, every
  entry has a valid `checksNeeded`/`ROLE_CHECK` shape, presets are genuinely
  shared (catches a future accidental revert back to per-route duplication).
- Full suite green, clean build.

### MUST VERIFY IN PROD

- [ ] None expected — the deep-equality proof means the authorization
      decision for every one of the 306 routes is identical to before this
      change, not just "probably" identical. If there's any doubt, the
      lowest-effort spot-check is calling a handful of routes from each of
      the 3 preset groups (e.g. one `PUBLIC_ROLE_RULE` route, the one
      `ADMIN_LEADER_PUBLIC_ROLE_RULE`-gated route) and confirming the same
      access decision as before deploy.

---

## CHANGE 8 — 12 route files: extracted shared catch-block error handlers

**Files (all under `src/protectedApi_v8/`):**

| File | Lines before → after |
|---|---|
| `user/rdbms.ts` | 227 → 200 |
| `user/myAnalytics.ts` | 869 → 757 |
| `content.ts` | 867 → 796 |
| `leaderboard.ts` | 452 → 404 |
| `user/goals.ts` | 491 → 451 |
| `scoring.ts` | 206 → 188 |
| `user/follow.ts` | 247 → 243 |
| `roleActivity.ts` | 310 → 318 (helper added, only 2 of the file's catch blocks matched it) |
| `recommendation.ts` | 305 → 302 |
| `user/feedbackV2.ts` | 298 → 282 |
| `discussionHub/writeApi.ts` | 280 → 269 |
| `discussionHub/users.ts` | 289 → 275 |

### What changed and why

Each file had a route handler catch block repeated once per route — same
`logError(label, err)` + `res.status(err?.response?.status || 500).send(err?.response?.data
|| <fallback>)` shape, varying only in the log label string (and, in a few
files, the fallback body). Added one named helper per file
(`handleRdbmsError`, `handleMyAnalyticsError`, `handleContentError`, etc.)
and replaced each matching catch block with a call to it, passing through
the same label/fallback that was already being passed inline.

Covers L1-9, L1-10, L1-12, L1-17 through L1-20, L1-22, L1-23, and L1-24 from
`docs/DUPLICATE-CODE-CLEANUP.md`'s Level 1 list — pure boilerplate, no
documented bug touching any of the extracted blocks, no behavior varying
beyond the label/fallback that was already an argument.

Blocks with a genuinely different shape were deliberately left untouched
rather than folded into the shared helper:

- `content.ts`: `getParentDetails`'s catch returns the error instead of
  sending a response.
- `goals.ts`: `POST /`'s catch runs the error body through
  `transformGoalUpsertResponse`; `PATCH /:goalId`'s catch has a
  pre-existing `logError(err)` call (passing the error object, not a
  label) — left exactly as it was, not "fixed" as a side effect of this
  change.
- `feedbackV2.ts`: `/categories`'s catch sits next to the documented
  route-shadowing bug (change Y) — not touched.
- `discussionHub/writeApi.ts` / `discussionHub/users.ts`:
  `createDiscussionHubUser`, `getUserByEmail`, `getUserByUsername` all sit
  inside the documented never-invoked-closure bug — not touched.

### Verified

- Full Jest suite (213 suites, 3,189 tests): green.
- `npx tsc --noEmit -p tsconfig.json`: clean.
- `npm run build`: succeeds; `dist/` file count unaffected by this change
  (no files added or removed, only line counts inside existing files).
- Each file's own test suite re-run with coverage right after its edit,
  before moving to the next file.

### MUST VERIFY IN PROD

- [ ] None expected — every extracted catch block sends the same status
      code and body, for the same set of failure conditions, as before.
      Only the code doing it is now shared instead of copy-pasted per
      route.

---

## CHANGE 9 — org-signup family: shared Postgres pool, endpoint constants, Joi validators

**Files:**

| File | Lines before → after |
|---|---|
| `src/publicApi_v8/upsmfUser.ts` | 1,191 → 1,135 |
| `src/publicApi_v8/mpNHMUser.ts` | 1,124 → 1,070 |
| `src/publicApi_v8/bnrcUser.ts` | 1,124 → 1,071 |
| `src/publicApi_v8/signupWithAutoLoginOrgForm.ts` | 761 → 739 |

New files: `src/utils/dataLakePgPool.ts`, `src/utils/orgSignupConstants.ts`,
`src/utils/orgSignupValidators.ts`.

### What changed and why

Covers L1-1, L1-2, and L1-3 from `docs/DUPLICATE-CODE-CLEANUP.md`. All four
files opened their own Postgres connection pool with an identical config
block (same timeouts, same pool size, same error/connect/remove logging);
three of them (`upsmfUser.ts`, `mpNHMUser.ts`, `bnrcUser.ts`) also repeated
the same MSG91/user-service endpoint map and the same five Joi field
validators (`district`, `email`, `firstName`, `lastName`, `phone`) verbatim.
Verified byte-for-byte identical across all files before touching anything —
diffed each block directly, not by trusting the duplication doc's claim.

- **`createDataLakePgPool()`** builds and returns a new pool with the same
  config/logging every file already had. **Each caller still gets its own
  pool instance** — this was a deliberate choice, not an oversight: merging
  into one shared singleton pool would cut total available connections
  across the 4 files from 4×20 to 20, a real change in connection-pool
  capacity under concurrent load, not just a text dedup. A factory function
  removes the duplicated code without touching that behavior.
- **`orgSignupConstants.ts`** holds `API_END_POINTS`, `MSG91_HEADERS`,
  `INDIAN_COUNTRY_CODE`, `REGISTRATION_SOURCE`, `STANDARD_DOB`, and
  `USER_SUCCESS_REGISTRATION_MESSAGE`. Imported with the same local names
  each file already used (`import { MSG91_HEADERS as msg91Headers, ... }`),
  so nothing below the import line in any of the three files changed.
- **`orgSignupValidators.ts`** holds the 5 shared Joi fragments as named,
  reusable schema exports (Joi schemas are immutable — safe to reference
  from multiple `Joi.object({...})` schemas at once).

One incidental fix required by the extraction: `dataLakePgPool.ts` uses
`import { Pool } from 'pg'` (typed) instead of the original
`new (require('pg')).Pool(...)` (untyped `any`, bypassed type-checking
entirely). This surfaced a real type mismatch — `CONSTANTS.DATA_LAKE_POSTGRES_PORT`
is a string, `PoolConfig.port` wants a number — fixed with `Number(...)`,
the exact same pattern already used for `POSTGRES_PORT` in
`courseRecommendation.ts`/`publicSearch.ts`/`ratingsSearch.ts`. `pg` accepts
a numeric-string port at runtime either way, so this was never a behavior
difference — only a type-checking gap the untyped `require()` call had been
silently hiding.

Investigated a 4th proposed cluster (L1-15, `goals.ts` ↔ `playlist.ts`'s
`PATCH` handlers) and found the doc's claim didn't hold up: the two files'
`formPlaylistupdateObj` functions have the same name but live in different
service modules (`service/goals.ts` vs `service/playlist.ts`) and read
different request fields (`req.name` vs `req.playlist_title`). Not
extracted — reclassified to Level 2 (L2-13) in
`docs/DUPLICATE-CODE-CLEANUP.md` instead of forcing a merge.

### Verified

- Full Jest suite (213 suites, 3,189 tests): green, both before and after
  `tslint --fix` (which only reordered two import lines).
- `npx tsc --noEmit -p tsconfig.json`: clean.
- `npm run build`: succeeds; `dist/` grew by exactly 3 files
  (`dataLakePgPool.js`, `orgSignupConstants.js`, `orgSignupValidators.js`) —
  matching the 3 new source modules, nothing unaccounted for.
- Each of the 4 affected files' own test suites re-run after every edit.

### MUST VERIFY IN PROD

- [ ] None expected — every extracted piece keeps the same runtime values
      and the same per-file pool instance count as before. The one
      behavioral question (shared vs. per-file pool) was decided in favor
      of *not* changing behavior; if pool sizing is ever revisited, that
      should be its own explicit, separately-approved change.

---

## CHANGE 10 — auto-login signup family: shared endpoints, account helpers, user-exists lookup

**Files:**

| File | Lines before → after |
|---|---|
| `src/publicApi_v8/signupWithAutoLogin.ts` | 391 → 272 |
| `src/publicApi_v8/signupWithAutoLoginV2.ts` | 398 → 279 |
| `src/publicApi_v8/appSignUpWithAutoLogin.ts` | 350 → 232 |
| `src/publicApi_v8/emailOrMobileLoginSignIn.ts` | 646 → 614 |

New files: `src/utils/autoLoginSignupConstants.ts`, `src/utils/signupAccountHelpers.ts`,
`src/utils/fetchUserExists.ts`.

### What changed and why

Covers L1-4, L1-5, L1-6, and L1-7 from `docs/DUPLICATE-CODE-CLEANUP.md`.

- **`autoLoginSignupConstants.ts`** (`API_END_POINTS`, `MSG91_HEADERS`,
  `INDIAN_COUNTRY_CODE`) — verified byte-identical across `signupWithAutoLogin.ts`,
  `signupWithAutoLoginV2.ts`, `appSignUpWithAutoLogin.ts` before extracting.
  Imported with the same local names each file already used, so nothing
  below the import line changed. `emailOrMobileLoginSignIn.ts` keeps its own
  `API_END_POINTS` — its map has different keys (`generateToken` instead of
  `grantAccessToken`, an extra `searchUser`, missing `msg91SendOtp`/
  `msg91VerifyOtp`/`profileUpdate`) and was correctly left out of L1-4's scope.
- **`signupAccountHelpers.ts`** (`createAccount`, `profileUpdate`) — verified
  byte-identical across the same 3 files. `updateRoles`, which sits right next
  to both in every file, was deliberately left in place per-file: v1 uses
  `axiosRequestConfig` while v2/app use `axiosRequestConfigLong`, a real
  timeout difference already documented as L2-2 — not something to silently
  homogenize.
- **`fetchUserExists.ts`** (`fetchUserBymobileorEmail`) — verified
  byte-identical across all 4 files, including `emailOrMobileLoginSignIn.ts`.
  Rather than depend on any file's `API_END_POINTS` (which differ in shape),
  the shared function builds the two URLs it needs
  (`user/v1/exists/email/`, `user/v1/exists/phone/`) directly from
  `CONSTANTS.KONG_API_BASE` — confirmed those two URL strings are identical
  in all 4 files' maps even though the maps themselves aren't. This keeps the
  function fully self-contained and the call signature at every call site
  unchanged.
- Removing these blocks left `import _ from 'lodash'` unused in the 3
  auto-login signup files (their only `_.get` call lived inside the
  now-extracted `fetchUserBymobileorEmail`) — removed the dead import from
  all 3. `emailOrMobileLoginSignIn.ts` still uses `_` elsewhere, so its
  import was left alone.
- **Build regression found and fixed**: after removing the constants/helper
  blocks, `npm run build`'s TSLint step started failing with
  "Remove this commented out code" on a pre-existing, already-dead
  `decryptData` comment block in all 3 auto-login signup files (confirmed via
  `git stash` that the original files lint clean — this rule only started
  firing once the surrounding code changed). The block was inert — already
  commented out, never executed, not referenced anywhere — so it was deleted
  outright rather than suppressed, in all 3 files (byte-identical text
  confirmed first).

Also investigated whether `VALIDATION_FAIL`/`CREATION_FAIL`/`OTP_MISSING`/
`AUTH_FAIL`/`AUTHENTICATED` (message constants right next to L1-4's block)
were also shareable: `appSignUpWithAutoLogin.ts` only defines 2 of the 5,
so they're not identically present across all 3 files — left untouched,
out of scope.

### Verified

- Full Jest suite (213 suites, 3,189 tests): green, before and after the
  comment-block fix.
- `npx tsc --noEmit -p tsconfig.json`: clean.
- `npm run build`: failed once (the TSLint regression above), fixed, then
  succeeded; `dist/` grew by exactly 3 files matching the 3 new modules.
- Each of the 4 affected files' own test suites re-run after every edit. One
  transient run showed 19 failures in `emailOrMobileLoginSignIn.test.ts`
  when run alongside the other 3 signup files (404s instead of expected
  500s) — the documented `mountRouter` cross-talk pattern; a clean rerun of
  the same 4 files together passed all 74 tests.

### MUST VERIFY IN PROD

- [ ] None expected — every extracted function keeps the exact request
      shape, headers, and URLs each file already sent.

---

## CHANGE 11 — server.ts: sourced the notification-engine socket URL from config

**File:** `src/server.ts`, `src/utils/env.ts`.

### What changed and why

`setupBackendSocket()` had `http://notification-engine:3013` as a literal
string, flagged by Sonar (S5332, clear-text protocol, security hotspot).
Added `CONSTANTS.NOTIFICATION_ENGINE_SOCKET_URL` to `env.ts`
(`env.NOTIFICATION_ENGINE_SOCKET_URL || 'http://notification-engine:3013'`,
the same pattern every other configurable URL in that file already uses) and
referenced it from `server.ts` instead of the inline literal.

No `NOTIFICATION_ENGINE_SOCKET_URL` environment variable is set anywhere in
this repo or the shell, so the fallback literal is what resolves at runtime —
the exact same string as before. This is a pure literal-to-config move, not
a protocol change: nothing here claims the target service actually supports
TLS, so `http://` was kept as the value. Sonar flags a literal `http://` in
source; it can't see a runtime config value, so moving the string out of
source satisfies the rule without touching behavior.

### Verified

- Full Jest suite (213 suites, 3,189 tests): green.
- `npx tsc --noEmit -p tsconfig.json`: clean.
- `npm run build`: succeeds; `dist/` file count unchanged (no new files,
  only an existing constant added to `env.ts`).
- Confirmed no environment variable named `NOTIFICATION_ENGINE_SOCKET_URL`
  exists anywhere (repo search + shell `env`), so the fallback literal is
  guaranteed to be what's used.

### MUST VERIFY IN PROD

- [ ] None expected — the resolved URL is byte-identical to the previous
      hardcoded literal.

---

## CHANGE 12 — 16 Sonar Reliability findings, plus a permanent Joi-validator test

**Files:** `userRegistration.ts`, `signup.ts` (9 dead-`\|\| {}` removals),
`fileLogger.ts` (`let`→`const`), `details.ts`, `maharastraNursingCouncilAuth.ts`,
`keycloak-user-creation.ts` (6 `reject(...)` calls now guaranteed `Error`),
`custom-keycloak.ts` (removed a no-op `async`). New file:
`src/utils/orgSignupValidators.test.ts`.

### What changed and why

All 16 items from Sonar's Reliability issue list (severity Medium), addressed
with real code changes, not review annotations:

- **9× dead code**: `res.send('literal string' \|\| {})` — a non-empty string
  literal is always truthy, so `\|\| {}` could never execute. Removed the
  unreachable branch; the string that was always sent is still sent.
- **`fileLogger.ts`**: `export let pino` → `const` — never reassigned
  anywhere, not imported by any other file.
- **6× `reject(...)` calls now guaranteed to carry an `Error`**:
  - `details.ts:146`, `keycloak-user-creation.ts:179`,
    `maharastraNursingCouncilAuth.ts:274` already passed real `Error` objects
    at runtime (proven by existing `.rejects.toThrow(...)` tests) — wrapped
    with `x instanceof Error ? x : new Error(String(x))`, a no-op for real
    traffic, satisfies Sonar's static type check.
  - `details.ts:179` rejected with no argument at all (`reject()` →
    `undefined`). Now rejects with the actual caught error. Required
    updating one test (`details.test.ts`) that explicitly asserted
    `.rejects.toBeUndefined()` — checked both callers first; they only log
    the rejection value, never branch on it.
  - `keycloak-user-creation.ts:65` rejected with the literal `false`. Now
    `reject(new Error('checkUUIDMaster: No records'))`, matching the exact
    pattern its sibling function `checkUniqueKey` already used two lines
    above it. Updated the one test asserting `.rejects.toBe(false)`; the
    one caller (`signup.ts`) only logs the value.
- **`custom-keycloak.ts:117`**: removed an `async` keyword from a function
  with zero `await` expressions inside it (the one risky line is already in
  its own try/catch) — the function was typed as Promise-returning but could
  never actually reject or need awaiting. Confirmed no code in this
  repository calls `.authenticated()` directly; `keycloak-connect` invokes it
  internally as a fire-and-forget hook. Updated one test that required
  `.resolves` (a Promise return) to a plain synchronous assertion.
- **New `orgSignupValidators.test.ts`** (16 tests): the shared Joi validators
  extracted in CHANGE 9 aren't exercised by any HTTP-level test today (each
  org-signup file's test suite is scoped to OTP endpoints only, not
  `/createUser`). Formalizes a direct proof — required/optional,
  valid/invalid, boundary cases for every field — that previously only
  existed as a throwaway verification script.

One item from the original 16 was investigated and reverted after breaking a
test on the first attempt (`custom-keycloak.ts`'s `async` removal, before the
test was updated) — caught immediately by the test suite, exactly as
intended.

### Verified

- Full Jest suite: 213→214 suites (the new test file), 3189→3205 tests,
  green throughout every batch.
- `npx tsc --noEmit -p tsconfig.json`: clean.
- `npx tslint` (full run, no `--fix`): clean.
- `npm run build`: clean; `dist/` file count unchanged (no new files —
  `orgSignupValidators.test.ts` is excluded from the build like every
  other `*.test.ts`).
- Multiple transient full-suite failures along the way, every one in a file
  untouched by this change, confirmed clean in isolation and on retry — the
  same `mountRouter` cross-talk pattern documented throughout this project.

### MUST VERIFY IN PROD

- [ ] None expected — every rejection now carries strictly more information
      (a real `Error` instead of `undefined`/`false`) than before, and no
      caller was found that branches on the old value's exact shape.

---

## CHANGE 13 — content.ts: extracted the org/rootOrg header guard

**File:** `src/protectedApi_v8/content.ts`.

### What changed and why

CHANGE 8 extracted this file's shared catch-block (`handleContentError`) but
left the org/rootOrg 400-guard duplicated 11 times:

```ts
const org = req.header('org')
const rootOrg = req.header('rootOrg')
if (!org || !rootOrg) {
  res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
  return
}
```

Verified all 11 occurrences byte-identical (2 had an extra, independent
`extractUserIdFromRequest(req)` line interleaved — reordered to call the
guard first, which doesn't change behavior since that call doesn't depend on
`org`/`rootOrg`). Added `requireOrgHeaders(req, res)`, returning
`{ org, rootOrg } | null` — `null` after already sending the 400, so callers
`return` immediately on a falsy result, same control flow as before.

One route (`/searchRegionRecommendation`) only ever used `rootOrg`
afterward — `org` was referenced solely inside the guard condition itself,
which now lives in the shared helper. Destructuring `{ org, rootOrg }` there
left `org` truly unused; TypeScript's `noUnusedLocals` caught this
immediately, and the fix was to destructure only `{ rootOrg }` for that one
route — a real, verified difference in what each route needs post-guard,
not a copy-paste oversight.

Line count went from 796 to 803 (up, not down) — the guard's 3-line
call-site cost is roughly break-even against the original 4-line inline
check, plus the ~15-line shared helper itself. Duplication reduction here is
about repeated *blocks*, not raw line count, consistent with how Sonar's
metric works.

### Verified

- `content.test.ts`: 59/59, including an explicit "rejects a request
  missing org/rootOrg headers" case for every affected route.
- `npx tsc --noEmit`: clean (caught the one real unused-variable case above).
- `npx tslint`: clean.
- Full suite: 214/214 suites, 3205/3206 tests.
- `npm run build`: clean; `dist/` unchanged at 277 files.

### MUST VERIFY IN PROD

- [ ] None expected — every route sends the identical 400 status and body
      for a missing org/rootOrg header, and every route's post-guard logic
      is byte-identical to before.

---

## CHANGE 14 — goals.ts: extracted the rootOrg header guard

**File:** `src/protectedApi_v8/user/goals.ts` (451 → 453 lines).

### What changed and why

Covers L1-16 from `docs/DUPLICATE-CODE-CLEANUP.md`. 14 routes repeated:

```ts
const rootOrg = req.header('rootOrg')
if (!rootOrg) {
  res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
  return
}
```

Verified all 14 byte-identical before touching anything. Added
`requireRootOrg(req, res): string | null` — `null` after already sending
the 400. Since this file only ever guards on `rootOrg` (unlike `content.ts`,
which also guards on `org`), the replacement keeps the same variable name
(`const rootOrg = requireRootOrg(req, res)`) at every call site, so nothing
below the guard in any route needed to change.

### Verified

- `goals.test.ts`: 49/49, including an explicit "rejects a request missing
  rootOrg" case for every affected route.
- `npx tsc --noEmit`: clean on the first attempt (no unused-variable
  surprises this time, unlike `content.ts`'s CHANGE 13).
- `npx tslint`: clean.
- Full suite: 214/214 suites, 3205/3206 tests.
- `npm run build`: clean; `dist/` unchanged at 277 files.

### MUST VERIFY IN PROD

- [ ] None expected — every route sends the identical 400 status and body
      for a missing rootOrg header, and every route's post-guard logic is
      byte-identical to before.

---

## CHANGE 15 — content.ts: merged the two hierarchy-update routes

**File:** `src/protectedApi_v8/content.ts`.

### What changed and why

Covers L1-14. `/hierarchy/update` and `/kb/:updateType` had identical route
bodies (guard → build URL → `axios.post` → send response → catch), differing
only in which upstream URL they hit. The two URL-builder functions
(`API_END_POINTS.updateHierarchy`, a static string, and
`API_END_POINTS.addHierarchy(apiType)`, which builds a different path shape —
`/action/content/kb/${apiType}` vs `/action/content/hierarchy/update`) aren't
interchangeable by parameterizing on `apiType` alone, so the shared helper
takes the already-resolved URL string instead of trying to unify the two
builder functions.

Added `updateContentHierarchy(req, res, url)`; both routes now just resolve
their own URL and delegate to it.

### Verified

- `content.test.ts`: 59/59 — `/kb/:updateType` and `/hierarchy/update` each
  still independently verified (forwards response, rejects missing headers,
  handles upstream failure).
- `npx tsc --noEmit` / `npx tslint`: clean.
- Full suite: 214/214 suites, 3205/3206 tests. One transient failure in
  `roles.test.ts` (untouched by this or any recent change) — confirmed
  clean in isolation (32/32) and on full-suite retry.
- `npm run build`: clean; `dist/` unchanged at 277 files.

### MUST VERIFY IN PROD

- [ ] None expected — each route posts to the exact same upstream URL as
      before, with the same query params, body, and headers.

---

## CHANGE 16 — cross-file: shared search-response shaping tail

**Files:** `src/utils/contentHelpers.ts` (new `sendSearchResponse` export),
`src/protectedApi_v8/content.ts`, `src/publicApi_v8/home.ts`,
`src/publicApi_v8/publicContent.ts`.

### What changed and why

Covers L1-13. `content.ts`'s `/searchV6`, `home.ts`'s `/searchV6`, and
`publicContent.ts`'s `/v1/search` each had a byte-identical response-shaping
tail after their (differently-built) upstream call:

```ts
const contents: IContent[] = response.data.result
if (Array.isArray(contents)) {
  response.data.result = contents.map((content) => processContent(content))
}
res.json(
  response.data || {
    filters: [], filtersUsed: [], notVisibleFilters: [], result: [], totalHits: 0,
  }
)
```

Confirmed identical in all 3 files before touching anything. This is
strictly the response side — the request-building half of each handler
differs (protected vs public auth, `uuid` sourced from
`extractUserIdFromRequest` vs a constant `adminId` vs omitted entirely) and
was deliberately left alone, per the doc's own scoping note; merging the
full handlers is a separate, larger Level 2 item.

Added `sendSearchResponse(res, response)` to `contentHelpers.ts` — already
the shared home for `processContent`, which this function calls, and
already imported by all 3 files. Removing the inline tail left
`processContent` and `IContent` unused in `home.ts` and `publicContent.ts`
(their only use was in this exact block) — both unused imports removed;
`content.ts` keeps both, still used elsewhere in that file.

### Verified

- `content.test.ts`, `home.test.ts`, `publicContent.test.ts`,
  `contentHelpers.test.ts`: 116/116 combined.
- `npx tsc --noEmit` / `npx tslint`: clean.
- Full suite: 214/214 suites, 3205/3206 tests. One run showed 17 failures
  across 2 suites (neither `content.ts`, `home.ts`, nor `publicContent.ts`,
  nor `contentHelpers.ts`) — confirmed clean on immediate retry, same
  `mountRouter` cross-talk pattern documented throughout this session.
- `npm run build`: clean; `dist/` unchanged at 277 files.

### MUST VERIFY IN PROD

- [ ] None expected — every one of the 3 routes sends the identical
      response shape (mapped contents, same empty-result fallback) as
      before; only the request-building side of each route was untouched.

---

## CHANGE 17 — social.ts and connections_v2.ts: extracted catch-block handlers

**Files:** `src/protectedApi_v8/social.ts` (737 → 656 lines),
`src/protectedApi_v8/connections_v2.ts` (459 → 433 lines).

### What changed and why

Covers L1-8. The original doc grouped this cluster with `socialv2.ts` and
`connections.ts` as cross-file duplication, but both of those were removed
as dead code in CHANGE 6 — so what's left is each file's own internal
self-duplication, not a genuine cross-file cluster, and each gets its own
local handler (matching the CHANGE 8 pattern) rather than a shared
cross-file one:

- `social.ts`: 25 catch blocks, all `res.status(...).send(... ||
  { error: GENERAL_ERROR_MSG })`; 23 with no log call, 2 with
  `logError(label, err)` first. Added `handleSocialError(res, err, label?)`.
- `connections_v2.ts`: 9 catch blocks, all `logError(label, err)` +
  the same status/send shape with `{ error: unknown }` (`unknown` is this
  file's own error-message constant, not the TS type). Added
  `handleConnectionsError(res, err, label)` — label always required here,
  no optional case needed since every occurrence had one.

Verified every occurrence in both files byte-identical before touching
anything.

### Verified

- `social.test.ts`: 100/100. `connections_v2.test.ts`: 36/36 (136 combined).
- `npx tsc --noEmit` / `npx tslint`: clean.
- Full suite: 214/214 suites, 3205/3206 tests.
- `npm run build`: clean; `dist/` unchanged at 277 files.

### MUST VERIFY IN PROD

- [ ] None expected — every route sends the identical status code and body
      shape for every failure case as before.

---

## CHANGE 18 — Level 2 batch: 7 files, real-but-safe deduplication

Covers the Level 2 items from `docs/DUPLICATE-CODE-CLEANUP.md` that had a
genuinely safe extraction available once their real per-route differences
were preserved as explicit parameters, rather than merged away. Each file
verified independently (own test suite + full regression + build) before
moving to the next; grouped here since the pattern and rigor are identical
across all seven.

**Files:**

| File | Lines before → after |
|---|---|
| `leaderboard.ts` | 404 → 407 |
| `user/goals.ts` | 451 → 415 |
| `user/playlist.ts` | 618 → 582 |
| `discussionHub/writeApi.ts` | 269 → 287 |
| `user/myAnalytics.ts` | 757 → 545 |
| `workallocation.ts` | 437 → 397 |
| `workflow-handler.ts` | 300 → 288 |

New file: `src/utils/contentPatchHelpers.ts`.

### leaderboard.ts (L2-8)

`/badgeWon` and `/badgeYetToWin` had identical request-building, differing
only in the upstream endpoint and the response-processing function
(`processBadgeArray` vs `processAllBadges`, different TypeScript generic
types). Added `fetchAndProcessBadges<T>(req, res, url, processResponse)`,
generic over the response type, taking the processing function as a
parameter rather than trying to unify two functions with different shapes.

### goals.ts / playlist.ts (L2-10, L2-13)

The `PATCH /:goalId` / `PATCH /:playlistId` two-step "rename" flow
(patch title, then patch the content hierarchy) was identical except
`formPlaylistupdateObj`, which reads `req.name` in `service/goals.ts` but
`req.playlist_title` in `service/playlist.ts` — a real difference found
during investigation (see the L1-15→L2-13 reclassification in CHANGE 9's
era). Added `patchContentViaHierarchyUpdate(req, res, contentId,
formUpdateObj, buildHierarchyPatch)` in the new shared
`contentPatchHelpers.ts`, taking both file-specific transform functions as
parameters. Also fixed a `rootOrg` guard in this exact route in `goals.ts`
that CHANGE 14's bulk replace had missed (it had `auth` interleaved between
the header reads, same reason 2 similar cases were caught separately in
`content.ts`'s CHANGE 13) — now uses `requireRootOrg` like the rest of the
file.

### discussionHub/writeApi.ts (L2-11)

Split into what's safe and what isn't. `bookmark`/`vote` (POST and DELETE)
have identical shape, differing only in URL and whether the client body is
forwarded (`bookmark` discards it, `vote` doesn't) — merged into
`postWithUserUid`/`deleteWithUserUid`, with the body passed explicitly per
call site so the difference stays visible, not silently unified.
`follow`/`tags` were left alone: `follow` needs an extra `getUserUID()`
call (with a pre-existing `// TODO` marker) that `tags` doesn't, and
forcing them into one helper would add real structural complexity for a
~15-line saving.

### myAnalytics.ts (L2-5)

The largest single change. 22 of 30 routes shared the same upstream-header
object and response-forwarding tail; added `myAnalyticsHeaders(req,
userId)` and `sendMyAnalyticsResponse(res, request)`. Each route keeps its
own URL/query-param construction and its own axios verb call (GET/POST/
DELETE, with or without a body) — only the header object and the
await/send/catch tail are shared. Left alone, exactly matching the
documented outliers: the 2 middleware-chain routes
(`/userProgress/:contentType`, `/:contentType/learning-history`), and
`/assessments`/`/certification`, which reshape the response body after the
axios call and can't just forward `response.data` directly. `/myskills`'s
different userId-resolution fallback (`req.query.wid || 
extractUserIdFromRequest(req)`) is preserved as the value passed in at that
one call site, not lost in the shared helper.

Caught and fixed one real mistake during this extraction: an editing error
left a broken half-finished function (`unusedPlaceholder`) in the file
after the last route conversion. Found and removed before any test ran —
`tsc --noEmit` caught it would not have compiled, but it was checked
visually first.

### workallocation.ts (L2-6)

Every one of the 14 routes shares the same catch-block shape, but 11 of the
14 have a pre-existing bug — `logError(Error + err)`, string-coercing the
global `Error` constructor instead of logging `failedToProcess + err` like
the other 3 routes. Preserved verbatim: `handleWorkAllocationError(res,
err, useBuggyLog: boolean)` takes an explicit flag so each call site keeps
whichever behavior it already had. Verified with a direct Node check that
`(useBuggyLog ? Error : failedToProcess) + err` produces byte-identical
output to both original forms. Also added `requireParam(res, value,
failMessage)` for the `userId`/`workOrderId`/`workAllocationId` presence
guards (7 of the 14 routes). The auth-header construction (v1
`extractAuthorizationFromRequest` vs v2 `SB_API_KEY` +
`x-authenticated-user-token`, and which routes include `userId` in the
header object) was left inline per route — genuinely different per the
doc's own investigation, not touched.

### workflow-handler.ts (L2-7)

Simpler than `workallocation.ts` — this file's catch block has no buggy
variant, fully uniform across all 9 routes. Added `handleWorkflowError(res,
err)` (no parameters needed) and `requireWorkflowOrgHeaders(req, res)` for
the `org`/`rootorg` guard, present on exactly the 5 POST routes and absent
from all 4 GET routes — confirmed this is the systematic, documented split,
not something to "fix" by adding guards where they'd never existed.

### Verified

- Each file's own test suite green after its own edit:
  `leaderboard.test.ts` 35/35, `goals.test.ts` + `playlist.test.ts` 90/90
  combined, `discussionHub/writeApi.test.ts` 18/18,
  `myAnalytics.test.ts` 64/64, `workallocation.test.ts` 35/35,
  `workflow-handler.test.ts` 42/42.
- `npx tsc --noEmit` / `npx tslint`: clean after every file.
- Full suite run after every file: always 214/214 suites, 3205/3206 tests.
  Several transient failures along the way, every single one in a file
  untouched by that step's edit, confirmed clean in isolation and on
  retry — the same `mountRouter` cross-talk pattern documented throughout
  this project.
- `npm run build` after every file: clean; `dist/` file count unchanged
  except for the one new shared module (`contentPatchHelpers.ts`).

### MUST VERIFY IN PROD

- [ ] None expected — every route's request-building, auth mechanism, and
      response/error shape is byte-identical to before. The two
      already-preserved pre-existing behaviors (the `workallocation.ts` log
      bug, `goals.ts`/`playlist.ts`'s different rename-body field names)
      are unchanged, not fixed, as part of this pass.

---

## Investigated and deliberately NOT changed — `assessmentSubmitHelper.ts:167` regex hotspot

Sonar hotspot S5852 flags `qkey.question.replace(/<\/?[^>]+(>|$)/g, '')` as
vulnerable to super-linear regex backtracking. Investigated whether a
rewrite could close this hotspot with a real code change (as opposed to the
existing `SAFE` review already on file in `scripts/sonar-hotspot-reviews.mjs`).

**Finding: a "safer-looking" rewrite would have been a regression, not a
fix.** Tested a restructured version —
`.replace(/<[^>]+>/g, '').replace(/<[^>]+$/, '')` — designed to avoid
Sonar's flagged pattern shape. It produced byte-identical output across 26
correctness cases (empty string, well-formed tags, unclosed tags, adjacent
tags, non-tag `<`/`>` usage, script tags, etc.). But on an adversarial
50,000-character input (`'<'.repeat(50000)`, no `>` anywhere), it measured
**1,776ms versus 0ms for the original** — a genuine, reproducible
performance cliff the original doesn't have.

**Why:** the original regex's `(>|$)` alternation gives `[^>]+` an
end-of-string escape hatch — on a run of `<` characters with no `>`,
`[^>]+` greedily consumes to the end, `$` matches immediately with zero
backtracking, and the global match consumes the whole string in one pass
(genuinely O(n)). The rewrite's first pass, `<[^>]+>`, requires a literal
`>` and has no such escape hatch — on the same adversarial input, at every
one of the 50,000 `<` positions it greedily consumes to the end, finds no
`>`, backtracks one character at a time, fails, and restarts at the next
position: real quadratic-time backtracking.

This confirms the existing hotspot justification was correct, not just
convenient: `[^>]+` here is not nested inside another quantifier, and the
alternation's anchor branch is the reason it's actually safe. Sonar's
static rule can't see that `[^>]` and `>` are mutually exclusive, so it
flags the pattern shape without being able to prove (or disprove) the
actual backtracking behavior — a false positive, confirmed by direct
measurement rather than assumed.

**Decision: no code change.** The file is unchanged. The `SAFE` resolution
already recorded in `scripts/sonar-hotspot-reviews.mjs` stands, and is now
backed by an executable timing proof, not just static reasoning.

---

## Defects found by the Phase 1 test work (NOT changed)

Surfaced while adding coverage for `src/protectedApi_v8/admin/userRegistration.ts`.
All three are pre-existing and none was modified — each is a behavioural change
needing its own decision.

### A. `/create-user` can crash the Node process

`getAuthToken(...)` is called **without `await`** (`userRegistration.ts` ~line 189),
so two responses race:

- the `.catch` on `getAuthToken` → `res.status(400).send('1004: ...')`
- the end of the handler → `res.json({ data: 'User Created successfully!' })`

**Measured, not theorised:**

- With an *immediate* rejection the outcome is **nondeterministic** — the same
  input returned 400 in one run and 200 in another, depending purely on microtask
  interleaving.
- With a *delayed* rejection (the realistic case — a real Keycloak round trip is
  never instant) the 200 is sent first, and the late `res.send()` then throws:

  ```
  Error: Cannot set headers after they are sent to the client
    at src/protectedApi_v8/admin/userRegistration.ts:195:33
    code: 'ERR_HTTP_HEADERS_SENT'
  ```

  This is raised **outside the request cycle**, so Express error middleware
  cannot catch it. Under default Node behaviour an uncaught exception
  **terminates the process**.

**Impact:** a Keycloak token failure during user creation can (a) report success
to the caller even though token retrieval failed, and (b) take the service down.

**Likely fix** (needs approval — it changes response behaviour): `await` the
`getAuthToken` call, and make the `.catch` log only rather than write to `res`.

**MUST VERIFY IN PROD:**
- [ ] Force a Keycloak token failure during `/create-user` and confirm whether the
      process survives. Check for `ERR_HTTP_HEADERS_SENT` in logs.
- [ ] Confirm what the client actually receives (200 or 400) on that failure.

### B. `/create-user` never responds when Keycloak returns no id

The handler only responds inside `if (createKeycloak && createKeycloak.id)`. A
Keycloak success carrying no `id` sends **no response at all** — the request hangs
until the client times out.

- [ ] Confirm Keycloak always returns an id on success in your configuration.

### C. `createKeycloakUser` error handler assumes `error.response` exists

`error.response.status === 409` is read without a guard. A transport-level failure
(Keycloak unreachable, DNS, timeout) has no `.response`, so this throws a
`TypeError` inside the `.catch` — surfacing as a 500 from the outer handler rather
than a meaningful message.

- [ ] Take Keycloak offline and confirm `/create-user` degrades acceptably.

### D. `/signup` and `/validateOtp` can also crash on a missing required field

Same failure family as (A), but triggered **synchronously within a single
request** rather than by an async race — reproducing either in a test hangs the
runner, so both are documented rather than executed:

- **`/signup`**: `if (!req.body.email) { res.status(400)... }` has **no `return`**,
  so a request with no email falls through and keeps processing with
  `email: undefined`. The signup attempt then fails deeper in the flow, and the
  outer `catch` calls `res.status(500).send()` on an **already-sent** response —
  throwing `ERR_HTTP_HEADERS_SENT` inside the handler's own catch block, which is
  not itself wrapped in anything. Genuinely unhandled.
- **`/validateOtp`**: the `validateRequestBody` middleware sends 400 for a missing
  `otp` **without returning**, then calls `next()` unconditionally. The route
  handler runs anyway, and if `email` or `mobileNumber` is present it reaches its
  own `if (!validOtp)` branch and calls `res.status(400).send()` on the
  already-sent response. That throws, is caught by the handler's `try/catch`, and
  the catch's `res.status(500).send()` throws the **same error again** —
  unhandled the second time.

**MUST VERIFY IN PROD:**
- [ ] POST `/signup` with no `email` field and confirm whether the process
      survives; check logs for `ERR_HTTP_HEADERS_SENT`.
- [ ] POST `/validateOtp` with `email` set but no `otp` and confirm the same.

### E. `/registerUserWithMobile` can hang with no response at all

`createuserWithmobileOrEmail` catches its **own** axios errors internally and
returns `undefined` (its `catch` block has no `return`/`throw`), so the caller's
`.catch(handleCreateUserError)` never fires — it only ever sees a resolved
`undefined`. Back in the handler, `if (newUserDetails)` is then false with no
`else`, so **no response is ever sent**.

**Confirmed empirically**: this exact scenario timed out a real request in the
test suite at Jest's default 30s timeout.

**MUST VERIFY IN PROD:**
- [ ] Force the create-user upstream call to fail during `/registerUserWithMobile`
      (e.g. point `KONG_API_BASE` at an unreachable host) and confirm the client
      eventually times out rather than receiving any error response. Check
      whether an upstream load balancer/proxy timeout masks this before it
      becomes user-visible.

### F. `GET /parents/:contentId` returns 200 even when the upstream call fails

`getParentDetails()` in `src/protectedApi_v8/content.ts` catches its own axios
error and **returns** it instead of re-throwing. The route handler's
`try/catch` therefore never sees a rejection — it calls `res.json(response)`
on the Error object, which Express serialises and sends with a **200** status.
A client cannot distinguish "no parents" from "the upstream call failed."

**MUST VERIFY IN PROD:**
- [ ] Make the content-parents upstream unreachable and confirm the response
      status/body a client actually receives.

### G. `bnrcUser.ts` — `/otp/sendOtp` and `/otp/validateOtp` can double-send

Same unreturned-400 pattern as defects D and the userRegistration family:
`res.status(400).json(...)` with **no `return`**, so a missing `phone`
(sendOtp) or missing `phone`/`otp` (validateOtp) falls through and the handler
calls msg91 anyway, then sends a second response on success — throwing
`ERR_HTTP_HEADERS_SENT`. `/otp/resendOtp` in the same file does this correctly
(has a `return`) and was verified working as expected.

**MUST VERIFY IN PROD:**
- [ ] POST `/otp/sendOtp` and `/otp/validateOtp` with the required field(s)
      omitted and confirm the process survives.

**Same defect confirmed in `upsmfUser.ts`** (near-identical file, same author):
`/otp/sendOtp` and `/otp/validateOtp` have the same unreturned-400 pattern;
`/otp/resendOtp` is correct in both files.
- [ ] Repeat the same verification against `upsmfUser.ts`'s
      `/otp/sendOtp` and `/otp/validateOtp`.

### H. `POST /notifyContentState` (proxies_v8.ts) has NO try/catch at all

Worse than the other unreturned-400 cases: this handler has **no surrounding
try/catch whatsoever**. Both the missing-`contentState` guard and the
switch's `default:` case (unrecognised `contentState`) call
`res.status(400).send(...)` **without returning**, so execution falls through
past the `switch` into the `axios` call with an empty `contentBody`.

**Confirmed while writing tests, not theorised:** with the upstream axios call
unmocked, this throws `TypeError: Cannot read properties of undefined
(reading 'data')` — an **unhandled exception outside any catch block**. Had
axios instead resolved, it would reach a second `res.status(...).send()` on an
already-sent response (`ERR_HTTP_HEADERS_SENT`), same as the pattern elsewhere
in this codebase — except here nothing catches either failure.

**MUST VERIFY IN PROD:**
- [ ] POST `/notifyContentState` with no `contentState`, and separately with
      an invalid one, and confirm whether the process survives.

### I. `GET /userData/v1/bulkUpload` (proxies_v8.ts) has no try/catch

Same missing-catch pattern as H: an upstream `axios` rejection here becomes an
unhandled promise rejection with no response ever sent to the client.

**MUST VERIFY IN PROD:**
- [ ] Make the Kong user-read call fail during `GET /userData/v1/bulkUpload`
      and confirm the client eventually times out rather than getting any
      error response, and that the process itself survives.

### J. `proxyHierarchyKnowledge` (proxyCreator.ts) proxies certain requests TWICE

For a request whose URL contains both `/hierarchy` and `?mode=edit`, the
function calls `proxy.web(...)` once inside that `if` branch, then an
**identical, unconditional** `proxy.web(...)` call immediately follows with no
`else`/`return` — so the same request is proxied to the upstream a second
time. Confirmed directly: the test asserting this calls `mockWeb` and counts
exactly 2 invocations for a `?mode=edit` hierarchy URL, vs 1 for any other URL.

This function backs the `/action/content/v3/hierarchy/update`-style routes
mounted in `proxies_v8.ts` and `mobileAppApi.ts`.

**MUST VERIFY IN PROD:**
- [ ] Confirm whether a hierarchy edit-mode request actually reaches the
      upstream twice (e.g. via upstream request logs/metrics), and whether
      that causes a duplicate write, a duplicate side effect, or is otherwise
      harmless because the second call's response simply loses the race for
      `res`.

---

### K. `POST /setPasswordWithOTP` (customSignup.ts) never responds when the user lookup returns falsy

```ts
const userData = await getUser(username)
if (userData) {
  // ... verify OTP, reset password, res.status(200).json(...)
}
// no else — if userData is falsy, the request hangs with no response.
```

`getUser()` returns `e.response.data` on any upstream failure caught internally,
which is `undefined`/`null` for a 404-style "no such user" response. There is no
`else` branch, so the client gets no response at all (client-side timeout, not a
clean error). Confirmed by reading the code; not reproduced live (would hang the
test runner, same class of bug as change G/H's live-crash tests removed
earlier).

Additionally, in the same handler:

```ts
const status = resetKCPassword(userId, password)
res.status(200).json({ message: status })
```

`resetKCPassword` is `async` and returns a `Promise`; the call above is missing
`await`. The 200 response is sent with `message` set to a pending `Promise`
object (serializes to `{}` over JSON), not the actual reset status — so a
caller can never tell from this response whether the password reset actually
succeeded or failed. Confirmed via a unit test on `resetKCPassword` directly
(`src/publicApi_v8/customSignup.test.ts`), and by reading the handler; the
route-level test for the success path deliberately does not assert on the
`message` field's content, only on the 200 status.

**MUST VERIFY IN PROD:**
- [ ] Confirm whether "reset password with OTP, for a username that doesn't
      resolve to any Keycloak user" is a reachable flow from the client (e.g.
      user mistypes username after already receiving an OTP) — if so, users
      hit a hang/timeout instead of a clear error.
- [ ] Confirm whether any caller of `/setPasswordWithOTP` inspects the
      `message` field of the 200 response to decide if the reset worked, since
      that field is currently always a serialized empty object regardless of
      outcome.

---

### L. `POST /registerUserWithMobile` (customSignup.ts) always reports success, even if the OTP send fails

```ts
customSignUp.post('/registerUserWithMobile', async (req, res) => {
  const mobileNumber = req.body.mobileNumber
  await sendOTP(mobileNumber)
  res.status(200).json({ message: 'Success' })
  return
})
```

`sendOTP()` catches its own errors internally and returns the string `'Error'`
rather than throwing — but this handler never inspects that return value. A
user whose OTP failed to send (upstream MSG91 outage, bad mobile number
format, etc.) still receives `200 { message: 'Success' }`, indistinguishable
from a real send. Confirmed via
`src/publicApi_v8/customSignup.test.ts`'s `sendOTP` unit tests (which show it
returns `'Error'` on failure) plus reading the route handler, which discards
that return value entirely.

**MUST VERIFY IN PROD:**
- [ ] Confirm whether the mobile-registration client relies on this 200
      response to advance the UI (e.g. to an "enter OTP" screen) — if so, a
      silent OTP-send failure leaves the user stuck on that screen with no
      code ever sent and no error shown.

---

### M. `GET /:recommendationType` (recommendation.ts) sets a bogus `params.url` instead of appending to the request URL

```ts
if (rootOrg !== 'PNG' && org !== 'PNG') {
  params.url += `isExternal=false`
}
```

`params` is the axios `params` (query-string) object built a few lines above —
it has `pageNumber`, `pageSize`, `sourceFields`, `type`, and (for `latest`)
`learningMode`/`excludeContentType`. It never has a `url` field. This line
reads `params.url` (`undefined`), string-concatenates `'isExternal=false'`
(`undefined + string` → `'undefinedisExternal=false'` in JS), and assigns the
result to a brand-new `params.url` key — which axios then serializes as an
actual `?url=undefinedisExternal%3Dfalse` query parameter sent upstream. The
apparent intent (append `isExternal=false` to the outgoing request, likely
meant for the request URL string) never happens; instead an extra, garbage
`url` parameter is sent for every `latest`-type recommendation request where
neither `rootOrg` nor `org` is `'PNG'`. Confirmed by reading the code; not
fixed here (behavioural change, would need product confirmation of the actual
intended query shape). `recommendation.test.ts`'s two `/latest` tests
(iGOT-exclusion and explicit-excludeContentType cases) both fall through this
branch already, so the existing (buggy) `params.url` value is implicitly
present in every "latest" call captured there — deliberately not asserted on,
since asserting on it would pin the bug rather than the behaviour.

**MUST VERIFY IN PROD:**
- [ ] Confirm whether the upstream recommendation service errors, ignores, or
      silently misbehaves on receiving this unexpected `url` query parameter
      for `latest`-type requests outside the `PNG` org.
- [ ] Confirm whether `isExternal=false` filtering was ever actually applied
      to these requests, or has been silently missing since this code was
      written — i.e. whether external content has always been showing up in
      "latest" recommendations for non-PNG orgs when it shouldn't.

---

### N. `getUserByEmail`/`getUserByUsername` (discussionHub/users.ts) never actually call the upstream API

```ts
export async function getUserByEmail(email: any): Promise<any> {
  try {
    const url = API_ENDPOINTS.getUserByEmail(email)
    return async () => {
      const responseAPI = axios.get(url, { ...axiosRequestConfig }).catch((err) => { ... })
    }
  } catch (err) { ... }
}
```

The function `return`s an `async () => {...}` arrow function instead of
calling and awaiting it. Nothing ever invokes that returned function, so the
`axios.get(...)` inside it **never executes**. `getUserByEmail(email)`
resolves to a function value, not user data — every caller receiving that
value and reading `.data` off it gets `undefined`. `getUserByUsername` has the
identical shape and the identical bug.

The only route wired to this is `GET /email/:email`, which does
`const responseEmail = await getUserByEmail(email); res.send(responseEmail.data)`
— so this endpoint **always** responds `200` with an empty body, for every
email, whether or not a matching NodeBB user exists, and regardless of any
upstream failure (there is none, because the call is never made). Confirmed
via `src/protectedApi_v8/discussionHub/users.test.ts`, which asserts the route
returns 200 with `axios.get` never called, and that both functions resolve to
a `function`, not a response object.

`getUserByUsername` is not called from any route in this codebase (verified
via a full-repo search) — currently dead code with the same defect, so it
poses no live risk until something starts calling it.

**MUST VERIFY IN PROD:**
- [ ] Confirm whether any client actually calls `GET /email/:email` and, if
      so, how it currently handles an always-empty `200` response — this may
      already be a silently-broken feature (e.g. "find NodeBB user by email"
      never working) rather than a live regression risk.
- [ ] If `/email/:email` is unused/dead, this can be a safe, isolated future
      fix (add the missing `await`/invocation); flagging here rather than
      fixing now since it changes response behavior for a route with unknown
      callers.

---

### O. `createDiscussionHubUser` (discussionHub/writeApi.ts) has the same never-invoked-closure bug as change N

```ts
export async function createDiscussionHubUser(user: any): Promise<any> {
  try {
    const request1 = { ...user, _uid: getWriteApiAdminUID() }
    const url = API_ENDPOINTS.createUser
    return async () => {
      return axios.post(url, request1, { ... }).catch((err) => { ...; return err })
    }
  } catch (err) { ... }
}
```

Identical pattern to change N: the inner `async () => {...}` is returned, not
called — `axios.post` never executes. `writeApi.post('/users', ...)` does
`const response = await createDiscussionHubUser(req.body); res.send(response.data)`,
so `POST /users` always responds `200` with an empty body and never actually
creates a user in NodeBB DiscussionHub, regardless of the request body.
Confirmed via `src/protectedApi_v8/discussionHub/writeApi.test.ts`, same
assertion shape as change N (response is a function, `axios.post` never
called).

**MUST VERIFY IN PROD:**
- [ ] Confirm whether `POST /users` for DiscussionHub is a reachable,
      currently-relied-upon flow (e.g. auto-provisioning a NodeBB account on
      first discussion-hub visit) — if so, this endpoint has likely never
      worked, and any feature depending on a NodeBB user existing may be
      silently broken.

---

### P. Eight `writeApi.ts` routes have no response at all when the upstream call succeeds with empty data

Every route below follows:

```ts
const response = await axios.post(url, body, config)
if (response && response.data) {
  res.send(response.data)
}
// no else — if response.data is falsy (e.g. a 204 No Content, or any
// upstream response with an empty/null body), no res.send/res.status is
// ever called, and the request hangs until the client times out.
```

Affected: `POST /topics`, `POST /topics/:topicId`, `POST /posts/:postId/bookmark`,
`DELETE /posts/:postId/bookmark`, `POST /posts/:postId/vote`,
`DELETE /posts/:postId/vote`, `PUT /topics/:topicId/follow`,
`PUT /topics/:topicId/tags`. Confirmed by reading each handler; **not**
reproduced live in `writeApi.test.ts` (same category as the hang bugs in
changes E/K — deliberately not exercised, would hang the test runner). Every
success-path test in that file uses a truthy `response.data` to stay on the
safe, already-working branch.

**MUST VERIFY IN PROD:**
- [ ] Confirm whether the NodeBB DiscussionHub API ever legitimately responds
      with an empty body / 204 for any of these eight write operations (vote,
      bookmark, follow, tag-update, topic create/reply) — if so, those calls
      currently hang the client-facing request instead of confirming success.

---

### Q. `signupWithAutoLogin.ts` has three unreturned-400 double-send risks

Same bug family as change G (`bnrcUser.ts`) and the auth-path fixes in changes
1–2: an early-exit `res.status(400)...` call with no `return`, so execution
falls through into code that sends a second response, which throws
`ERR_HTTP_HEADERS_SENT` (ERR_HTTP_HEADERS_SENT is uncaught — Express does not
turn it into a clean error response, the request just fails ungracefully).
Not reproduced live in `signupWithAutoLogin.test.ts` — same category as the
live-crash tests removed earlier this session (would hang/crash the Jest
worker). Confirmed by reading the code:

1. **`POST /register`**, missing both `email` and `phone`:
   ```ts
   if (!req.body.email && !req.body.phone) {
     res.status(400).json({ msg: 'Email id or phone both can not be empty', ... })
   }
   // falls through into fetchUserBymobileorEmail(...), createAccount(...), etc.
   ```
2. **`POST /register`**, user already exists:
   ```ts
   if (resultEmail || resultPhone) {
     res.status(400).json({ msg: 'User already exists', ... })
   }
   // falls through into createAccount(...) anyway
   ```
3. **`POST /validateOtpWithLogin`**, missing `otp` while `phone`/`email` is
   present:
   ```ts
   if (!req.body.otp) {
     res.status(400).json({ msg: 'OTP is required', ... })
   }
   if (req.body.phone || req.body.email) {
     // ...
     if (!validOtp) {
       res.status(400).send({ message: OTP_MISSING, status: 'error' })
       return
     }
   ```
   A second `400` fires immediately after the first when `otp` is missing but
   `phone`/`email` is present — confirmed safe to test only when the body has
   neither (single response, no fallthrough); the double-send case itself was
   not exercised live.

**MUST VERIFY IN PROD:**
- [ ] Confirm whether clients calling `/register` with a missing
      email/phone, or with an already-existing account, currently see a
      clean 400 or an ungraceful connection failure from the second send
      attempt.
- [ ] Same question for `/validateOtpWithLogin` when `otp` is omitted but
      `phone`/`email` is present.

---

### R. `signupWithAutoLoginV2.ts` — same double-send family as change Q, one branch worse

`signupWithAutoLoginV2.ts` fixes one of the three bugs from change Q (the
"user already exists" branch in `/register` now has a `return`), but carries
the other two, and `/validateOtpWithLogin`'s version is actually broader:

1. **`POST /register`**, missing both `email` and `phone` — same unreturned
   `res.status(400).json(...)` as v1, falls through into the create-account
   flow. (Unchanged from change Q.)
2. **`POST /validateOtpWithLogin`**, missing `otp` — **this is now
   unconditional**, not gated behind `if (phone || email)` like v1:
   ```ts
   if (!req.body.otp) {
     res.status(400).json({ msg: 'OTP is required', status: 'success' })
   }
   // ... several lines later, unconditionally reached:
   if (!validOtp) {
     res.status(400).send({ message: OTP_MISSING, status: 'error' })
     return
   }
   ```
   In v1 this double-send only happened when `phone`/`email` was also
   present. In v2 it happens for **every** request missing `otp`, including a
   completely empty body — there is no safe input that reaches only the first
   check. Confirmed by reading the code; not reproduced live in
   `signupWithAutoLoginV2.test.ts` (every test there supplies a truthy `otp`
   specifically to avoid this path — see the file's header comment).

**MUST VERIFY IN PROD:**
- [ ] Confirm whether `/validateOtpWithLogin` (v2) is ever called with a
      missing `otp` field in practice (e.g. a client bug, a stale form
      submission) — if so, every such call currently fails ungracefully
      (`ERR_HTTP_HEADERS_SENT`) rather than returning a clean 400.
- [ ] Same missing-email/phone question as change Q.1, for the v2 `/register`
      route.

---

### S. `POST /otp/sendOtp` (ssoLogin.ts) can double-send when both email and phone are missing AND the user isn't found

```ts
if (!userEmail && !userPhone) {
  res.status(400).json({ msg: "Email id and phone both can't be empty", status: 'error' })
}
// falls through into getUserDetails(userEmail, userPhone) regardless
const userDetails = await getUserDetails(userEmail, userPhone)
if (userDetails.data.result.response.count <= 0) {
  return res.status(400).json({ msg: "User doesn't exists...", status: 'error' })
}
```

Same unreturned-400 family as changes G/Q/R. Confirmed by reading the code and
tracing both outcomes:
- If the (wasted) downstream user search finds **no** match, a second
  `res.status(400)` fires — `ERR_HTTP_HEADERS_SENT`. Not reproduced live.
- If the search **does** find a match (an unlikely but possible outcome when
  `userEmail`/`userPhone` are both empty strings, depending on how the
  upstream search API treats an empty filter), neither the phone nor email
  branch below it triggers, so no second response is ever sent — this exact,
  safe combination is what `ssoLogin.test.ts`'s "returns 400 (single
  response)" test exercises, confirming the code doesn't always crash on this
  input, only when the downstream search also reports zero results.

Unlike change Q's `/register` (which has no early-return check at all before
falling through), and change R's `/validateOtpWithLogin` (unconditional
double-send), this one's real-world risk depends on upstream data — but it
is not something to rely on, since the "no match" outcome is the more likely
one for a genuinely empty email/phone.

**MUST VERIFY IN PROD:**
- [ ] Confirm whether the `/private/user/v1/search` upstream ever returns
      zero results for an empty email/phone filter (the crash path) versus
      always erroring or always matching something (the safe path) — this
      determines whether this bug is live-crashing or merely wasteful today.

---

### T. `POST /login` (tnnmcAuthV2.ts) double-sends when the Keycloak token exchange succeeds but returns no `data`

```ts
if (authTokenResponse.data) {
  // ... decode token, set session, getCurrentUserRoles ...
} else {
  res.status(302).json({ msg: AUTH_FAIL, status: 'error' })
}
res.status(200).json({ message: 'success' })
```

The final `res.status(200).json(...)` is **outside** the `if`/`else` —
unconditional. When the token exchange resolves without throwing but with an
empty/falsy `data` (the `else` branch — e.g. the Keycloak endpoint responds
`200` with an unexpected empty body), the handler sends **both** a `302` and
then a `200` for the same request, throwing `ERR_HTTP_HEADERS_SENT`. Same bug
family as changes G/Q/R/S. Confirmed by reading the code; not reproduced live
in `tnnmcAuthV2.test.ts` (all its Keycloak-exchange test cases resolve with a
truthy `access_token`, staying on the safe `if` branch, per the file's header
comment).

**MUST VERIFY IN PROD:**
- [ ] Confirm whether the Keycloak `openid-connect/token` endpoint has ever
      been observed responding successfully (2xx, not a rejected promise)
      with an empty body for this client — if so, every TNNMC login attempt
      hitting that condition currently fails ungracefully instead of
      returning the intended `302`.

---

### U. `getDateRangeString` (utils/helpers.ts) always returns an empty string — date-fns v1 tokens on a v2 install

```ts
export function getDateRangeString(startDateStr, endDateStr): string {
  try {
    ...
    if (startDate.getTime() === endDate.getTime()) {
      conciseRange = formatDate(endDate, 'DD MMM, YYYY')   // 'DD'/'YYYY' — v1 tokens
      return conciseRange
    }
    if (startYear !== endYear) {
      const format = 'D MMM, YYYY'                          // 'D'/'YYYY' — v1 tokens
      ...
    }
    ...
    prefix = formatDate(startDate, 'D')                      // 'D' — v1 token
    suffix = formatDate(endDate, 'D MMM, YYYY')               // 'D'/'YYYY' — v1 tokens
    ...
  } catch (e) {
    return ''
  }
}
```

This project is on **date-fns v2** (`"date-fns": "^2.0.1"`), which deliberately
**throws** on the legacy v1 uppercase tokens `D`, `DD`, `YYYY` (they mean
different things in v2 — day-of-year, ISO week-year — and v2 refuses to
silently misformat, throwing `RangeError: Use \`d\` instead of \`D\`...`
instead). **Every code path in this function hits one of these tokens**, so
every call throws internally and is swallowed by the `catch`, returning `''`.
There is no input for which this function returns a real date range today.

Confirmed directly: `node -e "require('date-fns').format(new Date(), 'D MMM, YYYY')"`
throws exactly this error. Also confirmed via
`src/protectedApi_v8/training.test.ts`'s `/trainings/feedback` test, updated
to assert the actual (empty-string) behavior rather than the obviously-
intended one.

**Blast radius**: `getDateRangeString` has exactly one caller in the whole
codebase — `GET /trainings/feedback` in `training.ts`, which sets
`training.date_range` on every item in the "trainings pending feedback" list.
That field has been blank for every training, for every user, since date-fns
was upgraded to v2 (or since this function was written against v2, if it
never worked). Not fixed here — it's a one-line-per-branch token fix
(`D`→`d`, `DD`→`dd`, `YYYY`→`yyyy`) but changing display formatting wasn't
part of the scope that prompted this test pass, and correcting it changes
user-visible output that should be verified against the actual desired date
format first.

**MUST VERIFY IN PROD:**
- [ ] Confirm the "trainings pending feedback" screen currently shows a blank
      date range for every entry — if so this has been broken (silently, no
      errors surfaced to the user) for as long as date-fns v2 has been in use
      here.
- [ ] If a fix is wanted, the correct v2 tokens are lowercase: `'dd MMM, yyyy'`,
      `'d MMM, yyyy'`, `'d'`, `'d MMM'` — a mechanical swap, no logic change.

---

### V. `POST /login` (sashaktAuth.ts) double-sends when the Keycloak token exchange succeeds but returns no `data`

Identical bug shape to change T (`tnnmcAuthV2.ts`): the whole route funnels
to a single unconditional `res.status(200).json({ message: 'success',
resRedirectUrl })` at the very end, but the `authTokenResponse.data` falsy
branch fires an earlier `res.status(302).json({...})` with no `return`:

```ts
if (authTokenResponse.data) {
  // ...
} else {
  res.status(302).json({ msg: AUTH_FAIL, status: 'error' })
}
// ... falls through unconditionally to:
res.status(200).json({ message: 'success', resRedirectUrl })
```

Confirmed by reading the code; not reproduced live in `sashaktAuth.test.ts`
(same reasoning as change T).

**MUST VERIFY IN PROD:**
- [ ] Confirm whether the Keycloak token endpoint has ever been observed
      responding successfully with an empty body for the `eShashakt` client —
      if so, every affected Sashakt login currently fails ungracefully
      instead of the intended `302`.

---

### W. `bulkUploadUser.ts` — CSV with 0–1 data rows hangs forever; import "success" is reported even when every row fails

```ts
if (result.length > 1) {
  userProcessing()   // fire-and-forget, never awaited
}
// no else, no fallback response — function ends here
```

`userProcessing()` — the only code path that ever calls `_res.send(...)` — is
invoked exclusively `if (result.length > 1)` (i.e. the uploaded CSV has 2 or
more data rows) and is never awaited by the route handler. For a CSV with 0
or 1 data rows, **no response is ever sent**; the request hangs until a
client/gateway timeout. Not reproduced live (per the established policy for
this bug class).

Separately: every per-row user-creation path (`simulateFetchData`,
`saveAshaWorkerData`) wraps its own logic in nested `try/catch` blocks that
swallow all errors without rethrowing, so `Promise.allSettled` always
resolves every row as "fulfilled" regardless of whether the underlying
Keycloak/Kong user creation actually succeeded. `userProcessing()` then
unconditionally responds `200 { message: 'Bulk Upload is Completed!', status:
'success' }` — there is no way for the caller to learn that some or all rows
failed. This behavior **is** safely reproduced live in
`bulkUploadUser.test.ts` (it doesn't hang — the bug is a silently-wrong
response, not a missing one).

**MUST VERIFY IN PROD:**
- [ ] Confirm whether admins uploading a CSV with only 1 data row currently
      experience a hang/timeout.
- [ ] Confirm whether admins have been trusting the "Bulk Upload is
      Completed!" success message even when individual user records failed
      to import — there is currently no way to distinguish a fully successful
      import from a fully failed one via this endpoint's response.

---

### X. `user/roles.ts` — `updateRolesV2Mock` never invokes its own logic; new-user role assignment silently never happens

```ts
// roles.ts
export const updateRolesV2Mock = async (...) => {
  return async () => {
    // ... the actual axios.post role-assignment call lives in here ...
  }
}
```

Same never-invoked-closure defect as changes N/O (`discussionHub/users.ts`,
`discussionHub/writeApi.ts`): the inner `async () => {...}` is returned, not
called, so the `axios.post` role-assignment request inside it **never
executes**. The one caller, `performNewUserSteps` in
`admin/userRegistration.ts`, does:

```ts
await updateRolesV2Mock(actionByWid, updateRolesReq, rootOrg)
  .catch((err) => { logError(...); return 'Roles could not be updated' })
```

Awaiting the outer call only unwraps the outer promise to get the inner
function value — the inner function is never invoked, so `.catch` can never
fire either (the outer promise cannot reject). Net effect: **role assignment
for newly registered users via this code path silently never happens, and no
error is ever logged for it.** Found and verified directly (unit tests on
`updateRolesV2Mock` confirm it resolves to a `function`, and that the
`axios.post` inside it is never called) in `src/protectedApi_v8/user/roles.test.ts`.

**MUST VERIFY IN PROD:**
- [ ] Confirm whether new-user role assignment is actually happening through
      some other mechanism — if this is the only path, newly registered
      users may be missing their `PUBLIC` role assignment silently, with no
      error surfaced anywhere.

---

### Y. `user/feedbackV2.ts` — `GET /categories` is unreachable; shadowed by `GET /:feedbackId`

```ts
feedbackV2Api.get('/:feedbackId', ...)   // registered first
// ...
feedbackV2Api.get('/categories', ...)    // registered second — DEAD CODE
```

Express matches routes for the same HTTP method in registration order, and
the param pattern `/:feedbackId` matches the literal path `/categories`
(with `feedbackId === 'categories'`). Every request to `GET
/feedbackV2/categories` is actually handled by the `/:feedbackId` handler,
which calls a **different** upstream endpoint
(`${FEEDBACK_API_BASE}/v1/feedback/categories?user_Id=...`) instead of the
intended `${FEEDBACK_API_BASE}/v1/config`. Confirmed live in
`user/feedbackV2.test.ts` (asserts the actual URL hit).

**MUST VERIFY IN PROD:**
- [ ] Confirm whether any client calls `GET /feedbackV2/categories` — if so,
      it has been silently receiving the wrong (or an erroring) upstream
      response instead of the feedback categories/config payload. Likely fix:
      reorder route registration so `/categories` is declared before
      `/:feedbackId`.

---

### Z. `appSignUpWithAutoLogin.ts` — two bugs: the usual unreturned-400, and a worse "zero response" hang in OTP validation

1. **`POST /register`**, missing both `email` and `phone`: same unreturned
   `res.status(400).json(...)` fallthrough as changes Q/R/S — not reproduced
   live.

2. **`POST /validateOtpWithLogin`** — worse than the sibling files' double-send
   bugs: this route has **no response at all** on one path, not an extra one.
   ```ts
   let userOtpVerified = false
   if (mobileNumber) { ... userOtpVerified = true }
   if (email) { ... userOtpVerified = true }
   if (userOtpVerified) {
     // ...only place a response is ever sent...
   }
   // falls through here with NO response if userOtpVerified stayed false
   ```
   Unlike both `signupWithAutoLogin.ts` and `signupWithAutoLoginV2.ts`, this
   file has no `if (mobileNumber || email)` guard and no `else` on the final
   `if (userOtpVerified)` block. A request with a truthy `otp` but neither
   `mobileNumber` nor `email` present falls straight through the whole
   handler having never called `res.send`/`.json`/`.status` — the connection
   hangs until a client/gateway timeout. Not reproduced live.

**MUST VERIFY IN PROD:**
- [ ] Confirm no client can call `/validateOtpWithLogin` with a truthy `otp`
      but neither `mobileNumber` nor `email` (e.g. a client-side bug omitting
      both fields) — this would hang the connection indefinitely rather than
      returning any error.
- [ ] Same missing-email/phone question as change Q.1, for this file's
      `/register` route.

---

### AA. `navigator.ts` — five routes have NO try/catch at all, plus additional falsy-data crash risks

Unlike every other route file audited this session (which at minimum wrap
their logic in `try/catch`, even when a missing `return` causes a
double-send), five routes in `navigator.ts` have **no try/catch whatsoever**
around their `axios` calls:

- `GET /role/:roleId/:variantId`
- `GET /lp`
- `GET /lp/:lpId`
- `GET /fp`
- `GET /topics`
- `GET /bpm`

An axios rejection on any of these becomes an **unhandled promise
rejection** — Express 4 (used here) does not convert that into an HTTP
response, so the request hangs until a client/gateway timeout rather than
returning any error status. This is a materially different (and worse) bug
class than the unreturned-400 pattern documented throughout this file: those
at least send *a* response before the problem; these send none at all on any
upstream failure.

Additional bugs found layered on top, all in the same file:
- `GET /role/:roleId/:variantId`: `if (!nsoData.data) { res.status(nsoData.status).send(...) }` has no `return`; a falsy-but-resolved `data` falls through to `findRoleVariant(nsoData.data.nso_data, ...)`, throwing `TypeError: Cannot read properties of undefined (reading 'nso_data')` — another unhandled-rejection hang.
- `GET /lp` and `GET /fp`: `Number(req.query.pageNumber) || 0` silently converts an invalid (`NaN`-producing) `pageNumber`/`pageSize` to `0` *before* the `isNaN(...)` validation check runs, making the intended 400-for-invalid-pagination validation dead code — confirmed live: `?pageNumber=not-a-number` returns `200`, not `400`.
- `GET /topics`: when `topics.size === 0`, the handler calls `res.status(204)` with no `.send()`/`.end()` — the response is never finished, hanging the request. Separately, the falsy guard `if (!lpData.data)` only checks the top-level payload; a truthy-but-empty `data` (e.g. `{}`) passes the guard and then `lpData.data.lp_data.forEach(...)` throws `TypeError: Cannot read properties of undefined (reading 'forEach')` — another unhandled-rejection hang.

None of the hang-triggering inputs above were reproduced live; the pagination
dead-code finding was safely confirmed live since it doesn't hang.

**MUST VERIFY IN PROD:**
- [ ] Confirm whether any of these six `navigator.ts` routes have ever been
      observed timing out / hanging client-side on an upstream failure — this
      is the most severe bug class found this session (no try/catch at all,
      vs. an unreturned-but-present response elsewhere) and the most likely
      to already be causing real, silent production timeouts.
- [ ] Decide whether silently defaulting invalid `pageNumber`/`pageSize`
      query params to `0` (instead of the apparently-intended `400`) is
      acceptable behavior.

---

### AB. `user/badge.ts` — `GET /badgeDetail` calls `req.query` as a function; likely crashes the process on every request

```ts
const badgeIds = req.query('badgeIds')
```

`req.query` is Express's parsed querystring **object**, not a function.
Calling it throws `TypeError: req.query is not a function` — and this line
runs unconditionally, before the route's own `try/catch` even begins, so
nothing in the route catches it. `@types/express-serve-static-core@4.16.6`
(this project's version) types `req.query` as `any`, which is why this
compiles without a TypeScript error.

This is the most severe bug found in this campaign so far: a synchronous
throw inside an `async` Express handler with nothing to catch it becomes an
**unhandled promise rejection**, and Node's default behavior for an
unhandled rejection (Node ≥15) is to **terminate the process**, not just
fail one request. Verified via an isolated Express+supertest probe outside
this project's Jest suite (not committed) that confirms the throw and its
unhandled-rejection nature; not reproduced inside this repo's test suite,
since doing so risks crashing the Jest worker process itself — the same
category of risk as every other "do not reproduce live" bug in this
document, just with process-level rather than request-level blast radius.

Two further, lower-severity bugs in the same file, also not reproduced live:
- `GET /` and `GET /for/:wid`: `catch (err) { return err }` — the caught
  error is `return`ed from the async handler, which Express ignores; no
  `res.send`/`.status` is ever called on the error path, so any upstream
  failure on these two routes hangs the request with no response.

**MUST VERIFY IN PROD:**
- [ ] **Urgent.** Check logs/monitoring for `req.query is not a function` or
      for unexplained process restarts correlated with `/badgeDetail`
      traffic — if this route receives any real traffic, it is very likely
      crashing whatever Node process serves it on every single call.
- [ ] Confirm whether `GET /` or `GET /for/:wid` (badge listing endpoints)
      have ever appeared to hang for callers during an upstream badges
      service outage.

---

### AC. `res.send(count)` where `count` is a number silently corrupts the response — found independently in two sibling files

Found separately in `userDataMigration.ts`'s and `forgotPassword.ts`'s
`POST /reset/proxy/password` (both files implement the same forgot-password
flow, apparently duplicated rather than shared):

```ts
res.status(302).send(searchresponse.data.result.response.count)
```

`count` is a JavaScript `number` (typically `0`, for "no matching user
found"). Express's `res.send(body)` has a **deprecated overload**: when
`body` is a `Number`, it is treated as a **status code**, not response
content — `res.send(0)` attempts to overwrite the already-set `302` with
status `0`. `0` is not a valid HTTP status code, so Node's
`ServerResponse.writeHead` throws `RangeError: Invalid status code: 0`.
Confirmed empirically (both by an isolated Node/Express/supertest probe, and
live in both files' test suites):

```
$ node -e "... res.status(302).send(0) ..."
THREW: Invalid status code: 0
```

Because this throw happens **synchronously inside the route's own
`try` block**, it IS caught by that route's `catch`, which sends the
generic 500 fallback instead of the intended 302 — this degrades gracefully
rather than hanging, and both files' tests exercise the real (500, not 302)
behavior live.

A further wrinkle, confirmed in `forgotPassword.ts` specifically: the failed
`res.send(0)` call leaves `Content-Type: text/plain` set (Express's legacy
numeric-body path calls `this.type('txt')` before throwing), and the catch
block's later `res.status(500).send({...})` does not override an
already-set Content-Type. So the 500 body IS valid JSON on the wire, but is
served as `text/plain` — any client that gates JSON parsing on Content-Type
sees what looks like an empty/unparseable body.

**MUST VERIFY IN PROD:**
- [ ] Confirm the "forgot password, user not found" flow in both
      `userDataMigration.ts` and `forgotPassword.ts` doesn't rely on the
      apparently-intended `302` response — it has never actually been sent
      due to this bug.
- [ ] Confirm frontend clients hitting this path don't require
      `Content-Type: application/json` to parse the 500 fallback body.

---

### AD. `tnnmcAuth.ts` (v1) has the same Keycloak-empty-data double-send bug as its v2 sibling (change T)

Same shape as change T (`tnnmcAuthV2.ts`): `authTokenResponse.data` falsy
triggers `res.status(302).json({...})` with no `return`, and execution
falls through to an unconditional trailing `res.status(200).json({message:
'success'})`. Confirmed by reading `tnnmcAuth.ts` directly; not reproduced
live (same reasoning as change T).

**MUST VERIFY IN PROD:** same item as change T, for the v1 TNNMC login
route.

---

### AE. `user/content.ts` — `GET /like/contents` double-sends on an empty liked-ids list

```ts
if (!Array.isArray(likedIds) || !likedIds.length) {
  res.send([])     // <-- NO `return`
}
const response = await getMultipleContent(likedIds, rootOrg, org, extractUserIdFromRequest(req))
...
res.json(result)
```

Same unreturned-response family as the other double-send bugs in this
document. When the upstream liked-ids list is empty (e.g. a brand-new user
with no likes yet — a plausible, ordinary case, not an edge case), execution
falls through into `getMultipleContent([], ...)` and then sends a second
response via `res.json(result)`. Confirmed by reading the code; not
reproduced live (every `/like/contents` test uses a non-empty liked-ids
array, per the campaign's standing safety rule).

Separately in the same file: `fetchLikedIdsResponse`'s catch does
`throw new Error(e)`, discarding the original axios error's `.response`
(status/body) and producing a plain `Error` with a stringified message
instead. Every caller of this helper (`GET /like`, `GET /like/contents`)
therefore always falls back to the generic 500, even when upstream returned
a specific, meaningful 4xx — that status/body can never reach the client.
This one IS safe to test live (single response either way) and is exercised
in `user/content.test.ts`.

**MUST VERIFY IN PROD:**
- [ ] Confirm whether `GET /like/contents` for a user with zero likes
      currently double-sends/crashes, or whether some Express/Node-version
      behavior masks it — brand-new users are exactly the population most
      likely to hit this.
- [ ] Confirm no client depends on distinguishing specific upstream error
      codes (e.g. 404 vs 409) from `/like`/`/like/contents` — they currently
      cannot, due to the discarded `.response`.

---

### AF. `cohorts.ts` — minor: trailing space in an endpoint URL, and a swallowed-error path reported as 200

- `groupCohorts: (groupId) => \`${CONSTANTS.USER_PROFILE_API_BASE}/groups/${groupId}/users \`` has a trailing space baked into the template literal, confirmed live (the exact URL requested has a trailing space). Worth checking whether a downstream service rejects or mis-routes this (or silently `%20`-encodes it).
- `getAuthorsDetails` wraps its entire body (hierarchy fetch, `JSON.parse` of `creatorDetails`, and a search-registry POST) in one try/catch that returns `false` on any failure rather than propagating; the route then responds `200` with body `false` — a genuine upstream failure on this path is indistinguishable from "no authors" to the client. Confirmed live (safe to test — single response either way).

**MUST VERIFY IN PROD:**
- [ ] Confirm the trailing-space URL is intentional/harmless for the
      `groupCohorts` upstream, or fix it.
- [ ] Confirm callers of the authors-cohort path don't treat a `200` with
      body `false` as "successfully found no authors" when it may actually
      mean "the lookup failed."

---

### AG. `authoring/content/index.ts` — six routes can crash the process on a transport-level (not HTTP-error) upstream failure

```ts
.catch((error) => {
  res.status(error.response.status).send(error.response.data)
})
```

Six routes (`/copy`, `/encode`, `POST /content/v3/create`,
`GET /content/v3/read/:id`, `POST /content/v3/update/:id`, and the
catch-all `authApi.all('*', ...)`) end their axios chain with this pattern —
unguarded, unlike the safe `(err && err.response && err.response.status) ||
500` fallback used elsewhere in this codebase (including the sibling file
`protectedApi_v8/content.ts`). A transport-level failure (DNS, connection
refused, timeout — anything with no `.response`, i.e. exactly what
`networkError()` in this campaign's test helpers models) throws **inside
the `.catch` callback itself**. Since nothing awaits/returns this promise
chain further up, that throw becomes an unhandled promise rejection — which
can terminate the Node process on Node ≥15, the same severity class as
change AB (`badge.ts`). Confirmed by reading the code; not reproduced live
in `authoring/content/index.test.ts` (every failure-path test there uses
`upstreamError()`, which sets `.response`, specifically to stay off this
throw).

A related, narrower issue in `GET /content/v3/read/:id`:
`response.data.params.status` is read with no check that `params` exists.
An upstream 2xx response missing `params` throws inside the success `.then`,
which the same unguarded `.catch` above then tries to handle — throwing a
**second** time on the resulting plain `TypeError` (which also has no
`.response`), with nothing left to catch it.

Lower-severity, same file:
- `POST /encode`: `body.location.split('/')` throws synchronously on a
  missing `location` — not dangerous (Express's synchronous-handler wrapping
  catches it, verified live, returns a safe 500), but produces an unhelpful
  generic 500 instead of a validated 400.
- `POST /upload/s3` and `POST /download/s3`: both handlers have **no
  try/catch anywhere in the body**; a rejection from `uploadJSONData`/
  `readJSONData` (awaited inside a `for...of` loop) becomes an unhandled
  promise rejection, same as change AA's `navigator.ts` routes. Only the
  success paths are exercised live for these two.

**MUST VERIFY IN PROD:**
- [ ] **Elevated priority** (same class as AB): confirm these six routes,
      the two S3 upload/download routes, and `navigator.ts`'s six no-try/catch
      routes (change AA) all have upstream retry/circuit-breaker protection,
      or check logs for unexplained process restarts correlated with this
      file's traffic — a genuine network-level failure (not just an HTTP
      error status) against any of them is a plausible process-crash trigger.
- [ ] Confirm the content-read upstream (`GET /content/v3/read/:id`) always
      includes `params` in its 2xx response body.

---

### AH. `tnaiAuth.ts` has the same Keycloak-empty-data double-send bug as changes T/AD

Same shape as changes T (`tnnmcAuthV2.ts`) and AD (`tnnmcAuth.ts`): the
`authTokenResponse.data` falsy `else` branch does
`res.status(302).json({...})` with no `return`, and it's the last statement
in the enclosing try block — control falls out to an unconditional trailing
`res.status(200).json({message: 'success', resRedirectUrl})`. Confirmed by
tracing brace structure exactly; not reproduced live (same reasoning as T).
Notably, the sibling file `maharastraNursingCouncilAuth.ts` (also audited
this session) does **not** have this bug — its equivalent branch correctly
`return`s — confirming this is a per-file copy/paste defect, not something
inherent to the shared pattern.

**MUST VERIFY IN PROD:** same item as change T, for `tnaiAuth.ts`'s login
route.

---

### AI. `frac.ts` — a `switch` `default` case double-sends via `break` instead of `return`

```ts
switch (type) {
  case 'dictionary': apiEndPoint = ...; break
  ...
  default:
    res.status(400).send('TYPE_IS_NOT_PROVIDED_OR_TYPE_IS_NOT_CONFIGURED')
    break        // <-- only exits the switch, not the handler
}
// apiEndPoint is still '' here for the default case
const response = await axios.get(apiEndPoint, {...})
res.status(response.status).send(response.data)
```

A new variant of the recurring unreturned-response bug: this one is a
`switch` statement rather than an `if`, and `break` (which only exits the
`switch`) is mistaken for a handler-level early-exit. For an unrecognised
`:type` in `GET /getAllNodes/:type`, execution falls through to the shared
axios call and a second `res.send()` — throwing `ERR_HTTP_HEADERS_SENT`
inside the `try`, which the route's own `catch` then also tries to respond
to a third time (itself throwing, uncaught, since nothing wraps the async
handler). Confirmed by reading the code; not reproduced live.

**MUST VERIFY IN PROD:**
- [ ] Confirm what actually happens when `GET
      /protectedApi/v8/frac/getAllNodes/<invalid-type>` is hit in production
      — hung connection, crash, or a benign double-send warning — and add a
      `return` after the default case's `res.send()`.

---

### AJ. `assessmentSubmitHelper.ts`'s `assessmentCreator` returns `undefined` (not its normal `{data, message, status}` shape) when the assessment artifact has no questions

```ts
if (assessmentQuestions) {
  // ... the ENTIRE submit/score/Cassandra-log/content-update flow ...
  return statusMessage
}
// implicitly falls off the end here, returning `undefined`, if
// assessmentQuestions is falsy
```

`fetchAssessment()` returns `undefined` whenever the fetched artifact JSON
has no `questions` field (or the fetch itself fails — its own try/catch
swallows errors and returns `undefined`). Every other path through
`assessmentCreator` returns a `{ data, message, status }` object; this one
silently returns `undefined` instead. Confirmed live in
`src/utils/assessmentSubmitHelper.test.ts` (safe to test — no hang, no
crash, just an inconsistent return contract).

**MUST VERIFY IN PROD:**
- [ ] Confirm every caller of `assessmentCreator` handles an `undefined`
      return value gracefully (e.g. doesn't do `result.status` unguarded) —
      a malformed or temporarily-unreachable assessment artifact URL is a
      plausible real-world trigger for this path.

---

### AK. `signup.ts` — `POST /` runs its core logic entirely outside effective try/catch protection, with a near-guaranteed double-send on the single most common real-world input

Personally verified by reading the full file (not just the test report) — this
is among the most severely buggy files found this session.

```ts
signup.post('/', async (req, res) => {
  try {
    ...
    checkUniqueKey(signupReq.uniqueId, async (err, resp) => {
      // <-- everything in this callback body runs OUTSIDE the try's
      //     effective protection: checkUniqueKey() is fire-and-forget
      //     (not awaited, not a Promise), so the outer try block has
      //     already finished executing and returned by the time this
      //     callback actually fires (asynchronously, via the Cassandra
      //     driver's own I/O callback). A throw in here is NOT caught by
      //     the enclosing `catch (err)` below — it's an unhandled
      //     exception in a foreign callback context.
      ...
      createKeycloak = await createKeycloakUser(req)
        .catch((error) => {
          if (error.response.status === 409) {           // unguarded .response
            res.status(400).send(`1005: User with email ${signupReq.email} is already registered !!`)
          }
          res.status(400).send('1003: ...')                // <-- NO return/else — ALWAYS also runs
        })
      ...
    })
  } catch (err) { ... }
})
```

Two compounding defects:

1. **The whole `checkUniqueKey` callback executes outside effective
   try/catch protection.** `checkUniqueKey` is a callback-style (not
   Promise-based) helper — it's called without `await` and returns
   immediately, so the surrounding `try` block finishes and the async
   handler effectively completes before the callback body ever runs. Any
   exception thrown later, when the callback actually fires, is not
   observed by the `catch (err)` below it at all.

2. **Inside that callback, the 409 branch (duplicate email — an everyday,
   expected occurrence, not an edge case) has no `return`/`else`**: on a
   409, it sends the `1005` message, then unconditionally sends the `1003`
   message immediately after — a **guaranteed** double-send on the single
   most common real-world failure mode of a signup endpoint (someone
   re-submitting, or two tabs open). Since this is a synchronous
   back-to-back `res.send()` pair with no async gap, `ERR_HTTP_HEADERS_SENT`
   fires deterministically — and per defect 1, nothing catches it.

A third instance of the same shape one level deeper: the nested
`updateUniqueKey(signupReq.uniqueId, async (error, response) => {...})`
callback (itself unprotected, for the same reason as #1) does
`UpdateKeycloakUserPassword(id, false).catch((_err) => { res.status(400).send(...) })`
with no `return`, immediately followed by an unconditional
`res.json(createKeycloak || {})` — a double-send whenever the default
password can't be set.

A fourth, narrower issue: `if (!resp.active) { res.status(400).send(...) }`
(no `return`) still falls through into a **real** `createKeycloakUser(req)`
call for an already-used signup code — potentially creating a Keycloak user
that shouldn't exist, in addition to risking a further double-send if that
call also succeeds.

None of this is reproduced live in `signup.test.ts` — every dangerous branch
here is exactly the kind of input (duplicate email, failed password set)
this campaign's safety rule requires skipping.

**MUST VERIFY IN PROD — elevated priority:**
- [ ] **This is very likely already happening in production.** Check
      signup-related error logs/alerts for `ERR_HTTP_HEADERS_SENT` or
      unhandled-rejection crashes correlated with duplicate-email signup
      attempts (a 409 from Keycloak user creation) — this is not a rare edge
      case, it's the expected response to a common user action (double
      submission, retry, or an already-registered user attempting signup).
- [ ] Confirm whether `POST /` has any retry/circuit-breaker protection at
      the infrastructure level that might be masking process crashes from
      this pattern.

---

### AL. `signup.ts` — `POST /create/:uniqueId` triple-sends when the unique-code lookup fails

```ts
const result = await checkUUIDMaster(req.params.uniqueId)
  .catch((err) => {
    logInfo(...)
    res.json({ msg: `1001: Invalid Code ${req.params.uniqueId}` })   // 1st send
  })
if (result) {
  ...
} else {
  // result is `undefined` here whenever the .catch above ran, since that
  // handler doesn't return anything — so this branch is ALSO taken
  res.status(400).send({ msg: `Could not process the request...` })  // 2nd send
}
```

Unlike `POST /`, this route's logic IS inside the outer try/catch (no
fire-and-forget callback here), so the resulting `ERR_HTTP_HEADERS_SENT`
from the 2nd send above is actually caught — by the route's own
`catch (err)` block, which then attempts a **3rd** `res.status(...).send(...)`
call, which itself throws (uncaught this time — nothing wraps the catch
block). Triggered by an invalid/expired signup code, an ordinary user input.
Not reproduced live.

**MUST VERIFY IN PROD:**
- [ ] Same as change AK: check logs for `ERR_HTTP_HEADERS_SENT` around
      `POST /create/:uniqueId` correlated with invalid/expired codes.

---

### AM. `entityCompetency.ts` — all five routes use the upstream's `responseCode` field directly as the HTTP status code

```ts
const response = await axios({ ... })
res.status(response.data.responseCode).send(response.data)
```

Every route in this file (`/addUpdateEntity`, `/addEntityRelation`,
`/getEntityById/:id`, `/getAllEntity`, `/addEntities`, `/reviewEntity`)
passes the upstream's own `responseCode` field straight into `res.status()`.
Sunbird-family upstream APIs conventionally return `responseCode` as a
**string** (e.g. `"OK"`), not a numeric HTTP status. Confirmed empirically:

```
$ node -e "... res.status('OK').send({ok:true}) ..."
THREW: Invalid status code: OK
```

Unlike most double-send bugs in this document, this one **is safely caught**
by the route's own try/catch (the throw happens inside the same statement,
inside the try block) — so it degrades to the generic 500 fallback rather
than crashing. The practical effect: a **genuinely successful** upstream
call, if it returns the realistic string-shaped `responseCode`, is reported
to the client as a 500 failure instead of forwarding the real success data.
Confirmed live in `entityCompetency.test.ts` (safe to test — single response
either way).

**MUST VERIFY IN PROD:**
- [ ] Confirm what shape `responseCode` actually takes from the
      `ENTITY_API_BASE` upstream today — if it's ever a string (the Sunbird
      convention), every one of these six routes has likely always reported
      500 on success, and any client depending on this API may have never
      seen a real success response.

---

### AN. `assessment.ts` — both routes double-send on missing-required-field validation

Same unreturned-response family, both routes:

- **`POST /submit/v2`**: three sequential checks
  (`!req.body.artifactUrl`/`!req.body.courseId`/`!req.body.batchId`), each
  `res.status(400).json(...)` with no `return`. If any fires while
  `org`/`rootOrg` headers are present, execution reaches the final
  `res.status(assessmentSubmitStatus.status).json(...)` — a second send.
- **`POST /get`**: `if (!req.body.artifactUrl) { res.status(400).json(...) }`
  (no `return`) falls through to `fetchAssessment(undefined)`, then
  `getFormatedResponse(undefined)`, which does `JSON.stringify(data.questions)`
  on `undefined` — a synchronous `TypeError`, caught by the route's own
  catch, whose own response attempt then ALSO throws (headers already sent)
  — this second throw is uncaught, an unhandled promise rejection.

Neither is reproduced live (per the standing safety rule); confirmed by
reading the code.

**MUST VERIFY IN PROD:**
- [ ] Send `POST /submit/v2` with `org`/`rootOrg` present but `artifactUrl`
      missing — confirm the client only receives the first (400) response
      and check for unhandled-rejection log noise.
- [ ] Send `POST /get` with no `artifactUrl` — same check.

---

### AO. `authContent.ts` registers two new `proxyCreator` listeners on EVERY request, never removed

```ts
const proxyCreator = createProxyServer()   // module-level singleton
authContent.all('*', async (req, res) => {
  ...
  proxyCreator.on('error', (err) => { ... })
  proxyCreator.on('unhandledRejection', () => { ... })
})
```

`proxyCreator` is created once at module load and shared across every
request through this router, but `.on('error', ...)` and
`.on('unhandledRejection', ...)` are called **inside** the request handler
— so every single request that passes through here adds two more listeners
that are never removed. Node's default `EventEmitter` warns past 10
listeners for a given event (`MaxListenersExceededWarning`) and this will
keep growing unbounded for the life of the process — both a memory leak and,
once triggered, a duplicated-response risk (every accumulated `'error'`
listener would fire and attempt its own `res.writeHead(500)` on the SAME
`res` for a later, unrelated request that happens to hit a proxy error,
since these closures capture whichever `res` was in scope when each was
registered — though since each closure captures its own `res`, they'd only
double-act on requests they were originally registered for, not
cross-contaminate other requests' `res` objects; the growth itself and the
listener-limit warning are the concrete, confirmed problem).

Confirmed live: `authContent.test.ts` asserts exactly 2 new listener
registrations per request, growing without bound across repeated requests.

**MUST VERIFY IN PROD:**
- [ ] Check logs for `MaxListenersExceededWarning` correlated with
      `authContent`/content-proxy traffic — if present, this confirms the
      leak is active and growing in production.
- [ ] Move both `.on(...)` registrations to module scope (once, outside the
      request handler) as the straightforward fix, once verified safe to
      change.

---

### AP. `userDeactivation.ts` — the deactivation flow hangs on its own default failure mode, and silently corrupts the role-removal request with an un-awaited Promise

Two real bugs, found and independently significant given this is a
security-relevant (account deactivation) flow:

1. **Pattern B zero-response, and it's the DEFAULT failure path, not an edge
   case:**
   ```ts
   if (profileUpdateStatus && roleUpdateStatus) {
     res.status(200).json({ message: 'User deactivated successfully' })
   }
   // no else — nothing sent if either helper resolved false
   ```
   `updateNullProfileDetails` and `updateUserRoles` both wrap their entire
   bodies in try/catch and resolve `false` on **any** failure (a rejected
   axios call, a non-success upstream response, an unexpected shape) — they
   never throw. So whenever either one fails for any reason — which is the
   realistic behavior for any upstream hiccup — this `if` is skipped, the
   outer catch never fires either (nothing threw), and the client's
   deactivation request hangs forever. This is the primary failure mode of
   the entire flow, not a rare edge case. Not reproduced live (would hang
   the test runner).

2. **Missing `await` corrupts the role-removal request body:**
   ```ts
   const userOrgDetails = userDetails(userId)   // userDetails is async — missing await
   // ...later, embedded directly into the assign/role request body:
   organisationId: userOrgDetails
   ```
   `userOrgDetails` is a pending `Promise` object, not the resolved
   organisation id — so the upstream role-removal call receives a `Promise`
   object serialized into its request body as `organisationId`, not a real
   ID. This IS safe to test live (`userDetails`'s own try/catch means it
   never rejects) and is confirmed in `userDeactivation.test.ts`
   (`config.data.request.organisationId instanceof Promise`).

**MUST VERIFY IN PROD — elevated priority (security-relevant flow):**
- [ ] Confirm whether deactivation requests against the real backend have
      ever appeared to hang/time out client-side — the missing-`else`
      pattern above means this happens whenever anything about the
      downstream update isn't a clean success.
- [ ] Confirm whether role removal during deactivation has been silently
      targeting the wrong (or no) organisation due to the un-awaited
      `userDetails(userId)` call — this could mean deactivated users retain
      roles in their actual organisation that were never actually removed.

---

### AQ. `user/exercise.ts` — `POST /createContentDirectory/:contentId` never completes its response on success

```ts
const response = await axios.post(API_END_POINTS.createContentDirectory(contentId), req.body, axiosRequestConfig)
res.status(response.status)
// no .send()/.json()/.end() — the response object is never finished
```

`res.status(x)` only sets the status code and returns `res` for chaining —
it does not send or end the response. Every successful call to this route
hangs forever; only the failure path (the `catch` block, which does call
`.send()`) ever completes. Confirmed by reading the code and by the fact
that a live test of the success path would itself hang (not attempted, per
the standing safety rule). Not reproduced live.

A second, narrower issue in the same file: `POST
/uploadFileToContentDirectory/:contentId` uses `form-data`'s `.submit(url,
(err, response) => {...})` callback, which reads `response.statusCode`
**before** checking whether `err` is set. If the submit itself fails at the
transport level (`err` truthy, `response` undefined), this throws inside a
plain callback with no surrounding try/catch (the outer try only protects
the synchronous setup code before `.submit()` runs) — very likely an
uncaught exception at the process level. Not reproduced live.

**MUST VERIFY IN PROD:**
- [ ] Confirm whether `POST /createContentDirectory/:contentId` has ever
      appeared to hang for callers on a successful upstream call — this
      would be the case on literally every success, not an edge case.
- [ ] Confirm whether `POST /uploadFileToContentDirectory/:contentId` has
      correlated with any unexplained process crashes/restarts.

---

### AR. `publicCertifcateFlinkv2.ts` — CRITICAL: the certificate-download secret-key check does not block the request; likely CQL injection too

**This is the most severe finding in this entire campaign — a real
authentication bypass on a public, unauthenticated (except for a shared
secret key) certificate-download endpoint.**

```ts
publicCertificateFlinkv2.get('/download', async (req, res) => {
  const userid = req.query.userid
  const courseid = req.query.courseid
  const secretKey = req.query.secretKey

  if (!(userid || courseid || secretKey)) {
    res.status(400).json({ msg: '...', status: 'error', status_code: 400 })
  }
  const certificateKey = CONSTANTS.CERTIFICATE_DOWNLOAD_KEY
  if (certificateKey !== secretKey) {
    res.status(400).json({ msg: 'Invalid certificate download key', status: 'error', status_code: 400 })
  }
  // NEITHER check above has a `return` — execution continues regardless:
  const client = new cassandra.Client({...})
  const query = `SELECT ... FROM sunbird_courses.user_enrolments WHERE userid='${userid}' AND courseid='${courseid}'`
  const certificateData = await client.execute(query)
  ...
  // eventually renders and serves the actual certificate image
```

Three compounding defects, confirmed by reading the code directly:

1. **The secret-key check is decorative, not enforcing.** `res.status(400)`
   is sent when the key is wrong, but with no `return`, so the handler
   proceeds to the real Cassandra lookup, the real certificate-download call,
   and the real image render — and serves the actual certificate at the end
   regardless of whether the key check passed. **Anyone who knows or guesses
   a `userid`/`courseid` pair can download that user's certificate without
   ever supplying a valid `secretKey`.**
2. **The "missing parameters" check uses OR, not AND**:
   `!(userid || courseid || secretKey)` only rejects when **all three** are
   absent — a request with only a `secretKey` and no `userid`/`courseid`
   (or any other partial combination) sails through this check too.
3. **Likely CQL injection**: `userid` and `courseid` are raw,
   attacker-controlled query-string values interpolated directly into a CQL
   query string with no parameterization (`client.execute(query)` — a single
   string, not the parameterized `client.execute(query, params, {prepare:
   true})` form used correctly elsewhere in this codebase, e.g.
   `keycloak-user-creation.ts`). A crafted `userid`/`courseid` value could
   plausibly manipulate the query.

A fourth, lower-severity instance of the same missing-`return` pattern:
`if (!certificateData) { res.status(400)... }` also has no `return`.

**Because of defect 1, there is no safe way to exercise the "wrong
secretKey" input live** — it doesn't stop at a clean 400, it falls through
into the complete real flow (Cassandra query → certificate download →
`node-html-to-image` render → `res.writeHead()`/`res.end()`), and when that
flow completes, calling `writeHead()`/`end()` on an already-finished
response throws, cascading into the same double/triple-send crash pattern
documented throughout this file. `publicCertifcateFlinkv2.test.ts`
therefore only exercises the correct-secretKey path live.

**MUST VERIFY IN PROD — urgent, security-critical:**
- [ ] **Treat this as a live vulnerability until confirmed otherwise.**
      Determine whether this endpoint is internet-reachable and, if so,
      whether certificate data for arbitrary users has been accessible
      without the intended secret key.
- [ ] Confirm whether `userid`/`courseid` have ever been observed containing
      CQL special characters (quotes, etc.) in access logs — evidence of
      injection attempts or accidental corruption.
- [ ] If this endpoint is live, consider taking it offline or adding a
      request-level guard (e.g. at the reverse proxy) until the missing
      `return`s and query parameterization are fixed and deployed.

---

### AS. `user/dashboard.ts` — `GET /analytics/progress/:contentType` has no try/catch at all

```ts
dashboardApi.get('/analytics/progress/:contentType', async (req, res) => {
  ...
  const response = await axios.get(`${apiEndpoints.analytics}/api/userprogress?${queryParams}`, {...})
  res.send(response.data)
})
```

Unlike the other three routes in this file (each of which wraps its axios
call in a try/catch with a 500 fallback), this one has none. An upstream
rejection (4xx/5xx, timeout, DNS failure) becomes an unhandled promise
rejection — no response is ever sent, and the client hangs indefinitely
rather than getting a clean error. Confirmed by reading the code; not
reproduced live (only the success path is tested for this route).

**MUST VERIFY IN PROD:**
- [ ] Check gateway/load-balancer logs for long-running or timed-out
      requests to `GET /.../user/dashboard/analytics/progress/:contentType`
      — a correlated pattern would confirm this is already happening.

---

### AT. `certificateValidate.ts` — `POST /validate` double-sends on either missing field, not just when both are missing

```ts
validateCertificate.post('/validate', async (req, res) => {
    try {
        if (!req.body.accessCode) {
            res.status(400).json({ msg: 'AccessCode. can not be empty', ... })
        }
        if (!req.body.certId) {
            res.status(400).json({ msg: 'certId. can not be empty', ... })
        }
        const { accessCode, certId} = req.body
        const response = await axios({ ... })   // runs regardless of which check fired
        ...
        res.status(response.status).send(result)
```

Same missing-`return` family as changes Q/R/S/T/V/Z/AD/AE/AH/AN. Both validation
checks are independent `if` blocks with no `return`, and the real `axios` call
that follows is unconditional — so a request missing `accessCode`, or missing
`certId`, or missing both, all fall through into the same upstream call and
its subsequent `res.status(...).send(...)`, producing a second (or third)
send on an already-completed response. Unlike most double-send bugs in this
campaign, there is **no safe missing-field input** to exercise live here —
every combination cascades. `certificateValidate.test.ts` therefore supplies
both `accessCode` and `certId` in every test.

This is a public certificate-*validation* endpoint (not the download endpoint
in change AR) — there is no secret/auth key involved, so this is a
crash/double-send risk, not an authorization bypass.

**MUST VERIFY IN PROD:**
- [ ] Check application logs for `ERR_HTTP_HEADERS_SENT` (or equivalent)
      originating from this route — evidence this is already firing on
      malformed requests.

---

### AU. `appCertificateDownload.ts` — `GET /download` has the same missing-`return` double-send, and no secret-key mechanism at all

```ts
appCertificateDownload.get('/download', async (req, res) => {
  try {
    const certificateId = req.query.certificateId
    if (!certificateId) {
      res.status(400).json({ msg: 'Certificate ID can not be empty', ... })
    }
    const response = await axios({ ... })   // runs regardless
```

Same missing-`return` pattern as change AT: `if (!certificateId)` sends a 400
but does not stop execution, so a request with no `certificateId` falls
through into a real (undefined-id) upstream call and a second send once it
resolves. Not reproduced live; every test supplies a `certificateId`.

Separately, and only noted for awareness rather than confirmed as a bug: this
route's rendering logic is structurally identical to
`publicCertifcateFlinkv2.ts` (change AR — same SVG width/height parsing, same
`node-html-to-image` call, same response pattern), but unlike that file, this
one has **no secret-key check whatsoever** — the only gate on serving a
certificate image is that `certificateId` is non-empty. This may be
intentional (the `certificateId` itself may function as an unguessable
capability token by design), but given change AR turned out to be a genuine
auth bypass, this is worth an explicit product/security decision rather than
an assumption.

**MUST VERIFY IN PROD:**
- [ ] Check application logs for `ERR_HTTP_HEADERS_SENT` (or equivalent)
      originating from this route.
- [ ] Confirm with product/security whether `certificateId` is intended to be
      the sole access control for this endpoint, or whether a secret-key
      check (like AR's, once fixed) was meant to apply here too.

---

### AV. `bulkUserSsoMapping.ts` — quadratic redundant upstream calls, a response field that is always empty, and a response sent before any per-row lookup completes

```ts
for (let i = 1; i < lines.length; i++) {
    ...
    result.push(obj)
    result.forEach(async (csvElement) => {   // <-- re-iterates ALL rows so far, every row
        ...
        const userSearch = await axios({ ...url: API_ENDPOINTS.kongUserSearch })
        ...
    })
}
...
if (result.length > 0) {
    _res.status(200).send({
        message: 'Bulk Upload is Completed ! ',
        status : 'success',
        successUserIds : createdUserId,   // <-- declared as [], never pushed to
    })
}
```

Three defects, none of them a hang/crash/security bypass, all confirmed by
reading the code:

1. **Quadratic redundant upstream calls.** The `result.forEach(...)` that
   fires a Kong `/user/v1/search` lookup per row is placed *inside* the outer
   `for` loop instead of after it. Each time a new row is parsed and pushed,
   the code re-iterates the *entire* `result` array accumulated so far,
   re-triggering a search for every previously processed row again. For an
   `n`-row CSV this issues `n(n+1)/2` upstream calls instead of `n` — e.g. a
   100-row file fires ~5,050 Kong search requests instead of 100.
2. **`successUserIds` is always `[]`.** `createdUserId` is declared once as
   an empty array and returned verbatim in the response; nothing in the
   handler ever pushes to it, regardless of how many per-row lookups actually
   resolved to a real user. Any caller relying on this field to know which
   rows succeeded gets no information.
3. **The HTTP response does not wait on any per-row lookup.** `res.status(200)`
   is sent synchronously right after the parsing loop, based only on
   `result.length` (i.e. "did the CSV have any data rows"), never on whether
   any Kong search actually found/mapped a user. Each per-row lookup has its
   own try/catch, so a failure is logged, not unhandled — this is a
   "success" being reported independent of actual mapping outcome, not a
   crash risk.

All three were safe to exercise live and are covered in
`bulkUserSsoMapping.test.ts` (using small 1-2 row fixtures to avoid
amplifying defect 1 in CI).

**MUST VERIFY IN PROD:**
- [ ] Check Kong's request volume/rate-limit logs for this search endpoint
      against actual bulk-SSO-mapping CSV sizes — confirm whether the
      quadratic amplification has caused throttling or elevated load on
      larger uploads.
- [ ] Confirm no downstream consumer depends on `successUserIds` being
      populated with actual mapped user IDs.

---

### AW. `catalog.ts` — `POST /tags` hangs forever if `rootorg` is sent as a repeated header

```ts
catalogApi.post('/tags', async (req, res) => {
  try {
    const userId = extractUserIdFromRequest(req)
    const rootOrg = req.headers.rootorg
    if (!rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const { tags, type } = req.body
    if (typeof rootOrg === 'string') {
      ... // the entire real logic, including every res.send/res.status, lives in here
    }
    // no else — if rootOrg is truthy but NOT a string, execution falls off the
    // end of the try block having sent nothing at all
  } catch (err) { ... }
})
```

`req.headers.rootorg` is typed `string | string[] | undefined` — Node/Express
represents a header as a `string[]` when the client sends it more than once
on the wire. The handler correctly rejects a missing `rootorg` (with a
`return`), but the entire success path is gated behind `typeof rootOrg ===
'string'` with no `else`. A request whose `rootorg` header arrives as an
array (truthy, so it passes the first check, but not a string) falls through
the `if` with no response ever sent — the request hangs indefinitely. This
is Pattern B (zero response), not a crash or auth bypass. Confirmed by
reading the code; not reproduced live, since doing so would hang the Jest
worker.

**MUST VERIFY IN PROD:**
- [ ] Confirm whether any client, load balancer, or reverse proxy in front of
      this service can ever forward `rootorg` as a repeated header (arrays
      are also directly reachable via a raw HTTP client sending the header
      twice, not just proxy behavior) — a correlated pattern of hung
      `POST .../catalog/tags` requests would confirm this is already
      happening.

---

### AX. `user/auto-complete.ts` — two independent bugs: `POST /department/:query` hangs on any upstream failure, and `GET /:query` never forwards the real upstream error body due to a typo

```ts
autocompleteApi.post('/department/:query', async (req, res) => {
  ...
  try {
    ...
    const response = await axios.post(url, req.body, { ... })
    res.send(response.data)
  } catch (err) {
    return err                     // <-- Pattern B: no res.send/status at all
  }
})

autocompleteApi.get('/:query', async (req, res) => {
  ...
  try {
    ...
  } catch (err) {
    res.status((err && err.response && err.response.status) || 500)
      .send((err && err.reponse && err.response.data) || {   // <-- typo: "err.reponse"
        error: 'Failed due to unknown reason',
      })
  }
})
```

Two independent, unrelated defects:

1. **`POST /department/:query` — Pattern B (zero response / hang).** The
   catch block does `return err`, which returns a value from the Express
   handler function itself — Express ignores that return value entirely.
   No `res.send`/`res.status`/`res.end` is ever called on a rejection from
   the `usersByDepartment` upstream call, so the client's request hangs
   until it times out. Every other route in this file (and every sibling
   file) uses the standard `res.status(...).send(...)` fallback; this one
   route is missing it entirely. Not reproduced live — doing so would hang
   the Jest worker.
2. **`GET /:query` — typo silently drops the real upstream error body.**
   `err.reponse` (missing the `s` in "response") is not a property that
   exists on any error object, so `err && err.reponse && ...` is always
   `false`. The status code is still forwarded correctly (via the
   correctly-spelled `err.response.status` a few lines above), but the
   body always falls back to the generic `{ error: 'Failed due to unknown
   reason' }` — the actual upstream error details in `err.response.data`
   are silently discarded. This is safe to test live (no hang/crash) and
   is confirmed in the test suite: an upstream 502 with a real error body
   still yields status 502 but the generic body, not the upstream's actual
   message.

**MUST VERIFY IN PROD:**
- [ ] Check application/gateway logs for hung or timed-out requests to
      `POST .../user/autocomplete/department/:query` — evidence defect 1 is
      already occurring on upstream failures.
- [ ] Confirm whether any caller of `GET .../user/autocomplete/:query`
      depends on the real upstream error message (defect 2) for
      diagnostics or user-facing messaging, since they've only ever
      received the generic fallback.

---

### AY. `rolePermission.ts` — `setRolesData` is called fire-and-forget from `getCurrentUserRoles`, used by ~11 auth flows

```ts
export const setRolesData = async (reqObj: any, body: any) => {
  const userData: any = body
  const userId = userData.result.response.id   // <-- throws if `result`/`response` is missing
  if (reqObj.session) {
    ...
    reqObj.session.save((error: any) => { ... })
  }
}

export const getCurrentUserRoles = async (reqObj: any, accessToken: any) => {
  ...
  const authTokenResponse = await axios({ ... })   // no try/catch around this call either
  if (authTokenResponse) {
    setRolesData(reqObj, authTokenResponse.data)   // <-- not awaited, no .catch
  }
}
```

`setRolesData(reqObj, authTokenResponse.data)` is called without `await` or
`.catch()`. If it throws — e.g. the upstream `/user/v2/read/:userId` response
doesn't have the exact `result.response` shape expected (line 29), or
`reqObj.session.save` isn't a function for some session-store edge case —
the resulting rejection is never handled by `getCurrentUserRoles`, and
because the call isn't awaited, no caller's own try/catch can catch it
either (the rejection surfaces asynchronously, after `getCurrentUserRoles`
has already returned). This was actually reproduced by accident while
writing the test suite: an unawaited `setRolesData` rejection crashed the
Jest worker process outright.

**In production this is not a process-crash risk** — `src/index.ts:30-38`
registers a global `process.on('unhandledRejection', ...)` handler that logs
the rejection rather than letting Node's default "exit the process"
behavior take over (that default is what killed the Jest worker, since Jest
doesn't load `index.ts`'s handlers). The real production impact is
different but still real: **the session's `userId`/`userName`/`userRoles`/
`orgs`/`rootOrgId` can silently fail to be set or persisted**, and because
the call is fire-and-forget, every caller proceeds as if it had succeeded —
there is no way for any of the ~11 call sites (`ssoLogin.ts`, `tnaiAuth.ts`,
`tnnmcAuth.ts`/`tnnmcAuthV2.ts`, `googleSignInRoutes.ts`,
`authorizationV2Api.ts`, `mobileAppApi.ts`,
`maharastraNursingCouncilAuth.ts`, `emailOrMobileLoginSignIn.ts`,
`sashaktAuth.ts`, `signupWithAutoLogin.ts`/`signupWithAutoLoginV2.ts`/
`signupWithAutoLoginOrgForm.ts`, `maternityFoundationAuth.ts`) to detect or
react to the failure. Additionally, `getCurrentUserRoles`'s own axios call
(line 59) has no try/catch of its own — a rejection there propagates to
whatever calls `getCurrentUserRoles`, so this depends on each caller
awaiting/catching it correctly (not verified for all 11 sites in this
pass).

Not reproduced live as a crash (per the safety rule); the test suite for
`rolePermission.ts` calls `setRolesData`/`getCurrentUserRoles` directly with
valid inputs instead.

**MUST VERIFY IN PROD:**
- [ ] Search logs for `Unhandled Rejection` (the exact string logged by
      `src/index.ts:32`) correlated with `/user/v2/read/` calls — this
      would confirm `setRolesData` is already failing silently in
      production.
- [ ] Confirm whether any observed session/role inconsistencies (users
      missing expected roles, missing `rootOrgId`) correlate with this
      silent-failure path.
- [ ] Consider whether `setRolesData` should be awaited and its failure
      surfaced (e.g. a 500) rather than silently swallowed, given it sets
      session data multiple downstream routes rely on.

---

### AZ. `userOtp.ts` — `POST /` can double/triple-send if the Cassandra query ever resolves falsy, plus raw CQL string interpolation

```ts
const query = `SELECT * FROM sunbird.otp WHERE type='${userDetails.type}' AND key='${userDetails.key}'`
const otpData = await client.execute(query)
if (!otpData) {
    res.status(400).json({ msg: 'OTP cannot be fetched', ... })   // <-- no return
}
res.status(200).json({ data: otpData.rows, message: 'SUCCESS' })  // <-- otpData.rows throws if otpData is falsy
```

Same missing-`return` family as changes Q/R/S/T/V/Z/AD/AE/AH/AN/AT/AU: the
`if (!otpData)` check sends a 400 with no `return`, so execution falls
through to `res.status(200).json({ data: otpData.rows, ... })`. If
`otpData` is ever falsy, `otpData.rows` throws synchronously (`Cannot read
properties of ... 'rows'`), which is caught by the outer catch and sends a
*third* response on an already-ended connection. With the real
`cassandra-driver`, `client.execute()` always resolves with a `ResultSet`
object on success (never falsy), so this branch is not reachable with the
current driver behavior — but it is still a latent double/triple-send bug
if that assumption ever changes (driver upgrade, or a caller substituting a
different execute path). Not reproduced live for that reason.

Separately: `userDetails.type` and `userDetails.key` (attacker-controlled
POST body values) are interpolated directly into a raw CQL query string
with no parameterization — the same pattern already flagged as a likely
injection vector in change AR (`publicCertifcateFlinkv2.ts`). This endpoint
is public and gated only by a shared `extractionKey`; anyone who has (or
guesses/leaks) that key can also submit arbitrary `type`/`key` values.

**MUST VERIFY IN PROD:**
- [ ] Confirm no code path (current or planned) can make
      `client.execute()` resolve with a falsy value for this query — if any
      Cassandra driver upgrade changes that guarantee, this becomes a live
      double-send risk.
- [ ] Confirm whether `type`/`key` have ever contained CQL special
      characters in access logs — evidence of injection attempts, and
      consider migrating to the parameterized `client.execute(query,
      params, {prepare: true})` form used correctly elsewhere in this
      codebase (e.g. `keycloak-user-creation.ts`).

---

### BA. `contentSearchService.ts` — minor: a circular upstream error could mask itself in the log line

```ts
} catch (error) {
    logError('Error in searchContent: ' + JSON.stringify(error))
    throw error
}
```

(identical shape appears twice, in `searchContent` and `searchContentV2`).
A genuine axios error can carry circular references (e.g. `error.request`/
`error.config` holding a reference back to an `http.Agent`/socket).
`JSON.stringify` throws `TypeError: Converting circular structure to JSON`
on such objects — if that happens, this `catch` block's own `JSON.stringify`
call throws a *new* TypeError before reaching `throw error`, masking the
real error. This is low-severity: the new TypeError still propagates up into
`mobileAppApi.ts`'s own try/catch (which uses a safe `JSON.stringify` on the
TypeError itself, not the circular original), so the caller still gets a
normal 500 — only the log line's diagnostic value is lost for that one
request. Not reproduced live (would require constructing an artificial
circular error rather than exercising real logic).

**MUST VERIFY IN PROD:** if `error.message`-only logging would be more
robust than `JSON.stringify(error)` for genuine axios transport failures,
consider that swap here (low priority).

---

### BB. `assessmentCompetency.ts` — `GET /v1/assessment/*` resolves `jumbler()` fire-and-forget, so a rejection escapes the route's own try/catch

```ts
assessmentCompetency.get('/v1/assessment/*', async (req, res) => {
  try {
    const path = removePrefix(...)
    jumbler(path).then((response) => {
      return res.send(response)
    })                                    // <-- no .catch, not awaited
    logInfo('New getAssessments competency >>>>>>>>>>> ', path)
  } catch (err) { ... }
})
```

`jumbler(path).then(...)` is called with no `.catch()` and without `await`,
inside a `try` block. The enclosing `try/catch` only guards the synchronous
call that starts the promise chain — it does not (and cannot) catch a
rejection that surfaces later on that unawaited promise. If `jumbler` ever
rejects (its own upstream call failing), that rejection becomes an unhandled
promise rejection instead of a caught, handled error, and the client that
made this request never receives a response — it hangs until timeout. Same
"async logic escapes its own try/catch" shape as change AJ/AY, applied here
to a fire-and-forget `.then()` rather than an unawaited async function call.

Not reproduced live — doing so would hang the Jest worker; the test suite
for this file only exercises the resolving path for this route.

**MUST VERIFY IN PROD:**
- [ ] Check gateway/load-balancer logs for long-running or timed-out
      requests to `GET .../assessmentCompetency/v1/assessment/*` — a
      correlated pattern would confirm this is already happening when the
      downstream `jumbler` call fails.

---

### BC. `publicReadForm.ts` — CRITICAL: `GET /readForm` never completes its response on ANY successful request, plus a separate missing-return double-send

```ts
publicReadForm.get('/readForm', async (req, res) => {
  try {
    const frameworkType = req.query.type
    if (!(frameworkType)) {
      res.status(400).json({ msg: 'frameworkType can not be empty', ... })
    }                                    // <-- no return
    const client = new cassandra.Client({ ... })
    const query = `SELECT ... WHERE type=${frameworkType};`
    const formData = await client.execute(query)
    if (!formData) {
      res.status(400).json({ msg: 'Form cannot be fetched', ... })
    } else {
        res.writeHead(200, {
            'Content-Type': 'application/json',
            data: JSON.stringify(formData),
        })
        // <-- no res.end()/res.send() — the response is never completed
    }
    client.shutdown()
  } catch (error) { ... }
})
```

Two independent defects:

1. **CRITICAL — every successful request hangs forever.** `res.writeHead(200, {...})` only flushes the status line and headers; it never calls `res.end()` (contrast with the structurally similar `publicCertifcateFlinkv2.ts`, which correctly follows `writeHead()` with `res.end(image, 'binary')` — that call is simply absent here). This means **any valid request** (a `type` present, and Cassandra returns a truthy result) leaves the HTTP connection open indefinitely — the caller never receives a response and times out. This is not a rare edge case; it is the endpoint's *only* success path.
2. **Missing-`return` double-send**, same family as changes Q/R/S/.../AZ/BB: `if (!(frameworkType))` sends a 400 with no `return`, so a request with no `type` query param falls through into a real Cassandra client/query built with `type=undefined` interpolated raw into the CQL string, then hits the same success/failure branching below and sends a second response.

Given defect 1, there is no successful-request scenario that can be safely exercised live — the response would never complete and the Jest worker would hang. Not reproduced live for either defect; the test suite for this file only checks HTTP-level status codes for the malformed/error paths where the flow reaches the outer `catch` before any response is sent.

Also worth noting: `frameworkType` (the raw, unvalidated `type` query parameter) is interpolated directly into a CQL query string with no parameterization — the same pattern flagged as a likely injection vector in changes AR and AZ.

**MUST VERIFY IN PROD — urgent:**
- [ ] Confirm whether `GET /readForm` is reachable/used at all in production. If it has ever been called with a valid `type`, the caller would have experienced a hang/timeout on every attempt — check client-side timeout logs or whether this endpoint has quietly been dead code.
- [ ] If it needs to work, add `res.end()` (or switch to `res.status(200).json(formData)`) after the `writeHead` call, and add the missing `return`.
- [ ] Confirm whether `type` has ever contained CQL special characters in access logs.

---

### BD. `user/changeEmail.ts` — URGENT: an unguarded `err.response.data` access can hang or crash the process on any network-level failure

```ts
} catch (err) {
    logError('ERROR UPDATE EMAIL ID >', err)
    res.status((err && err.response && err.response.status) || 500).send(err.response.data)
    //                                                                    ^^^^^^^^^^^^^^^^^^ unguarded
}
```

`err.response.status` on the same line is correctly guarded
(`err && err.response && err.response.status`), but the `.send(...)`
argument, `err.response.data`, has no guard at all. On any transport-level
failure — DNS error, `ECONNREFUSED`, timeout, i.e. an axios rejection whose
`Error` has no `.response` property (exactly the shape produced by this
campaign's `networkError()` test helper) — evaluating `err.response.data`
throws `TypeError: Cannot read properties of undefined (reading 'data')`
*before* `.send()` is ever called. That throw happens inside the `catch`
block of an `async` Express handler with no surrounding try/catch, so it
becomes an unhandled promise rejection: the request never receives a
response (hangs), and depending on the process's unhandled-rejection
policy this can also crash the Node process (Pattern D-adjacent).

For comparison, the sibling file `user/preference.ts` handles the identical
error shape safely: `.send((err && err.response && err.response.data) ||
err)` — fully guarded with a fallback. `changeEmail.ts` is simply missing
that guard. Not reproduced live — doing so would either hang the Jest
worker or throw outside the test's control.

**MUST VERIFY IN PROD — urgent:**
- [ ] Confirm whether `PUT /protected/v8/user/:metaType` (change-email/
      change-phone) has ever received a network-level upstream failure
      (timeout/DNS/connection-refused) in production, and if so whether it
      manifested as a hung request or a process crash/restart.
- [ ] Add the same `(err && err.response && err.response.data) || {...}`
      guard used by `preference.ts` and most other files in this codebase.

---

### BE. `extractUserIdFromRequest` can throw before any try/catch runs, in at least three route handlers (`activity.ts`, `network-hub.ts`, `validate.ts`)

```ts
// src/utils/requestExtract.ts
export const extractUserIdFromRequest = (req: any): string => {
  const wid = req.header('wid')
  if (wid) { return wid }
  return req.session.userId as string   // <-- no guard on req.session existing
}
```

```ts
// src/protectedApi_v8/user/activity.ts
activity.get('/', async (req, res) => {
  const wid = extractUserIdFromRequest(req)   // <-- called BEFORE the try block
  ...
  try { ... } catch (err) { ... }
})
```

`extractUserIdFromRequest` dereferences `req.session.userId` with no guard
on `req.session` existing. In both `activity.ts` (`GET /`) and
`network-hub.ts`, this call sits *before* the route's own `try` block. If a
request ever reaches one of these handlers with no `wid` header and no
`req.session` object, the resulting `TypeError` is thrown synchronously
inside an `async` function with nothing there to catch it — an unhandled
promise rejection, so the request never gets a response (hangs).

In practice this is likely **not reachable in normal operation**, since
session middleware is expected to populate `req.session` (even as an empty
object) for every request that reaches these protected routes — this would
only manifest if session middleware were ever misconfigured, absent, or the
session expired in a way that clears the object entirely, which is an
infrastructure-level concern rather than a per-route bug. It is recorded
here because it was independently surfaced multiple times this campaign and
the helper itself has no defensive guard, so a future change to the session
setup could make it reachable. Not reproduced live (this is exactly the
kind of "logic outside try/catch, throws synchronously in an async
handler" hazard this campaign avoids reproducing).

A third, related instance: `user/validate.ts`'s `GET /` handler calls
`extractUserEmailFromRequest`, `extractUserNameFromRequest`, and
`extractUserIdFromRequest` with **no try/catch anywhere in the handler at
all** (not even one placed after these calls). The first two helpers
(`requestExtract.ts`) guard `req.kauth` truthiness but then dereference
`req.kauth.grant.access_token.content.name`/`.email` unconditionally — if
`req.kauth` is present but its nested shape is ever malformed, that throws
the same way. Currently unreachable in practice for the same reason as
above (the real Keycloak middleware always populates this shape
consistently), so not reproduced live.

**MUST VERIFY IN PROD:**
- [ ] Confirm session middleware is always attached ahead of these routes
      in `server.ts`'s actual middleware order, guaranteeing `req.session`
      is never `undefined` by the time these handlers run.
- [ ] Consider adding a guard directly in `extractUserIdFromRequest`
      (`req.session && req.session.userId`) so this can never throw
      regardless of caller order, rather than relying on every call site
      to place the call inside its own try/catch correctly.

---

### BF. `resource.ts` — URGENT: `GET /` has no try/catch at all and can hang on a common query shape

```ts
userAuthKeyCloakApi.get('/', async (req, res) => {
    const host = req.get('host')
    let queryParam = ''
    let isLocal = 0
    if (!_.isEmpty(req.query)) {
        queryParam = req.query.q
        if (queryParam.includes('localhost')) {   // <-- throws if req.query.q is undefined
            isLocal = 1
        }
    }
    ...
    res.redirect(redirectUrl)
})
```

This entire route has **no try/catch anywhere**. If the request has a
non-empty query string but no `q` key (e.g. `GET /?foo=bar`, or a nested
query object like `GET /?q[x]=1`, which Express's query parser turns into
`{x: '1'}`), `queryParam` becomes `undefined` (or a plain object), and
`.includes('localhost')` throws a `TypeError` synchronously inside the
`async` handler. Express 4 does not catch rejections/throws from async
handlers on its own — this becomes an unhandled promise rejection, and
`res.redirect()` is never reached. The request hangs with no response ever
sent. Not reproduced live — doing so would hang the Jest worker; the test
suite only exercises requests with an empty query string or a valid `q`.

**MUST VERIFY IN PROD — urgent:**
- [ ] Check gateway/load-balancer logs for hung or timed-out requests to
      this route (mounted wherever `userAuthKeyCloakApi` is registered in
      `server.ts`) with a query string present but no `q` parameter.
- [ ] Wrap the handler body in a try/catch, or explicitly guard
      `typeof queryParam === 'string'` before calling `.includes`.

---

### BG. `userEnrolledInSource.ts` — `GET /` missing-`return` double-send on empty `sourceName`

```ts
userEnrolledInSource.get('/', async (req, res) => {
  try {
    let sourceName = req.query.sourceName
    if (!sourceName) {
      res.status(400).json({ message: "Source name can't be empty", ... })
    }                                    // <-- no return
    const response = await axios({ ... })   // runs regardless
    res.status(response.status).send(response.data)
  } catch (err) { ... }
})
```

Same missing-`return` family as changes Q/R/S/.../BC/BD: the empty-
`sourceName` check sends a 400 with no `return`, so execution falls through
into a real upstream call (with `courseSourceName: undefined`) and sends a
second response once it resolves — a double-send crash. Not reproduced
live for that reason; every test in the suite supplies a `sourceName`.

**MUST VERIFY IN PROD:**
- [ ] Check application logs for `ERR_HTTP_HEADERS_SENT` (or equivalent)
      originating from this route.

---

### BH. `authSearch.ts` — URGENT: unguarded `error.response` access can crash the process on any transport-level failure

```ts
authSearch.all('*', (req, res) => {
  ...
  axios({ ... } as AxiosRequestConfig)
    .then((response) => {
      res.status(response.status).send(response.data)
    })
    .catch((error) => {
      res.status(error.response.status).send(error.response.data)
      //         ^^^^^^^^^^^^^^^^^^^^^         ^^^^^^^^^^^^^^^^^^^ both unguarded
    })
})
```

`authSearch.all('*', ...)` is a catch-all forwarding route (every HTTP method,
every path under wherever this router is mounted). Its `.catch()` callback
dereferences `error.response.status`/`error.response.data` with no guard at
all. Any transport-level failure — DNS error, `ECONNREFUSED`, timeout, i.e.
an axios rejection whose `Error` has no `.response` property (exactly the
shape produced by this campaign's `networkError()` test helper) — throws a
new, unhandled `TypeError` *inside the `.catch` callback itself*. Since
there is no further handler for that, this becomes a genuinely fatal
unhandled promise rejection, matching the Pattern D crash class documented
elsewhere in this campaign (e.g. `changeEmail.ts`, change BD) — except here
every route in the file funnels through this single catch-all handler, so
the blast radius is the whole search-proxy surface, not one endpoint. Not
reproduced live — doing so would either hang or crash the Jest worker.

**MUST VERIFY IN PROD — urgent:**
- [ ] Confirm whether `SEARCH_API_BASE` has ever been unreachable
      (deploy window, network partition, DNS blip) in production, and
      whether that correlates with a process restart/crash around this
      route.
- [ ] Add the same `(err && err.response && ...)` guard used throughout
      the rest of this codebase.

---

### BI. `bnrcUser.ts` — `updateUserStatusInDatabase()` reports success even when the audit-log DB insert fails after all retries

*Found while investigating SonarQube code duplication between `bnrcUser.ts`,
`upsmfUser.ts`, and `mpNHMUser.ts` — see `docs/DUPLICATE-CODE-CLEANUP.md`
change L3-7.*

```ts
try {
  const maxRetries = 2
  let retryCount = 0
  while (retryCount < maxRetries) {
    try {
      await pgPool.query(pgQuery, pgParams)
      break                                    // success
    } catch (queryError) {
      retryCount++
      if (retryCount >= maxRetries) {
        logError('PostgreSQL insert failed after max retries', ...)
        break                                   // <-- exhausted retries, but still `break`s
      }
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }
  }
} catch (pgError) {
  logError('Unexpected error in PostgreSQL insert', ...)
}
return true                                     // <-- reached on BOTH success AND exhausted retries
```

Both the success path (`break` after a successful `pgPool.query`) and the
exhausted-retries path (`break` after the second failed attempt) fall
through to the same unconditional `return true` at the end of the
function. A fully-failed audit-log insert — i.e. the registration
succeeded upstream but the PostgreSQL audit row was never written after
both retries failed — is reported as `true` (success) to every caller.

For comparison, the sibling files `upsmfUser.ts` and `mpNHMUser.ts` both
correctly `return false` inside the `if (retryCount >= maxRetries)`
branch of their equivalent function — `bnrcUser.ts` is the only one of
the three with this defect, confirmed by direct line comparison.

Safe to state as fact (not speculative) since this was found by reading
the actual code, not by exercising it live. This is a data-integrity/
observability issue, not a hang/crash/security bug, so it wasn't run
through the live-reproduction safety process used elsewhere in this
document — it's a straightforward logic bug.

**MUST VERIFY IN PROD:**
- [ ] Check whether any BNRC registration audit rows are missing in
      `bnrc_registration_data_prod` for registrations that otherwise
      completed successfully — this function's `true` return means
      callers have no way to detect that gap today.
- [ ] Confirm whether any monitoring/alerting depends on this function's
      return value to detect audit-log write failures (currently it
      cannot, for BNRC specifically).

---

### BJ. `mpNHMUser.ts` — migrated users get a postal address with a blank state name

*Found during the same duplication investigation — change L3-8.*

```ts
// migrateUserToMp() — the migration path for existing aastrika/staging users
userProfileDetails.profileReq.personalDetails.postalAddress =
  `India, , ${userFormDetails.district}`
```

The state segment of the address is empty. For comparison, the *new-user*
path in the same file (`userProfileUpdate()`) correctly builds
`` `India, Madhya Pradesh, ${user.district}` ``, and the equivalent
migration functions in `upsmfUser.ts`/`bnrcUser.ts` correctly say
`"Uttar Pradesh"`/`"Bihar"` respectively. Only the MP-NHM *migration*
function (used when an existing aastrika/staging-org user is being moved
into MP-NHM) has this blank-state defect — new MP-NHM signups are
unaffected.

**MUST VERIFY IN PROD:**
- [ ] Check whether any migrated (not newly-signed-up) MP-NHM user
      profiles have a postal address missing the state name, and whether
      any downstream consumer (reporting, mailing, compliance) depends on
      that field being populated.

---

### BK. `mpNHMUser.ts` — OTP send/resend failures are logged at info level, not error level

*Found during the same duplication investigation — change L3-9.*

`sendOtp`'s and `resendOtp`'s catch blocks both call
`logInfo('Error in sending/resending user OTP' + error)` instead of
`logError(...)`. The file's own `validateOtp` route, and the equivalent
OTP handlers in `upsmfUser.ts`/`bnrcUser.ts`, all correctly use
`logError` for their failure paths. This means MP-NHM's OTP send/resend
failures don't surface the same way in any error-level log
monitoring/alerting that the other two orgs' failures do — the requests
still get a normal error HTTP response, this is purely an observability
gap.

**MUST VERIFY IN PROD:**
- [ ] Confirm whether error-level alerting exists on this log stream, and
      if so, add MP-NHM OTP send/resend failures to it (currently
      invisible to anything filtering on `logError`).

---

### BL. `upsmfUser.ts` / `mpNHMUser.ts` / `bnrcUser.ts` — all three orgs' default password uses a constant named for BNRC

*Found during the same duplication investigation — change L3-5.*

All three files' `createUser()` helper sets
`password: CONSTANTS.BNRC_USER_DEFAULT_PASSWORD` — including UPSMF and
MP-NHM, which are not BNRC. This is either an intentional shared default
across all three org-signup flows (in which case the constant is just
misleadingly named), or a copy-paste leftover where UPSMF/MP-NHM were
supposed to get their own distinct default password constants and never
did. Either way this deserves a deliberate decision rather than being
left as an artifact of copy-paste — not flagging this as a security
"bug" outright since it may be intentional, but the naming alone is
evidence it wasn't a deliberate, reviewed choice.

**MUST VERIFY IN PROD:**
- [ ] Confirm with product/security whether UPSMF, MP-NHM, and BNRC are
      intended to share one literal default password, and if so, rename
      the constant to something org-neutral; if not, split it into three
      distinct constants.

---

### BM. `network.ts` — `GET /connections/established/:id` looks up connections for an arbitrary user id from the URL, not the caller

*Found during the same duplication investigation — change L3-17.*

```ts
networkConnectionApi.get('/connections/established/:id', async (req, res) => {
  const rootOrg = req.headers.rootorg
  const userId = req.params.id          // <-- from the URL path, not the authenticated caller
  ...
  const response = await axios.get(apiEndpoints.getConnectionEstablishedData, {
    ...axiosRequestConfig,
    headers: { Authorization: CONSTANTS.SB_API_KEY, rootOrg, userId, 'x-authenticated-user-token': extractUserToken(req) },
  })
```

Every other route in this file derives `userId` from the authenticated
caller via `extractUserIdFromRequest(req)`. This one route instead takes
it directly from the URL's `:id` path parameter — meaning any
authenticated caller can request **any other user's** established
connections list simply by changing the id in the URL, provided they
know or can guess a valid user id. The real `Authorization`/
`x-authenticated-user-token` headers are still forwarded upstream, so
whether this is actually exploitable depends entirely on whether the
downstream Network Hub service (`NETWORK_HUB_SERVICE_BACKEND`)
independently re-validates that the token's identity matches the `userId`
header, or trusts this service's headers at face value. This repo cannot
resolve that from static reading alone — it's a genuine
"MUST VERIFY IN PROD" rather than a confirmed bypass.

**MUST VERIFY IN PROD — urgent, potential IDOR:**
- [ ] Confirm whether the downstream Network Hub service validates that
      the `x-authenticated-user-token`'s identity matches the `userId`
      header on this specific endpoint, or trusts it unconditionally.
- [ ] If unconditional trust, this is a real cross-user data exposure —
      the fix is deriving `userId` from `extractUserIdFromRequest(req)`
      like every other route in this file, not from `req.params.id`.
- [ ] Determine whether `:id` was intentionally designed as an
      admin/lookup feature (in which case it needs its own permission
      check, currently absent) or is simply a copy-paste inconsistency
      from the other routes in this file.

---

### BN. `network.ts` — `/connections/recommended` and `/connections/recommended/userDepartment` omit auth headers that every other route in the file sends

*Found during the same duplication investigation — change L3-17.*

Every other route in `network.ts` forwards
`Authorization: CONSTANTS.SB_API_KEY` and
`'x-authenticated-user-token': extractUserToken(req)` to the upstream
Network Hub service. `/connections/recommended` and
`/connections/recommended/userDepartment` send only `{ rootOrg, userId }`
— no `Authorization`, no token. This may be intentional (a different
downstream contract for the recommendation lookup specifically), but
given every sibling route on the same backend does send these headers,
it reads as an inconsistency rather than a deliberate design choice.

**MUST VERIFY IN PROD:**
- [ ] Confirm with the Network Hub service owner whether these two
      routes are intentionally unauthenticated calls, or whether the
      auth headers were simply dropped by accident when these routes
      were added.

---

### BO. `content.ts` — `POST /getWebModuleManifest` missing-`return` double-send on an empty `url`

```ts
contentApi.post('/getWebModuleManifest', async (req, res) => {
  try {
    if (!req.body.url || !req.body.url.length) {
      res.status(400).send()
    }                                    // <-- no return
    const url = req.body.url            // undefined if the check above fired
    const response = await axios.get(`${url}`, axiosRequestConfig)
    res.json(response.data)             // second send once this resolves
  } catch (err) { ... }
})
```

Same missing-`return` family as changes Q/R/S/.../BG/BO: the empty-`url`
check sends a 400 with no `return`, so execution falls through to a real
`axios.get('undefined', ...)` call and sends a second response once it
resolves or rejects — a double-send crash. Found while extending this
file's test coverage from 71.56% to 94.24%; not reproduced live for the
reason above.

**MUST VERIFY IN PROD:**
- [ ] Check application logs for `ERR_HTTP_HEADERS_SENT` (or equivalent)
      originating from `POST .../content/getWebModuleManifest`.

---

### BP. `emailOrMobileLoginSignIn.ts` — `/registerUserWithMobile` also has a missing-`return` double-send on a missing `phone`, separate from change E's hang

Found while extending this file's test coverage (88.57% → 95.51%). This is
a *different* defect on the *same* route as change E above — E documents a
zero-response hang when the upstream create-user call fails; this is the
missing-`return` double-send family (same shape as changes Q/R/S/.../BO)
triggered by a missing `phone` field instead. `if (!req.body.phone) {
res.status(400)... }` has no `return`, so execution falls through into the
real create-user flow and can send a second response once that resolves.
Not reproduced live for the same reason as every other entry in this
family. Recording alongside change E since they share a route but are
independent bugs.

**MUST VERIFY IN PROD:**
- [ ] Check application logs for `ERR_HTTP_HEADERS_SENT` (or equivalent)
      originating from `POST .../registerUserWithMobile` with a missing
      `phone` field specifically (distinct from change E's upstream-failure
      hang scenario).

---

### BQ. `profile-registry.ts` — `GET /getProfilePageMeta` returns function references instead of master-data lists; one of the five helpers also reads the wrong JSON key

```ts
async function govtOrgMeta() {
  return async () => {
    const data = await fs.promises.readFile(...)
    return JSON.parse(data.toString())
  }
}
// ... industreisMeta, degreesMeta, statesMeta, designationMeta — same shape

profileRegistryApi.get('/getProfilePageMeta', async (req, res) => {
  try {
    const govtOrg = await govtOrgMeta().catch(...)   // resolves to the inner
    const industries = await industreisMeta().catch(...)  // arrow fn itself,
    ...                                                     // never invoked
    res.json({ govtOrg, industries, degrees, states, designations })
  } catch (err) { ... }
})
```

Each of the five meta helpers is `async function () { return async () => {...} }`
— the outer function returns the inner arrow function without ever calling
it. So `govtOrgMeta()` resolves to a *function value*, not the parsed JSON
list, and the five `.catch(...)` blocks plus the outer `catch` are genuinely
unreachable (a promise that only ever resolves can't reject). The practical
effect: `/getProfilePageMeta`'s response body ships non-serializable
function references in place of the `govtOrg`/`industries`/`degrees`/
`states`/`designations` lists any consumer expects — this endpoint's actual
payload has likely never matched its intended shape.

Separately, `statesMeta` (independent of the above, but moot while the
function is dead code) reads `obj.industries` from `states.json` instead of
`obj.states` — looks like a copy-paste bug from `industreisMeta`.

Found while extending this file's test coverage from 51.79% to 96.41%; not
changed, since fixing the invocation would change the response shape/behavior
of a live endpoint.

**MUST VERIFY IN PROD:**
- [ ] Call `GET .../user/getProfilePageMeta` against a real environment and
      inspect the actual JSON response for `govtOrg`/`industries`/`degrees`/
      `states`/`designations` — confirm whether consumers already tolerate
      (or silently ignore) non-list values, before touching this code.

---

### BR. `apiWhiteList.ts` / `whitelistApis.ts` — `SCOPE_CHECK` is defined but never wired into any route, leaving a documented `MDO_ADMIN` restriction inert

`whitelistApis.ts` declares `SCOPE_CHECK: [MDO_ADMIN]` on
`/protected/v8/workallocation/getWorkOrderById/:workOrderId`, and
`apiWhiteList.ts`'s `isAllowed()` only runs a check function when its
`CHECK` constant appears in that route's `checksNeeded` array — but across
the entire 1928-line whitelist config, every `checksNeeded` array is either
`[CHECK.ROLE]` or `[]`; `CHECK.SCOPE` never appears in any of them. So this
route is effectively protected by `ROLE_CHECK: [PUBLIC]` alone — the
org-scoped `MDO_ADMIN` restriction its own data implies was intended is
silently never enforced. Not a bug in `SCOPE_CHECK`'s own logic (it would
correctly reject a scope mismatch if it ran) — it's a wiring gap between
`whitelistApis.ts`'s data and how `checksNeeded` is populated.

Found while extending `apiWhiteList.test.ts`'s coverage (81.96% → 83.6%;
most of the remaining gap is genuinely unreachable dead code, this being the
one live-relevant exception). Not changed — wiring in `CHECK.SCOPE` would be
a behavior change to a live authorization route.

**MUST VERIFY IN PROD:**
- [ ] Confirm with whoever owns `getWorkOrderById/:workOrderId` whether the
      `MDO_ADMIN`-scoped restriction was actually intended to be enforced,
      and whether any non-`MDO_ADMIN` caller has been relying on (or is
      currently exploiting) its absence.

---

### BS. `sashaktAuth.ts` — a second, independent missing-`return` double-send when `userDetails[0]` is falsy-but-non-throwing

```ts
if (!sashaktData) {
  res.status(400).json({ msg: 'User not present in sashakt', ... })
  logInfo('User details not present in e shashakt')
}                                    // <-- no return
// ... falls through all the way to:
res.status(200).json(...)           // unconditional, outside the try/catch
```

Same missing-`return` family as changes Q/R/S/.../BO/BP: if
`userDetails[0]` is a falsy-but-non-throwing primitive (`0`, `''`, `false`
— as opposed to `undefined`/`null`, which throw one line earlier at
`sashaktData.email` and land safely in the outer `catch`), the 400 response
has no `return`, so execution falls through to the unconditional
`res.status(200).json(...)` at the end of the handler and sends a second
response — `ERR_HTTP_HEADERS_SENT`. This is a *different* code path from the
already-documented double-send on this same file at the
`authTokenResponse.data` falsy branch (→ 302 then 200) — recording as a
separate, independent instance since they're triggered by different
conditions. Found while extending this file's test coverage (90.72% →
96.90%); not reproduced live for the reason above.

**MUST VERIFY IN PROD:**
- [ ] Check application logs for `ERR_HTTP_HEADERS_SENT` (or equivalent)
      originating from the sashakt auth route when the upstream sashakt
      lookup returns a falsy-but-defined `userDetails[0]` (e.g. `0`, `''`,
      `false`), distinct from the already-documented 302→200 double-send.

---

### BT. `signupWithAutoLoginV2.ts` — `POST /register` is missing a `return` after its empty-email-and-phone validation response, same bug class as other missing-return double-sends but not currently exploitable

```ts
if (!req.body.email && !req.body.phone) {
  res.status(400).json({ ... })
}                                    // <-- no return
// ... falls through into createAccount/updateRoles/profileUpdate, then:
if (resultEmail || resultPhone) { res.status(200).json(...) }  // guarded
```

Same missing-`return` shape as changes Q/R/S/.../BP/BS, but unlike those,
this one is **not exploitable today**: `userEmail`/`userPhone` stay `''`
(falsy) for the rest of the function when the initial check fires, so
`resultEmail || resultPhone` at the later guard stays falsy too and the
second `res.*` call never actually executes — no live double-send occurs
under the current implementation. Recording it anyway because (a) it does
unnecessary downstream work (calls `createAccount`/`updateRoles`/
`profileUpdate` for a request that was already rejected), and (b) it is
fragile — any future change to how `resultEmail`/`resultPhone` are computed
could silently turn this into a live double-send, the same failure mode
already confirmed elsewhere in this file. Found while extending this file's
test coverage (89.92% → 97.84%). Low priority relative to the URGENT/
CRITICAL findings elsewhere in this doc.

**MUST VERIFY IN PROD:** none required — not currently reachable. Listed
for awareness if this function is touched again.

---

### BU. `env.ts` — `POST_ASSESSMENT_BASE`'s fallback default is a real, publicly-registered external domain, not the loopback host

```ts
// before
POST_ASSESSMENT_BASE: env.POST_ASSESSMENT_BASE || 'http://localhost.com',
// after
POST_ASSESSMENT_BASE: env.POST_ASSESSMENT_BASE || 'http://localhost:0',
```

Found while investigating SonarCloud's 17 `http://`-related security hotspots
in this file (see `docs/DUPLICATE-CODE-CLEANUP.md`-adjacent review, prompted
by a report from another user's Sonar run). Every other fallback in this file
follows the pattern `http://localhost:<port>` or an internal service name —
both fail safely (connection refused) if ever reached unconfigured in a real
deployment, since nothing in that environment listens there. `localhost.com`
is different: it is **not** the loopback address — it is a real, live,
third-party-registered domain on the public internet. If
`POST_ASSESSMENT_API_BASE` is ever unset in a deployed environment, this
fallback would silently send real network requests to that external domain
instead of failing loudly, which is a materially different risk profile from
every sibling default in this file.

**Fixed** (2026-08-05): swapped the fallback for `http://localhost:0`, an
obviously-inert value consistent with every sibling default — a missing env
var now fails fast instead of silently reaching an external host. Zero
impact on any environment where `POST_ASSESSMENT_API_BASE` is set, which the
next item confirms is already expected everywhere. `tsc --noEmit` and the
full Jest suite (213 suites / 3189 tests) pass unchanged.

**MUST VERIFY IN PROD:**
- [ ] Confirm `POST_ASSESSMENT_API_BASE` is set in every real deployment
      (it should already be, given the assessment-submission flow is live) —
      this fix doesn't change behavior there, but the assumption is still
      unverified from source.

---

### BV. `env.ts` — `NETWORK_SERVICE_BACKEND`'s fallback default is a malformed URL (missing `//`)

```ts
// before
NETWORK_SERVICE_BACKEND: env.NETWOR_SERVICE_API_BASE || 'http:localhost:7001',
// after
NETWORK_SERVICE_BACKEND: env.NETWOR_SERVICE_API_BASE || 'http://localhost:7001',
```

Found in the same review as change BU. `'http:localhost:7001'` is missing
the `//` after the scheme, so it is not a well-formed URL — if this fallback
is ever actually used (i.e. `NETWOR_SERVICE_API_BASE` — itself apparently a
typo'd env var name, missing the `K` in `NETWORK` — is unset), any URL
parser or HTTP client consuming it would either throw or misinterpret it,
unlike every sibling `http://localhost:<port>` default in this file.

**Fixed** (2026-08-05): corrected only the malformed URL syntax (added the
missing `//`), matching every sibling default's format. The env var name
(`NETWOR_SERVICE_API_BASE`) was **deliberately left untouched** — renaming it
to `NETWORK_SERVICE_API_BASE` would change which env var is actually read,
which is a real behavior change depending on unverified prod config (see
below), not a zero-impact fix. `tsc --noEmit` and the full Jest suite
(213 suites / 3189 tests) pass unchanged.

**MUST VERIFY IN PROD:**
- [ ] Confirm whether the deployed env var is actually named
      `NETWOR_SERVICE_API_BASE` (matching the typo in code) or
      `NETWORK_SERVICE_API_BASE` (the presumably-intended name) — if the
      latter, this fallback has silently never been reachable by the
      intended env var name in any environment that set it correctly. This
      decides whether the typo should be fixed in a follow-up.

---

### BW. `env.ts` — moved 12 `http://`-literal fallback defaults into a git-ignored local-only file, to resolve their Sonar `S5332` (clear-text-protocol) hotspots at the source

**Issue:** 12 lines in `env.ts` hardcoded an internal-service `http://` URL as
the fallback default for an env var (e.g.
`KNOWLEDGE_MW_API_BASE: env.KNOWLEDGE_MW_API_BASE || 'http://knowledge-mw-service:5000'`).
Each had already been reviewed SAFE as a security hotspot (internal service
names / localhost placeholders, overridden by a real env var in every real
deployment — see `scripts/sonar-hotspot-reviews.mjs`), but that review only
silences the finding; the literal `http://` string still sits in tracked
source, so a server whose hotspot-review database doesn't have that
decision applied (a teammate's fresh local SonarQube, in this case) sees it
as an open hotspot again.

**Why fixed this way:** rather than re-reviewing on every server, remove the
literal strings from tracked source entirely. They now live in a git-ignored
`src/utils/env.local-defaults.json`, loaded at runtime via a small
`existsSync`/`readFileSync` guard (not a TS `import`, which would break
compilation on any machine without the file). A committed
`env.local-defaults.example.json` lets a fresh checkout restore it with one
`cp`, mirroring this repo's existing `.env.sonar`/`.env.sonar.example`
pattern. `src/server.ts:110`'s `S5332` hotspot (a direct WebSocket URL, not a
fallback-default pattern) was deliberately left as-is — out of scope.

**Impact: zero.** Every one of the 12 values is unchanged, only relocated —
verified by importing `env.ts` before and after and diffing the resolved
`CONSTANTS` values (identical). Also verified the missing-file path
explicitly (moved the file aside, re-ran the import): resolves to
`undefined` for those 12 keys, no throw — the same as any other unset env
var, and irrelevant in practice since real deployments always set the actual
env var, never touching this fallback. `tsc --noEmit` and the full Jest
suite (213 suites / 3189 tests) pass unchanged, both with and without the
local-defaults file present.

**MUST VERIFY IN PROD:** nothing — this is a source-organization change
only, the resolved runtime values are byte-identical to before, and
production never reads the new file (it's git-ignored, so it doesn't exist
in a deployed checkout, and even if it did, the real env vars already take
priority).

---

## CHANGE 19 — dead-code sweep: unused exports, unreachable file, unused router

Follow-up to the Level 1/2 duplication cleanup, found via `npx ts-prune -p
tsconfig.json` plus manual verification of every candidate (grep for real
call sites, not just match counts — `ts-prune` has false positives, e.g. it
flagged `range` on 5 apparent test-file hits, 4 of which were the English
word "range" in unrelated test descriptions). Candidates split into buckets:
**Category A** (whole files with zero imports anywhere), **Category B**
(files whose own test header explicitly documents them as intentionally
unreachable — `searchUser.ts`, `authorizationV2Api.ts` — left untouched,
out of scope, no sign-off given), **Category C** (individual unused exports
inside otherwise-live, multi-export files), **Category D** (unused
model/interface types and a possibly-deliberate `test.ts` CI-canary file —
left untouched, out of scope, no sign-off given). This entry covers the
approved Category A + C scope only.

**Files:**

| File | Change |
|---|---|
| `src/utils/fileLogger.ts` | deleted (whole file, Category A) |
| `jest.config.js` | removed stale `fileLogger.ts` coverage exclusion |
| `sonar-project.properties` | removed stale `fileLogger.ts` coverage exclusion |
| `src/publicApi_v8/mobileAppApi.ts` | removed empty, never-mounted `publicCertificateFlinkv2 = Router()` |
| `src/utils/helpers.ts` (+ test) | removed `range`, `esBasicAuth` |
| `src/utils/requestExtract.ts` (+ test) | removed `extractUserSessionState`, `extractUserTokenFromRequest`, `extractRootOrgFromRequest`, `getUUID`; dropped now-unused `uuid` import |
| `src/utils/logger.ts` | removed `logWarn`, `logSuccessHeading` (no test file — coverage-excluded) |
| `src/utils/proxyCreator.ts` (+ test) | removed `proxyCreatorUpload` |
| `src/configs/session.config.ts` | removed `setSessionEvent`; dropped now-unused `logInfo` import (no test file) |
| `src/service/goals.ts` (+ test) | removed `transformGoalUpsertRequest`, `transformResourceProgress`; dropped 4 now-unused type imports |
| `src/service/playlist.ts` (+ test) | removed `transformToSbExtCreateRequest`, `transformToSbExtUpdateRequest`; dropped 2 now-unused type imports |
| `src/authoring/utils/fetch-related-content.ts` | deleted (whole file, its only export had zero real call sites) |
| `src/protectedApi_v8/user/profile-details.ts` (+ test) | removed `getUserProfileStatus` |
| `src/protectedApi_v8/user/code.ts` | removed unused `actionType`, `groupType` type aliases (no dedicated test — type-only) |

**Why left alone despite matching `ts-prune`:** `service/playlist.ts` also
exports `transformToSbExtDeleteRequest` and `transformToSbExtUpsertRequest`,
both unreferenced in live code — but both are named in a **commented-out**
`delete`-branch call site in `protectedApi_v8/user/playlist.ts` (lines
21–24, 544). Removing them would silently break that disabled branch if
it's ever re-enabled, so both were explicitly kept, on direction from the
user after flagging the ambiguity.

**Impact: zero.** Every removed export was confirmed to have no call sites
anywhere in `src/` (whole-repo grep, not scoped to the obvious directory) —
including `src/publicApi_v8/mobileAppApi.ts`'s dead router, which is a
different variable from the real, live `publicCertificateFlinkv2` export in
`src/publicApi_v8/publicCertifcateFlinkv2.ts` that's actually imported and
mounted in `publicApiV8.ts`. Each removal's own test suite was run
immediately after editing (not batched), plus a `tsc --noEmit` check;
`transformGoalUpsertRequest`/`transformToSbExtCreateRequest`'s type imports
that became unused as a result were also trimmed. Final full regression:
`tsc --noEmit` clean, `tslint` clean, full Jest suite 213 suites / 3175
passed / 1 pre-existing skip (was 214 suites before this change — the
`fetch-related-content.test.ts` suite no longer exists, as intended), and
`npm run build` produced a clean `dist/` (276 files, zero `*.test.js`
leaked, deleted source files correctly absent).

**MUST VERIFY IN PROD:** nothing — every removed symbol was unreachable
from any HTTP route or other live code path before this change, so there is
no runtime behavior for these removals to affect.

---

## CHANGE 20 — L2-9: shared Postgres pool factory for publicSearch.ts / ratingsSearch.ts

**Issue:** both files independently built an identical `pg.Pool` from the
same `CONSTANTS.POSTGRES_*` config (same database, same credentials),
querying the same `public.data_node` table — flagged in
`docs/DUPLICATE-CODE-CLEANUP.md` as L2-9, with a caution that "merging
means combining two live `pg.Pool` instances — an operational change."

**Why fixed this way:** rather than merging into one shared pool instance
(a real operational change to connection-pool sizing, needing infra
sign-off), extracted a `createSearchPgPool()` factory in the new
`src/utils/searchPgPool.ts`, following the exact precedent already
established by `dataLakePgPool.ts` (CHANGE 9) — each caller still gets its
own independent `Pool` instance with its own connection lifecycle; only the
repeated config/construction code is shared. Pool count, sizing, and
lifecycle are unchanged from today.

**Files:**

| File | Change |
|---|---|
| `src/utils/searchPgPool.ts` | new — `createSearchPgPool()` factory |
| `src/publicApi_v8/publicSearch.ts` | replaced inline `new Pool(...)` block with `createSearchPgPool()` call |
| `src/publicApi_v8/ratingsSearch.ts` | same |

**Impact: zero.** Both files' own tests already mock `pg` at the module
level (`jest.mock('pg', () => ({ Pool: jest.fn(...) }))`), so the factory
extraction is transparent to them — verified both suites pass unchanged
(22 tests). `tsc --noEmit` and `tslint` clean. Full regression: 213 suites
/ 3175 tests pass. `npm run build` produced a clean `dist/` (277 files, up
from 276 — the one new source file — zero `*.test.js` leaked).

**MUST VERIFY IN PROD:** nothing — the resolved `Pool` config passed to
`pg` is byte-identical to before (same 5 fields, same env vars, same
`Number(...)` cast on port), just built by a shared function instead of
duplicated inline in each file.

---

## CHANGE 21 — L2-10: shared content-create request builder for goals.ts / playlist.ts

**Issue:** `formGoalRequestObj` (`service/goals.ts`) and
`formPlaylistRequestObj` (`service/playlist.ts`) build near-identical
content-creation request bodies for the goal-create and playlist-create
flows, flagged as L2-10 in `docs/DUPLICATE-CODE-CLEANUP.md`. Investigation
confirmed real divergence, more than the sibling L2-13 (already done in
CHANGE 18): a `description` field present only on goals, a `sharedWith`
field present only on playlists, different `primaryCategory` values
(`'Goals'` vs `'Playlist'`), and the `name` sourced from a different
request field per caller (`request.name` vs `request.playlist_title`).
Separately, the two `formContentRequestObj` functions in the same files
looked like a matching pair but read genuinely different field names from
their input (`req.contentIds` vs `req.content_ids`) — a real request-body
contract difference, not cosmetic.

**Why fixed this way:** merged only the two confirmed-safe functions.
`buildContentCreateRequest(createdBy, userId, name, primaryCategory,
description?, sharedWith?)` in the new `src/utils/contentCreateHelpers.ts`
takes every differing field as an explicit parameter, so goals.ts and
playlist.ts stay fully decoupled from each other — a future field change
in one caller cannot silently affect the other, since neither shares a
request type with the other, only the shared static content-metadata
shape. `formGoalRequestObj`/`formPlaylistRequestObj` keep their original
signatures and are now thin wrappers, so no caller or existing test needed
to change. **The two `formContentRequestObj` functions were deliberately
left separate**, per explicit direction — their different field-name
contracts (`contentIds` vs `content_ids`) mean merging them would require
normalizing the caller's request body, a bigger and riskier change than
this cluster's real duplication warrants.

**Files:**

| File | Change |
|---|---|
| `src/utils/contentCreateHelpers.ts` | new — `buildContentCreateRequest(...)` |
| `src/service/goals.ts` | `formGoalRequestObj` now delegates to the shared builder |
| `src/service/playlist.ts` | `formPlaylistRequestObj` now delegates to the shared builder |

**Impact: zero.** Both functions' existing tests (`formGoalRequestObj`,
`formPlaylistRequestObj` in their respective `.test.ts` files) assert the
exact output shape via `toEqual` and pass unchanged — proving byte-identical
output, including field presence/absence (`description` only appears for
goals, `sharedWith` only for playlists) and key ordering. `tsc --noEmit`
and `tslint` clean. Full regression: 213 suites / 3175 tests pass.
`npm run build` produced a clean `dist/` (278 files, up from 277 — the one
new source file — zero `*.test.js` leaked).

**MUST VERIFY IN PROD:** nothing — both request builders produce the exact
same JSON body as before for every existing caller; verified by the
unchanged passing tests plus a read of the generated code (conditional
spread emits `description`/`sharedWith` only when the caller passes them,
matching each original function's field set exactly).

---

## CHANGE 22 — L2-1: shared conditional-field Joi validator for the org-signup family

**Issue:** `courseSelection`/`facultyType`/`instituteName`/`instituteType`
Joi validators in `upsmfUser.ts`, `mpNHMUser.ts`, `bnrcUser.ts` were
byte-identical in structure and message text, flagged as L2-1 in
`docs/DUPLICATE-CODE-CLEANUP.md` — but only coincidentally, since each file
separately owns a different `role` enum (upsmf: 4 roles, mpNHM: 5 roles,
bnrc: 3 roles including `'In Service'`, not present elsewhere) with no
structural link tying the shared validator's hardcoded `'Student'`/
`'Faculty'` trigger literals to any one file's own role list.

**Why fixed this way:** added `conditionalFieldValidator(triggerRoles,
requiredMessage)` to the existing `src/utils/orgSignupValidators.ts`
(already home to this family's other shared fragments, from CHANGE 9).
Each of the 3 files calls it with its **own** `triggerRoles` literal at the
call site (e.g. `conditionalFieldValidator(['Student', 'Faculty'], '...')`)
— the trigger-role list lives in each file's own source, not in a shared
constant, so a form that renames or adds roles updates only its own call
site; nothing silently desyncs in a second file.

**Build regression found and fixed during this change:** removing the 4
inline `.when()` blocks per file (each of which had its own `'any.required'`
string literal, and in `upsmfUser.ts` some were shielded by a
`// tslint:disable-next-line: all` comment) changed which lines in
`upsmfUser.ts`/`mpNHMUser.ts` the `tslint-sonarts` `no-duplicate-string`
rule inspects, and the resulting file tripped that rule's duplicate-literal
threshold on the pre-existing `'any.required'` message-key string (12 and
11 remaining occurrences respectively) — a rule that was **not** firing on
either file before this edit. `npm run build` genuinely failed (non-zero
exit, no `dist/` produced) until this was fixed. Fixed by extracting a
local `const ANY_REQUIRED_KEY = 'any.required'` in each of the 2 affected
files and referencing it via computed-property syntax
(`[ANY_REQUIRED_KEY]: '...'`) at all 12 / 11 call sites — the same
extract-a-constant fix the lint rule itself recommends, and the same
pattern already used for `ERHMS_CODE_KEY`/`GOV_KEY` in both files. Pure
string-key indirection; the actual Joi message keys resolve to the exact
same `'any.required'` value at runtime. `bnrcUser.ts` was unaffected (its
own `'any.required'` count stayed under the rule's trigger point).

**Files:**

| File | Change |
|---|---|
| `src/utils/orgSignupValidators.ts` (+ test) | added `conditionalFieldValidator(triggerRoles, requiredMessage)` |
| `src/publicApi_v8/upsmfUser.ts` | 4 `.when()` blocks → `conditionalFieldValidator(...)` calls; added `ANY_REQUIRED_KEY` constant, 12 call sites converted to fix a build-breaking lint regression this edit caused |
| `src/publicApi_v8/mpNHMUser.ts` | same; added `ANY_REQUIRED_KEY` constant, 11 call sites converted |
| `src/publicApi_v8/bnrcUser.ts` | 4 `.when()` blocks → `conditionalFieldValidator(...)` calls; no lint fix needed |

**Impact: zero.** `conditionalFieldValidator`'s own unit tests (4 new
tests in `orgSignupValidators.test.ts`) directly prove the required/
optional/empty/null behavior for both single- and multi-role triggers.
Each of the 3 route files' own OTP-scoped test suites pass unchanged
(they don't exercise `/createUser`'s Joi validation directly, so this is
corroborating, not primary, evidence). `tsc --noEmit` and `tslint` clean
(after the `ANY_REQUIRED_KEY` fix). Full regression: 213 suites / 3179
tests pass (up from 3175 — the 4 new validator tests). `npm run build`
exits 0 and produces a clean `dist/` (278 files, zero `*.test.js` leaked)
— confirmed to genuinely fail before the `ANY_REQUIRED_KEY` fix was
applied, and confirmed passing after.

**MUST VERIFY IN PROD:** nothing behavioral — `conditionalFieldValidator`
produces the identical Joi schema shape (`Joi.string().when('role', {is,
otherwise, then}).messages({...})`) as each removed inline block, verified
directly against a real `Joi.object({...role...})` schema with both
single- and multi-role trigger cases before writing the final code. The
`ANY_REQUIRED_KEY` constant is a compile-time string alias only; the
`'any.required'` value Joi receives at runtime is unchanged.

---

## CHANGE 23 — L2-3: shared token-exchange tail for emailOrMobileLoginSignIn.ts's /auth and /authv2

**Issue:** `/auth` (password grant) and `/authv2/*` (authorization-code
grant) in `emailOrMobileLoginSignIn.ts` shared a byte-identical ~55-line
tail — from the `axios` token-exchange call through decoding the JWT,
establishing the session (`req.session.userId`, `req.kauth`,
`req.session.grant`), calling `getCurrentUserRoles`, and the full
success/302/400 response branching — flagged as L2-3 in
`docs/DUPLICATE-CODE-CLEANUP.md`. The doc explicitly deferred this one
pending regression tests for both routes, since it's a live auth path
exercised by two different OAuth grant types.

**Why fixed this way:** confirmed both routes already have dedicated test
coverage (`describe('POST /auth', ...)` and `describe('POST /authv2/*',
...)` in the existing test file — 5 and 4 tests respectively, covering
success, missing-upstream-user, bad-credentials/network-failure, and
missing-token-data paths) — the doc's stated prerequisite was already met.
Extracted `exchangeTokenAndEstablishSession(req, res, encodedData)`,
taking the already-built, grant-type-specific request body as a parameter
— `/auth` builds a `grant_type: 'password'` body from
`mobileNumber`/`email`/`password`, `/authv2` builds a `grant_type:
'authorization_code'` body from the OAuth `code` query param, and only
that differing piece was left at each call site. Each route's own
outer error boundary was preserved exactly: `/auth`'s pre-existing
`fetchUserBymobileorEmail` calls stay outside the extracted function (so a
failure there still falls through to the route's own outer catch → 500),
and each route's own `catch (error) { ...500... }` wrapper is unchanged.

**Files:**

| File | Change |
|---|---|
| `src/publicApi_v8/emailOrMobileLoginSignIn.ts` | added `exchangeTokenAndEstablishSession(...)`; `/auth` and `/authv2` now call it with their own grant body |

**Impact: zero.** All 27 of the file's existing tests pass unchanged,
including the 400-on-token-exchange-failure and 302-on-missing-token-data
cases for both routes — direct proof the extracted function's internal
try/catch reproduces each original inline block's exact status-code
behavior. `tsc --noEmit` and `tslint` clean. Full regression: 213 suites /
3179 tests pass (two intermediate runs showed unrelated single-suite
`mountRouter`/supertest flakiness — `profile.test.ts` and an unrelated
upstream-error-forwarding test — both confirmed clean in isolation and on
a clean rerun, consistent with this harness's known pre-existing
flakiness pattern documented throughout this campaign, not a regression
from this change). `npm run build` exits 0, clean `dist/` (278 files,
unchanged count — pure in-file refactor, zero `*.test.js` leaked).

**MUST VERIFY IN PROD:** nothing — the extracted function's request/
response handling is byte-identical to each original inline block; only
the request-body construction (which differs by design between the two
grant types) was ever route-specific, and that logic was left untouched
at each call site.

---

## CHANGE 24 — L2-12 (partial): shared searchAutoComplete query builder for home.ts / content.ts

**Issue:** `GET /searchAutoComplete` in `home.ts` (public) and `content.ts`
(protected) built a byte-identical Elasticsearch query (prefix-match
against the query term with a 4x/2x boost split, falling back to
suggested-terms-only when the query is empty) and shaped the response the
same way, flagged as L2-12 in `docs/DUPLICATE-CODE-CLEANUP.md` alongside
`/searchV6`. Investigation split the cluster in two: `/searchAutoComplete`
never reads the authenticated user at all, while `/searchV6` in the same
two files has a real, security-relevant difference — `content.ts` (behind
auth) resolves `uuid` via `extractUserIdFromRequest(req)`, the actual
caller's identity, while `home.ts` (public, unauthenticated) uses a fixed
`adminId` constant, since there is no logged-in user to extract an id
from. `/searchV6` was deliberately left untouched; only the
`/searchAutoComplete` half — confirmed to have no such divergence — was
merged.

**Why fixed this way:** added `sendAutoCompleteSearchResponse(req, res,
esBaseUrl)` to `src/utils/contentHelpers.ts`, already the shared home for
`sendSearchResponse`/`processContent` used by this exact search-response
family (CHANGE 16). The function does the ES call and response shaping
but does **not** catch its own errors — it lets them propagate to each
route's own `try/catch`, since `home.ts`'s inline catch and `content.ts`'s
`handleContentError` helper (CHANGE 17-adjacent) format error responses
differently and that difference needed to stay intact. This also
preserves an existing, deliberately-tested edge case: a missing `q` query
param throws a synchronous `TypeError` inside the query-building code,
which `home.test.ts` asserts falls through to each route's own 500
fallback, not a hang or a differently-shaped error.

**Files:**

| File | Change |
|---|---|
| `src/utils/contentHelpers.ts` | added `sendAutoCompleteSearchResponse(req, res, esBaseUrl)` |
| `src/publicApi_v8/home.ts` | `/searchAutoComplete` now calls the shared helper, own catch block unchanged |
| `src/protectedApi_v8/content.ts` | same; still uses `handleContentError` in its own catch |

**Impact: zero.** All 84 of the two files' existing tests pass unchanged,
including `home.test.ts`'s explicit "falls back to 500 when q is missing
(synchronous TypeError caught by the try/catch)" case — direct proof the
thrown error still propagates out of the now-awaited helper into each
route's own catch, unchanged. `tsc --noEmit` and `tslint` clean. Full
regression: 213 suites / 3179 tests pass (three intermediate runs showed
unrelated single/dual-suite `mountRouter`/supertest flakiness —
`tnaiAuth.test.ts`, an unrelated file, and `AIService.test.ts` — all
confirmed clean in isolation and on a clean rerun, consistent with this
harness's documented pre-existing flakiness, not a regression from this
change). `npm run build` exits 0, clean `dist/` (278 files, unchanged
count, zero `*.test.js` leaked).

**MUST VERIFY IN PROD:** nothing — the extracted function's ES query body,
URL construction, and response shaping are byte-identical to each
original inline block, verified by both files' existing test suites
(including the exact composed-URL and sent-body assertions in
`home.test.ts`) passing unchanged. `/searchV6`'s real uuid-resolution
difference was deliberately left untouched.

---

## CHANGE 25 — 4 files: previously-unreviewed duplication clusters, safe portions only

Follow-up sweep after the Level 1/2 campaign closed out: three parallel
research passes investigated every remaining file with Sonar-flagged
duplication that hadn't been individually reviewed yet
(`learnerPath.ts`/`learnerPathV2.ts`, `recommendationEngineV2.ts`,
`courseRecommendation.ts`, `appCertificateDownload.ts`, `userReporting.ts`,
`roleActivity.ts`, `publicTelemetry.ts`, `profile-registry.ts`). Most were
confirmed unsafe and left untouched (see below); four had genuine,
zero-impact extractions.

**Confirmed unsafe, deliberately left untouched:**
- `learnerPath.ts` / `learnerPathV2.ts` — same superficial-duplicate-hides-a-real-difference
  pattern as `tnnmcAuth`/`tnnmcAuthV2`: v1 talks to `CONSTANTS.RECOMMENDATION_API_BASE_V2`,
  v2 talks to `CONSTANTS.SB_EXT_API_BASE_2` — different backend services.
- `courseRecommendation.ts` ↔ `recommendationEngineV2.ts`'s `/publicSearch/getcourse` —
  same trust-boundary issue as L2-12: one is mounted on the public router (no auth), the
  other on the protected router (behind auth, its own `PUBLIC_ROLE_RULE` whitelist entry),
  each with its own `pg.Pool`.
- `appCertificateDownload.ts` ↔ `publicCertifcateFlinkv2.ts` — the latter is the file at the
  center of the documented CRITICAL auth-bypass bug (`secretKey` validation, see the L3-19
  entry in `docs/DUPLICATE-CODE-CLEANUP.md`); `appCertificateDownload.ts` has no such check
  at all. A cross-file merge here risks masking or altering that security-sensitive path.
  Also noted, not fixed: `appCertificateDownload.ts`'s missing-`certificateId` 400 response
  has no `return`, so execution falls through to the axios call with `certificateId=undefined`
  in the URL — a real bug, out of scope for this dedup pass.
- `roleActivity.ts` — the remaining duplication is the static seed-data object literals
  themselves (matching shape, different content per role), not logic; same category as
  `whitelistApis.ts`'s Special Case #1. `getAllRoles()` was already ruled out under L1-21.
- `publicTelemetry.ts` ↔ `user/telemetry.ts` (cross-file half) — same trust-boundary issue;
  one route is public, the other sits behind the `user` router's auth. Only
  `publicTelemetry.ts`'s own internal duplication (below) was touched.

**Fixed — genuinely safe, zero impact:**

| File | Change |
|---|---|
| `src/protectedApi_v8/recommendationEngineV2.ts` | 3x identical catch block → `handleRecommendationEngineError(res, err)` |
| `src/publicApi_v8/userReporting.ts` | 6 identical GET-proxy routes → `proxyReportingRoute(req, res, url, errorMessage, buildParams?)` |
| `src/publicApi_v8/publicTelemetry.ts` | `POST /` and `POST /telemetry` (tslint-flagged `no-identical-functions`) → one shared `forwardTelemetry` handler mounted on both paths |
| `src/protectedApi_v8/user/profile-registry.ts` (+ test docstring fix) | `/createUserRegistry` and `/createUserRegistryV2/:userId` → `createOrUpdateUserRegistry(req, res, userId)`, userId resolution stays at each call site |

**Why fixed this way:**
- `recommendationEngineV2.ts`: the three routes' request-building differs
  substantially (query params vs body-forwarding vs Postgres+ES merge vs
  auth-token injection) — only the catch block was byte-identical across
  all three, so only that was extracted.
- `userReporting.ts`: `proxyReportingRoute` takes an optional
  `buildParams: () => any` **thunk**, not a pre-built params object — the
  original `/role/course/recommendation` route only builds its params
  object after the accesskey check passes; a plain parameter would have
  evaluated `req.query` even on the reject-before-check path. The thunk
  preserves the exact original check-then-build ordering.
- `publicTelemetry.ts`: the two handlers had zero variance — not even a
  differing constant — so this needed no parameters at all, just one
  function mounted on both routes.
- `profile-registry.ts`: the test file's own docstring claimed
  `/createUserRegistryV2/:userId` "was not reached in this pass," but a
  full `describe('POST /createUserRegistryV2/:userId', ...)` block already
  existed further down the same file (create/update/failure, mirroring V1)
  — the docstring was simply stale. Fixed the docstring alongside the
  extraction. Two leftover dead debug comments (`// const data = req.body;`,
  `// const deptName = req.body.`) inside the merged branch were dropped —
  noise, not documentation.

**Impact: zero.** Each extraction's own affected test suite was run
immediately after editing: `recommendationEngineV2.test.ts` (11 tests),
`userReporting.test.ts` (30 tests, including the exact `params: {}` /
`params: {profession: 'doctor'}` assertions for the thunk-preserved
ordering), `publicTelemetry.test.ts` (8 tests), `profile-registry.test.ts`
(45 tests, both V1 and V2 create/update/failure paths). `tsc --noEmit` and
`tslint` clean. Full regression: 213 suites / 3179 tests pass (one
intermediate run showed `user.test.ts` failing under full-suite
concurrency — confirmed clean in isolation, 55/55, and clean together with
all 4 touched files' suites, 149/149 — consistent with this harness's
documented pre-existing `mountRouter` flakiness, not a regression).
`npm run build` exits 0, clean `dist/` (278 files, unchanged count, zero
`*.test.js` leaked).

**MUST VERIFY IN PROD:** nothing — every extracted helper reproduces its
original call sites' request/response/error-handling behavior exactly,
verified by each file's own pre-existing (or, for `profile-registry.ts`'s
V2 route, already-present-but-undocumented) test coverage passing
unchanged.

---

## CHANGE 26 — 2 fixes from the whole-branch adversarial validation pass

A dedicated multi-agent validation exercise (deep review + independent
adversarial re-verification, one pass per CHANGE cluster) audited every
CHANGE in this document for hidden behavior differences beyond what
existing tests cover. Full findings: 7 of 8 clusters came back with zero
surviving issues after adversarial re-verification; one HIGH-severity
finding (a try/catch boundary moved outside two extractions in
`myAnalytics.ts`/`profile-registry.ts`) was raised and then **refuted** on
independent re-verification — the adversarial pass traced every code path
in `express-session` and this repo's actual `CassandraStore` and proved
the `req.session === undefined` premise the finding depended on is
structurally unreachable in this deployment, so no fix was needed there.
Two small, real, message/log-only differences did survive both passes and
are fixed here.

**Fix 1 — `conditionalFieldValidator` (CHANGE 22): `facultyType` message
text differed from the original when `role` was entirely absent from the
payload.**

**Issue:** the shared factory's `is: Joi.valid(...triggerRoles)` clause is
not equivalent to the bare-string form (`is: 'Faculty'`) the three
original `facultyType` validators used — the bare-string sugar implicitly
adds `presence: 'required'` to the `is` subschema, so an absent `role`
routes to `otherwise` (field optional) under the old form but to `then`
(field required) under the new one. Bounded impact: `role` is itself
`.required()` in all three schemas, so any payload triggering this was
already a 400 — the only difference was `result.error.message` text (and
the `validationStatusFailedReason` value derived from it), never
accept↔reject.

**Fixed:** `src/utils/orgSignupValidators.ts` — added `.required()` to
the `is` clause: `is: Joi.valid(...triggerRoles).required()`. Verified via
a direct differential harness (bare-string original vs. fixed factory,
2160+ cases across role/field/option combinations in earlier review, plus
a targeted before/after diff for the specific absent-role cases) —
byte-identical error messages in every case, including `{}`,
`{facultyType: ''}`, `{facultyType: null}`. Added a new test,
`'treats an absent role the same as a non-matching role'`, to
`orgSignupValidators.test.ts` closing the coverage gap that let this slip
through the original CHANGE 22 review (no existing test exercised an
absent `role`).

**Fix 2 — `exchangeTokenAndEstablishSession` (CHANGE 23): the merged
token-exchange log line lost the `v2` suffix that distinguished `/auth`
from `/authv2` in logs.**

**Issue:** both routes previously logged distinct strings
(`'Entered into authTokenResponse :'` vs
`'Entered into authTokenResponsev2 :'`) right after the token exchange;
after the CHANGE 23 extraction both call sites used the same string. No
HTTP behavior was affected (the log value itself stringifies to
`[object Object]` either way — the string literal was the only
information the line ever carried), but the discriminator was lost.

**Fixed:** `src/publicApi_v8/emailOrMobileLoginSignIn.ts` — added a
`logLabel: string` parameter to `exchangeTokenAndEstablishSession`, with
`/auth` passing `'Entered into authTokenResponse :'` and `/authv2`
passing `'Entered into authTokenResponsev2 :'`, restoring the exact
original two strings at their original call sites.

**Files:**

| File | Change |
|---|---|
| `src/utils/orgSignupValidators.ts` | `conditionalFieldValidator`'s `is` clause now `.required()` |
| `src/utils/orgSignupValidators.test.ts` | added the absent-role coverage test |
| `src/publicApi_v8/emailOrMobileLoginSignIn.ts` | `exchangeTokenAndEstablishSession` takes a `logLabel` parameter; each call site passes its own original string |

**Impact: zero observable/functional change** — both fixes restore
message/log text to its pre-refactor exact wording; neither changes any
status code, response body, or accept/reject outcome. Verified: `tsc
--noEmit` and `tslint` clean; the 5 directly affected suites pass (71
tests, including the new test); full regression 213 suites / 3180 tests
pass (up from 3179 — the one new test); `npm run build` exits 0, clean
`dist/` (278 files, zero `*.test.js` leaked).

**MUST VERIFY IN PROD:** nothing — both fixes are message/log text
restorations verified byte-identical to the pre-refactor originals.

---

## CHANGE 27 — 4 more self-duplication clusters, plus a false-positive secret-scanner rename

A follow-up research pass targeted files never individually reviewed in
this campaign, specifically excluding `whitelistApis.ts` (a security
table, out of scope) and every file with a confirmed bug already found
this session. Found 4 genuinely safe self-duplication clusters and one
unrelated cosmetic fix.

**Fixed:**

| File | Change |
|---|---|
| `src/protectedApi_v8/frac.ts` | 6 catch blocks → `handleFracError(res, err, message?)`; the one route with a distinct message and an extra `logError` line passes both explicitly |
| `src/protectedApi_v8/competency.ts` | 3 catch blocks → `handleCompetencyError(res, err)`, zero parameters — all 3 were byte-identical, no variance |
| `src/protectedApi_v8/entityCompetency.ts` | 6 catch blocks → `handleEntityCompetencyError(res, error, label, message)`, both varying pieces passed explicitly, original (inconsistent) label casing preserved verbatim |
| `src/protectedApi_v8/playlist.ts` (+ test) | 3 catch blocks → `handlePlaylistError(res, error, label, logUnexpected?)` — `/search`'s catch lacked the "unexpected error" log line `/create`/`/update` both have; preserved via an explicit boolean rather than silently adding or dropping it. Added `logError` call-count assertions to the 3 existing transport-failure tests, since none previously verified this log-line difference directly |
| `src/publicApi_v8/forgotPassword.ts` | renamed `PASSWORD_RESET_FAIL` → `ACCOUNT_RESET_FAIL_MSG` — the IDE's secret-scanner flagged it as a "hard-coded password" purely because of the identifier name; the value is a plain user-facing error string, not a credential. Value unchanged, only the constant name |

**Why fixed this way:** `competency.ts` and `entityCompetency.ts` looked
like a matched pair from their similar names — investigated and confirmed
they are not: different upstream services (`FRAC_API_BASE` vs
`ENTITY_API_BASE`), different auth mechanisms
(`extractAuthorizationFromRequest` vs a bespoke `x-authenticated-user-token`
header), no cross-file merge attempted. `entityCompetency.ts` separately
has a confirmed pre-existing bug (`res.status(response.data.responseCode)`
on the success path — upstream's own `responseCode` field, often a string
like `"OK"`, used directly as an HTTP status, throwing and falling into
the very catch block being extracted here) — the extraction only touches
the catch body, leaves the buggy success-path line untouched, and the
existing tests already assert this bug's current behavior.

**Impact: zero.** Every route's own test suite passed unchanged after its
file's extraction (`frac.test.ts` 23, `competency.test.ts` 10,
`entityCompetency.test.ts` 19, `playlist.test.ts` 18 — the last extended
with 3 new log-assertion checks, not net-new test cases). `tsc --noEmit`
and `tslint` clean (one real finding along the way: a redundant `boolean`
type annotation on a defaulted parameter, fixed). Full regression: 216
suites / 3414 tests pass, unchanged from before this batch. `npm run
build` exits 0, clean `dist/` (278 files, zero `*.test.js` leaked).

**MUST VERIFY IN PROD:** nothing — every extracted helper reproduces its
original call sites' status/body/log behavior exactly, including the one
deliberately-preserved inconsistency (`/search`'s missing "unexpected
error" log line). The `forgotPassword.ts` rename does not change the
constant's value, only its identifier.

---

## CHANGE 28 — round 2 branch-coverage push, 12 files, tests only

Second parallel coverage push, closing the largest remaining gaps left
after CHANGE 26's round 1 — several of the same files (their deferred
`/createUser` flows and similar large sub-branches), plus a few smaller
files never touched. Tests only; zero source-file changes, confirmed by
`git status` and each file's own diff.

**Files and what was added:**

| File | New tests | What's new |
|---|---|---|
| `mpNHMUser.ts` | 13 | full `/createUser` flow (was deferred in round 1) |
| `mobileAppApi.ts` | 33 | 7 whole routes round 1 left uncovered (certificateDownload, courseRecommendationCbp, updateUserProfile, WhatsApp consent ×2, 2 Kong proxy routes) |
| `admin/userRegistration.ts` | 38 | `createUser`/`performNewUserSteps`/`insertBulkUploadStatus` helpers, previously untested despite being exported |
| `upsmfUser.ts` | 7 | remaining `/createUser` role/branch combinations |
| `rcEvents.ts` | 8 | `POST /events/users`' full call graph (role-assign/profile-update failure-but-continue, duplicate-phone recovery) |
| `user/profile-details.ts` | 41 | all 7 routes round 1 explicitly deferred (`/migrateRegistry`, `/createUser`, `/completeUserInfo`, `/v2/updateUser`, 3 more createUser variants) |
| `bnrcUser.ts` | 15 | remaining `getDetailsAsPerRole` switch branches, a retry-then-succeed Postgres path |
| `certifications.ts` | 17 | the upstream-HTTP-error-forwarding branch for 17 routes that only had the network-failure branch covered |
| `user/code.ts` | 2 | the `ce`/`fpJava` verify-type lookup branches |
| `training.ts` | 13 | the upstream-HTTP-error-forwarding branch for 12 routes, one missing network-failure case |
| `utils/apiWhiteList.ts` | 0 | investigated all 19 remaining uncovered conditions and confirmed every one is genuinely unreachable (`executeChecks`'s default-arg and throw branches, checked directly in Node) — documented with evidence rather than forcing a fake test |
| `emailOrMobileLoginSignIn.ts` | 6 | request-body field-combination branches only (caller-supplied vs. auto-generated password, `phone` vs `mobileNumber` fallbacks) — deliberately did not touch `exchangeTokenAndEstablishSession`, already adversarially verified in CHANGE 23/26 |

**Why fixed this way:** every agent was instructed to re-read its file's
CURRENT test suite fully before adding anything (round 1 already extended
most of these once), to never duplicate existing cases, and to assert
documented bugs' current behavior rather than fix or skip them.
`apiWhiteList.ts` is the interesting negative result — rather than
padding the suite, the agent proved via direct Node verification that
`Promise.allSettled` can't take the paths Sonar flags uncovered, and
recorded that evidence as a comment instead of a synthetic test.

**Impact: zero.** Every file's own test suite passed after its
extension. Two new double-send hazards were discovered while writing
tests (`mobileAppApi.ts`'s WhatsApp-consent routes, `userRegistration.ts`'s
`UpdateKeycloakUserPassword` failure-without-`return` path) — both are the
same structural class as the already-documented cases in this file
family, left as `NOTE:` comments rather than exercised live, matching
established convention; no source change. `tsc --noEmit` clean. Full
regression: 216 suites / 3570 tests pass (up from 3414). One transient
`mountRouter`-harness failure appeared on one coverage-instrumented run
and was gone on immediate rerun — the established pattern throughout this
whole campaign, not a regression (confirmed via 3 consecutive clean runs
before trusting the result). `npm run build` exits 0, clean `dist/` (278
files, unchanged count, zero `*.test.js` leaked).

**MUST VERIFY IN PROD:** nothing — tests-only change, zero source files
touched in this batch.

---

## CHANGE 29 — duplication reduction push toward a <5% target, clusters A–C

**Issue:** Sonar duplication was 13.9% (5,923 duplicated lines). User asked
to push toward under 5%. A research pass mapped every remaining duplicate
block precisely and found the realistic safe ceiling from cross-file
extraction is roughly 10.5–11.5%, not under 5% — the shortfall is concrete
and reported below, not assumed. Clusters A–C below are the safest,
highest-confidence extractions from that research and are complete; the
larger clusters (org-signup trio, SSO login family) are separately tracked
and were not part of this batch.

**Cluster A — `learnerPath.ts` / `learnerPathV2.ts`.** The two files were
identical except the upstream base URL constant and log-message text.
Extracted `createLearnerPathRouter(apiBase, versionLabel)` into new file
`utils/learnerPathRouterFactory.ts`; both route files now call it with
their own constant. Internally split into `registerUpdateLearnerPathRoute`/
`registerGetLearnerPathRoute` to keep cognitive complexity under the
Sonar-enforced threshold of 15. Both `.ts` files' own test suites pass
unchanged (proving byte-identical externally observable behavior); the
factory also got a direct unit test with a third, arbitrary
apiBase/versionLabel pair.

**Cluster B — `fetchUserBymobileorEmail` widened to 6 more files.** The
function already lived in `utils/fetchUserExists.ts` (CHANGE 10), scoped to
4 files. Confirmed via direct diff that `tnaiAuth.ts`, `tnnmcAuth.ts`,
`tnnmcAuthV2.ts`, `sashaktAuth.ts`, `maternityFoundationAuth.ts` all carried
a byte-identical local copy, and `signupWithAutoLoginOrgForm.ts` carried a
behaviorally-equivalent one (its `catch` block explicitly `return false`
where the shared helper implicitly returns `undefined` — both call sites
only ever use the result in a truthiness check, so the difference is not
observable). All 6 files now import the shared helper; each local copy and
its now-dead `fetchUserByEmail`/`fetchUserByMobileNo` API_END_POINTS
entries were removed, along with the now-unused `lodash` import in each.
Every one of the 6 files' own test suites passed unchanged.

**Cluster C — certificate PNG-render tail shared between
`appCertificateDownload.ts` and `publicCertifcateFlinkv2.ts`.** The block
from the `DOWNLOAD_CERTIFICATE` axios call through the SVG-dimension
parsing, `nodeHtmlToImage` call, and `res.writeHead`/`res.end`/throw was
byte-identical between the two files. Extracted to
`fetchAndRenderCertificate(res, certificateId, certificateName)` in new
file `utils/certificateRenderer.ts`. Each caller keeps its own
certificateId/certificateName resolution (`publicCertifcateFlinkv2.ts`'s
Cassandra lookup + secret-key check vs. `appCertificateDownload.ts`'s raw
query params) and its own catch-block response shape untouched — the
pre-existing documented bugs in both files (missing `return` after
validation failures, the secret-key check not actually blocking, CQL
injection via unescaped query params — all previously logged in this
document) are unchanged, since only the shared render tail moved. Both
files' own test suites passed unchanged; the new helper also got 2 direct
unit tests (success path, non-OK-responseCode throw path).

**A 4th new-code Sonar issue surfaced and was fixed:** the extracted
`learnerPathRouterFactory.ts`'s `err && err.response && err.response.status`
pattern (copied verbatim from both originals) tripped the modern
"prefer optional chaining" rule because it's now in a brand-new file
subject to the new-code quality gate — the identical pattern is untouched
elsewhere in the codebase since those files are outside the new-code
window. Changed to `err?.response?.status` / `err?.response?.data`, which
is semantically identical (both short-circuit to `undefined` on any falsy
link, only ever consumed via `|| fallback`). No behavior change; fixes the
gate back to OK.

| File(s) | What changed |
|---|---|
| `protectedApi_v8/learnerPath.ts` | body replaced with a call to the new shared factory |
| `protectedApi_v8/learnerPathV2.ts` | body replaced with a call to the new shared factory |
| `utils/learnerPathRouterFactory.ts` | **new** — shared router factory + its own test file |
| `publicApi_v8/tnaiAuth.ts` | local `fetchUserBymobileorEmail` replaced with the shared import |
| `publicApi_v8/tnnmcAuth.ts` | local `fetchUserBymobileorEmail` replaced with the shared import |
| `publicApi_v8/tnnmcAuthV2.ts` | local `fetchUserBymobileorEmail` replaced with the shared import |
| `publicApi_v8/sashaktAuth.ts` | local `fetchUserBymobileorEmail` replaced with the shared import |
| `publicApi_v8/maternityFoundationAuth.ts` | local `fetchUserBymobileorEmail` replaced with the shared import |
| `publicApi_v8/signupWithAutoLoginOrgForm.ts` | local `fetchUserBymobileorEmail` replaced with the shared import |
| `utils/fetchUserExists.ts` | `sonar-cleanup` tag widened to note the 6 new callers |
| `publicApi_v8/appCertificateDownload.ts` | body replaced with a call to the new shared render helper |
| `publicApi_v8/publicCertifcateFlinkv2.ts` | body replaced with a call to the new shared render helper |
| `utils/certificateRenderer.ts` | **new** — shared certificate fetch+render helper + its own test file |

**Impact: zero.** Every touched file's own pre-existing test suite passed
with zero test changes required (proof of byte-identical/behaviorally-
identical external behavior), plus 3 new direct unit test files added for
the 2 new shared modules. `tsc --noEmit` clean on both `tsconfig.json` and
`tsconfig.spec.json`. Full regression: 218 suites / 3573 tests pass (up
from 3570 — 1 skipped). One transient `mountRouter`-harness failure
appeared on `sashaktAuth.test.ts` mid-campaign and was gone on 5
consecutive isolated reruns plus 2 consecutive full-suite reruns — the
established flake pattern, not a regression. `npm run build` exits 0,
clean `dist/` (270 files, up from 269 for the new `certificateRenderer.ts`,
zero `*.test.js` leaked).

**Sonar result:** duplication 13.9% → **12.6%** (556 fewer duplicated
lines, 5,923 → 5,367), coverage steady at 93.1%, quality gate **OK**
(after the optional-chaining fix above — briefly ERROR on the first scan
due to the 4 new-code issues, none of which were duplication-related).

**MUST VERIFY IN PROD:** nothing — every change is a body-for-body
extraction with call sites re-pointed to shared functions; no request/
response shape, URL, header, or status-code logic changed.

---

## CHANGE 30 — duplication reduction, cluster D: the org-signup trio

**Issue:** `upsmfUser.ts` / `mpNHMUser.ts` / `bnrcUser.ts` (UP-SMF, MP-NHM,
BNRC org-signup flows) are the single largest concentration of remaining
Sonar duplication — 1651 of the pre-CHANGE-29 5,923 duplicated lines came
from this trio alone, since they were clearly built by copy-pasting one
org's file to create the next. New file `utils/orgSignupHelpers.ts` now
holds 6 shared functions; each org's file calls them with its own
org-specific config instead of repeating the logic. **Every genuine
difference between the three orgs was kept as an explicit parameter — none
were force-merged.**

**D-1 — `getUserDetails(phone)`.** Verified byte-identical across all 3
files (diffed directly, zero differences). Moved as-is; no parameters
needed beyond `phone`, since `API_END_POINTS.userSearch` already comes
from the shared `utils/orgSignupConstants.ts` (a pre-existing dedup from
before this campaign).

**D-2 — `createUser` / `assignRoleToUser`.** Near-identical; two real
differences preserved as parameters: `orgLabel` reproduces each org's log
message (`'Create user upsmf body'` / `'... MP body'` / `'... bnrc body'`),
and `timeoutMs` reproduces `mpNHMUser.ts`'s real `timeout: 60000` on both
its axios calls — `upsmfUser.ts`/`bnrcUser.ts` pass no timeout, matching
their original calls exactly (verified via a direct unit test asserting
`callArgs.timeout` is `undefined` in the no-timeout case and `60000` in
the timeout case). `getDetailsAsPerRole`/`getOrgId` stay function
parameters, since each org's role-to-org mapping genuinely differs
(separate `upsmfUtils.ts` / `mpUtils.ts` / bnrc's own local function).

**D-3 — the OTP trio (`sendOtp`/`resendOtp`/`validateOtp`), scoped
conservatively.** Reading all 9 handlers in full (not just the earlier
research estimate) found this family is messier than a clean
label-swap: `bnrcUser.ts` is clearly the original template that
`upsmfUser.ts`/`mpNHMUser.ts` were copy-pasted from, with **inconsistent
find-replace** — several log lines in the UPSMF and MP-NHM files still
literally say `'for BNRC'` (e.g. `upsmfUser.ts`'s `sendOtp` logs `'Entered
into Send OTP for BNRC >>>>>'`; `mpNHMUser.ts`'s `validateOtp` logs
`'...validate OTP for BNRC'` and `logError('...for BNRC', ...)`), catch
blocks inconsistently call `logError` vs `logInfo` with different message
formats, and some handlers have log lines others lack entirely. Forcing
all of that into one shared route factory risked either silently "fixing"
these pre-existing copy-paste bugs or subtly mismatching one of the 9
combinations on a live OTP-delivery path. **Scoped the extraction to only
the genuinely identical part: the raw MSG91 axios call** (headers/params/
URL/method), which *is* byte-identical across all 9 handlers since
`msg91Headers`/`indianCountryCode`/`API_END_POINTS` already come from the
shared constants file. Added `sendMsg91Otp(phone)` / `resendMsg91Otp(phone)`
/ `verifyMsg91Otp(phone, otp)`. Every log line, org-name bug, and
log-function choice was left untouched in each file — these are
pre-existing bugs, not something this cleanup pass should fix without
separate sign-off.

**D-4 — `migrateUserToUpsmf` / `migrateUserToMp` / `migrateUserToBnrc`.**
Diffed directly: only 2 real differences per pair — the postal-address
state literal (`'Uttar Pradesh'` / `''` / `'Bihar'`, preserved via a
`stateLabel` parameter, including MP-NHM's empty string producing the
exact original `` `India, , ${district}` `` text) and the catch-block log
message's org name (`orgLabel` parameter, reproducing `'Error while
migrating user to UPSMF/MP/BNRC org'` verbatim). `getOrgName`/
`getDesignation` stay function parameters for the same per-org-mapping
reason as D-2.

| File(s) | What changed |
|---|---|
| `utils/orgSignupHelpers.ts` | **new** — `getUserDetails`, `createOrgSignupUser`, `assignOrgSignupUserRole`, `sendMsg91Otp`, `resendMsg91Otp`, `verifyMsg91Otp`, `migrateOrgSignupUser`, plus its own test file (14 tests) |
| `publicApi_v8/upsmfUser.ts` | 6 local functions replaced with calls to the shared helpers, passing UPSMF's own config/labels |
| `publicApi_v8/mpNHMUser.ts` | 6 local functions replaced with calls to the shared helpers, passing MP-NHM's own config/labels (including its real 60s axios timeout) |
| `publicApi_v8/bnrcUser.ts` | 6 local functions replaced with calls to the shared helpers, passing BNRC's own config/labels |

**Impact: zero.** Every one of the 3 files' own pre-existing test suites
passed with zero test changes required — direct proof that the externally
observable behavior (including the preserved copy-paste bugs) is
unchanged. `tsc --noEmit` clean on both `tsconfig.json` and
`tsconfig.spec.json`. `tslint` clean (fixed 2 real findings along the
way: an `any`-typed parameter replaced with a minimal structural
interface, and an object-key alphabetical-order violation). Full
regression: 219 suites / 3588 tests pass (up from 3582), confirmed on 2
consecutive full runs. `npm run build` exits 0, clean `dist/` (271 files,
zero `*.test.js` leaked). Line count for the trio dropped from
1100/1035/1036 (3171 total) to 960/894/897 (2751 total) — 420 lines moved
into the shared helper file.

**MUST VERIFY IN PROD:** nothing — every change is a body-for-body
extraction with call sites re-pointed to shared functions and every
genuine per-org difference threaded through as an explicit parameter; no
request/response shape, URL, header, timeout, or status-code logic
changed for any of the 3 orgs.

---

## CHANGE 31 — duplication reduction, clusters E and F

**Cluster E — `updateRoles` shared between `signupWithAutoLoginV2.ts` and
`appSignUpWithAutoLogin.ts`.** Diffed directly: byte-identical, both use
`axiosRequestConfigLong` and the fixed org id `'0132317968766894088'`.
`signupWithAutoLogin.ts` (v1) has its own separate `updateRoles` using
`axiosRequestConfig` (not `Long`) — a genuine difference already noted in
this file's CHANGE 10 comment — and stays unmerged, matching the existing
`createAccount`/`profileUpdate` precedent exactly. Added `updateRoles` to
the existing shared `utils/signupAccountHelpers.ts` (previously had no
direct test file despite being shared by 3 routes — added one, including
a concurrency test for 2 orgs calling it at once).

**Cluster F — Keycloak token-exchange tail shared across `tnaiAuth.ts`,
`tnnmcAuth.ts`, `sashaktAuth.ts`, `maternityFoundationAuth.ts`.** Reading
all 4 handlers in full found real, meaningful divergence in what
surrounds the token exchange: the auth-fail status code differs (302 in 3
files, 400 in `maternityFoundationAuth.ts`), the catch-block behavior
differs (silent in one, an immediate 400 return in another, a
redirect-URL fallback in two others), and the final response shape
differs (with/without a `resRedirectUrl` field) — including a
pre-existing documented double-send bug tied to this exact shape in 3 of
the 4 files. Rather than force all of that into one parameterized
function (high risk of subtly wiring the wrong behavior to the wrong
org on live external-partner SSO endpoints), only the genuinely identical
middle section was extracted into new file
`publicApi_v8/ssoKeycloakExchange.ts`: build the password-grant request →
exchange it → decode the token → establish `req.session`/`req.kauth` →
fetch roles. It returns the access token on success or `undefined` on a
falsy token response, matching every caller's own
`if (authTokenResponse.data)` check exactly — each caller keeps its own
status code, catch behavior, and response shape untouched.

| File(s) | What changed |
|---|---|
| `utils/signupAccountHelpers.ts` | added `updateRoles`, plus a new direct test file (7 tests incl. 1 concurrency test) |
| `publicApi_v8/signupWithAutoLoginV2.ts` | local `updateRoles` replaced with the shared import; dead `axiosRequestConfigLong` import removed |
| `publicApi_v8/appSignUpWithAutoLogin.ts` | local `updateRoles` replaced with the shared import; dead `axiosRequestConfigLong` import removed |
| `publicApi_v8/ssoKeycloakExchange.ts` | **new** — shared token-exchange helper, plus its own test file (5 tests incl. 1 concurrency test) |
| `publicApi_v8/tnaiAuth.ts` | token-exchange block replaced with a call to the shared helper; dead `qs`/`jwt_decode`/`getCurrentUserRoles` imports and the dead `generateToken` endpoint entry removed |
| `publicApi_v8/tnnmcAuth.ts` | same as above |
| `publicApi_v8/sashaktAuth.ts` | same as above |
| `publicApi_v8/maternityFoundationAuth.ts` | same as above |

**Impact: zero.** All 5 touched route files' own pre-existing test suites
passed with zero test changes required (including `tnnmcAuthV2.test.ts`,
untouched but re-run to confirm no side effects). `tsc --noEmit` and
`tslint` clean on both configs. Full regression: 222 suites / 3610 tests
pass, confirmed on 2 consecutive runs. `npm run build` exits 0, clean
`dist/` (272 files, zero `*.test.js` leaked).

**MUST VERIFY IN PROD:** nothing — every caller's own status code, catch
behavior, and response shape is byte-for-byte unchanged; only the shared
middle section moved.

---

## CHANGE 32 — dead-code removal (3-month-inactivity rule)

**Context:** a two-pass dead-code sweep. The first pass (manual grep) produced
2 confirmed **false positives** — `getMyAnalyticsLearningHistory` in
`user/myAnalytics.ts` (actually live, passed as Express middleware by bare
reference rather than called with parens, so a naive grep for
`functionName(` missed it) and 4 interfaces in `myAnalytics.model.ts`
(actually used transitively as property types inside `IMyAnalytics`,
which itself is imported and used — TypeScript types can be "used"
without their name ever appearing in an importing file). Given that, a
second pass used `ts-prune` (AST-based unused-export detection, aware of
transitive type usage) instead of grep, cross-checked against `git log -1`
per file/symbol so **nothing touched in the last 3 months was
removed**, even if flagged as unused — protecting recent or
still-in-progress work.

**Two genuinely-dead-but-tested items were found and deliberately
NOT removed**, flagged for a separate team decision instead:
`authorizationV2Api.ts` (2022) and `searchUser.ts`'s `fetchUser` (2021) —
both have zero real callers, but each already has a full test suite
someone deliberately wrote (`authorizationV2Api.ts`'s own test file
documents it as "likely superseded by ssoLogin.ts's `/login` route, which
does the same sequence inline" — investigated and left in place by an
earlier pass in this same campaign). Recent test investment is treated as
a signal of intent, same spirit as the 3-month rule for code changes.

**Two rounds of transitive-cascade checking were needed.** After the
first round of removals, re-running `ts-prune` surfaced 2 more items that
had only appeared "used" because the thing that used them was itself
being removed in the same batch: `IResourceSbExt` in `playlist.model.ts`
(only referenced by `IPlaylistSbExt`, which was itself dead) and 4 exports
in `authoring/models/content-model.ts` — `IContentUserDetails`,
`TMimeTypes`, `TLearningMode`, `TStatus` (only ever imported by
`authoring/models/response/search-model.ts`, which was deleted in the
same batch as a whole orphaned file). Removing those made
`content-model.ts` itself fully dead, so the whole file was removed too.
A third `ts-prune` run after fixing both showed zero further diff —
confirmed stable.

**What was removed:**

*Whole files (never imported anywhere, 2021–2026-07 vintage, all past the
3-month bar):*
- `models/search.model.ts` (empty, 0 bytes)
- `models/account-settings.model.ts` (`IAccountSettings`, `IAccountSocialDetails`)
- `models/learningHistory.model.ts` (`ILearningHistory`, `ILearningHistoryItem`)
- `authoring/models/response/search-model.ts` (5 interfaces)
- `authoring/models/content-model.ts` (`IContent` + the 4 cascade-orphaned exports above)
- `utils/test.ts` + `utils/test.test.ts` — a placeholder object (`{key:'a',key1:'b',key2:'c'}`) from the initial 2021 commit
- `authoring/authBackend.ts` + `authoring/authBackend.test.ts` — a full HTTP-proxy-passthrough router, never mounted in `server.ts`; `authApi` (from `authoring/content/index.ts`) is mounted at the same `/authApi` path instead and appears to have superseded it

*Specific symbols only (file stays, still has live exports):*
| File | Removed |
|---|---|
| `models/catalog.model.ts` | `ICatalogItem` |
| `models/content.model.ts` | `IContact`, `IRecommendationResponse`, `EDisplayContentType` |
| `models/goal.model.ts` | `IGoalUpsertRequest`, `IGoalUpsertSbExt`, `IProgressResource` |
| `models/playlist.model.ts` | `EPlaylistTypes`, `IPlaylistSbExt`, `IResourceSbExt` (cascade), `IPlaylistSbUpdateRequest`, `IPlaylistUpdateTitleRequest`, `IPlayListContentResource` (cascade), `IPlayListUpdateRequest`, `IPlaylistResource` (cascade), `IPlaylistShareRequestSbExt`, `IPlaylistShareRequest` |
| `models/topic.model.ts` | `IInterestApiResponse` |
| `models/user.model.ts` | `IUserPreferencesResponse`, `IUserPreferences` (cascade), `IUserRolesResponse`, `IUserTncResponse`, `IUserLoggedIn`, `IUserProfileResult`, `IUser` |
| `models/myAnalytics.model.ts` | `ICreateObj`; `IUserProgressResponse` + cascade (`IGoalProgress`, `IGoalsShared`, `ILearningHistory`, `ILearningHistoryProgress`, `IPlaylistProgress`, `IPlaylistShared`, `ITopContentByJl`); `INsoResponse` + cascade (`IArtificatsShared`, `IExpertsContacted`, `IFeatureUsageStatistics`, `INsoRoles`, `IPlayGroundDetails`, `IContentCreated`) — `INsoContentProgress` kept, genuinely used externally in `user/myAnalytics.ts` |
| `protectedApi_v8/catalog.ts` | `ITerms` (cascade), `ICatalogResponse` |

Every removed item is compile-time-only (a TypeScript interface/type/enum
with zero runtime footprint) or a fully-unmounted router/placeholder
object — none of it executes in production either before or after
removal.

**Excluded regardless of dead-status (too recent — within 3 months):**
`test-support/authFixtures.ts` (12 days old at time of check),
`roleActivity.ts` and `content.ts` (both 4 days old — this very campaign's
own recent work), `contentSearchService.ts` (~5 weeks old).

**Reclassified, not dead code:** several exports flagged by the first
manual pass as "unused" (`roleActivity.ts`, `cohorts.ts`, `catalog.ts`'s
`ICatalogResponse` before deeper checking, `content.ts`'s
`VALID_HIERARCHY_TYPES`/`getContentMeta`) turned out to be used — just
only from within their own file, not from outside it. That's an
export-visibility nitpick, not dead code; left untouched.

**Impact: zero.** `tsc --noEmit` clean on both `tsconfig.json` and
`tsconfig.spec.json` (confirms no dangling references from the
dependency tracing above). `tslint` clean, including one real fixed
finding (an unused `EMimeTypes`/`TContentType` import left behind after
`playlist.model.ts`'s cascade removal). Full regression: 220 suites (down
from 222 — the 2 deleted `.test.ts` files) / 3606 tests pass (down from
3610, since no test asserted behavior of dead code), confirmed on 3
consecutive runs. `npm run build` exits 0, clean `dist/` (265 files, down
from 272 — the 7 whole files removed net of one file created in CHANGE
31, zero `*.test.js` leaked). A final `ts-prune` diff against the
pre-removal baseline confirmed zero unexpected new findings — only the
intentionally-removed items disappeared.

**MUST VERIFY IN PROD:** nothing — every removed symbol was confirmed
unreferenced by both grep and an AST-aware tool, and none of it compiles
to any runtime code path. `authBackend.ts`'s router was the only
non-type removal; it was never mounted, so removing it cannot change any
live route's behavior.

---

## CHANGE 33 — duplication reduction, next tier: 5 clusters (B, C, D, A, E)

Continuation of the reduction campaign into files never previously
researched (`social.ts`, `mobileAppApi.ts`, `network.ts`, `connections_v2.ts`,
`publicSearch.ts`, `ratingsSearch.ts`, the `signupWithAutoLogin*` family).
A research pass mapped 5 clusters with real, verified duplicate blocks
before any code was touched; executed lowest-risk first.

### Cluster B — `network.ts` + `connections_v2.ts`

`connections_v2.ts` already had `handleConnectionsError` (CHANGE 17);
`network.ts` still had the identical inline catch body repeated in all 9
routes — added the same pattern locally as `handleNetworkError` (kept
file-local per this codebase's established convention, not shared
cross-file, since each file's `unknown` message text differs). Separately,
5 GET routes (`requested`, `requests/received`, `established`,
`established/:id`, `suggests`) hit byte-identical Kong endpoints in both
files with the same header shape — extracted to
`utils/connectionsListFetch.ts`'s `fetchConnectionsList(req, res, endpoint,
userId)`. `userId` is passed in already-resolved rather than resolved
inside the helper, since the two files use genuinely different extractors
(`extractUserIdFromRequest` reads `req.session.userId`;
`connections_v2.ts`'s `/suggests` route uses `extractUserId`, which reads
Keycloak claims from `req.kauth` instead). The 3 POST routes
(`/add/connection`, `/update/connection`, `/connections/recommended/
userDepartment`) were confirmed to use genuinely different request-body
contracts and even different upstream backend services between v1/v2 —
left untouched.

### Cluster C — `mobileAppApi.ts`, 5 independent sub-clusters

1. **Kong CDN-replacement pair** (`/kong/course/v2/hierarchy/*` /
   `/kong/content/v1/read/*`) — byte-identical aside from the path
   segment, log prefix, and error-fallback message. Extracted to
   `fetchAndReplaceCdnUrls`. The `backendUrl` variable (built with the
   query string re-appended, then only logged — the real request relies
   on axios's own `params: req.query`) is preserved verbatim as existing
   debug-logging behavior, not "fixed."
2. **7-occurrence catch-block family** (`/publicSearch/
   courseRecommendationCbp`, the 5 `*/homepageconfig` routes,
   `/user/enrollment/list/adhocCertificates`) — extracted to
   `handleMobileApiDefaultError(res, err, logErrorPrefix?)`; 5 of the 7
   originals call `logInfo('error', ...)`, the other 2 call
   `logInfo(...)` with no prefix — the optional parameter preserves both
   forms exactly.
3. **3 ratings POST routes** (`/ratings/upsert`, `/ratings/v2/read`,
   `/ratings/ratingLookUp`) share an identical POST-with-body shape —
   extracted to `proxyRatingsPostRoute`. `/ratings/summary` (GET, upfront
   validation, no body) is genuinely different and stays untouched.
4. **cmi5/v2 progress-read tail** (`/cmi5/updateProgress`,
   `/cmi5/readProgress`, `/v2/updateProgress`) — the stateReadBody-build +
   READ_PROGRESS-call + 200-response tail is byte-identical across all 3;
   extracted to `fetchAndSendProgressRead`. The surrounding
   `if (accesTokenResult.status == 200) { ... }` wrapper in the two
   updateProgress routes — which has **no else branch**, a pre-existing
   bug where a non-200 token silently sends no response — is left
   completely untouched in each caller.
5. **`/ios/certificateDownload` wired as a 3rd caller of the existing
   `certificateRenderer.ts`** (CHANGE 29's shared helper, previously used
   by `appCertificateDownload.ts` and `publicCertifcateFlinkv2.ts`) — its
   fetch+render tail was confirmed byte-identical, including the same
   `DOWNLOAD_CERTIFICATE` URL construction. The dead `DOWNLOAD_CERTIFICATE`
   `API_END_POINTS` entry and the now-fully-unused `nodeHtmlToImage`
   import were removed as a consequence.

### Cluster D — `publicSearch.ts` ↔ `ratingsSearch.ts`

Direct diff confirmed the **entire** `/getCourses` query branch
(`if (courseSearchRequestData.request.query) { ... }`, ~100 lines each,
including the final `_.uniqBy` + response) is byte-identical between the
two files — both already shared `createSearchPgPool()` (CHANGE 20) and
both are public-router (no trust-boundary concern). Extracted to
`utils/courseQuerySearch.ts`'s `searchCoursesByQuery`, with `pool` passed
in as a parameter rather than created inside the helper, so each file
keeps managing its own Postgres pool exactly as before. The no-query
branch's 3 real differences (`publicSearch.ts` adds a `contentType`
filter and uses `limit: 200`; `ratingsSearch.ts` uses `limit: 20` and
enriches results via `getCombinedRatingsResult`) stay untouched in each
file.

### Cluster A — `social.ts`, 23 of 25 routes

The largest single extraction this session. All 23 routes shared the
identical `org`/`rootOrg` header guard → body-merge → `axios({...})` call
→ status/body-forward shape, differing only in HTTP method, upstream
endpoint, an optional extra merged body field, timeout presence, and
error-log label. Extracted to `proxySocialRoute(req, res, method, url,
{extraFields?, timeout?, label?})`. Every genuine per-route difference was
threaded through explicitly: `/catalog`'s field is the lowercase `userid`
(not `userId`); `/post/timelineV2`'s userId is
`req.query.wid || extractUserIdFromRequest(req)`, not a plain extractor
call; `moderatorId`/`adminId`/`forumCreator`/`forumEditor` are each their
own route's field; `/edit/meta` and `/post/delete` keep their own logged
error label; the 2 DELETE routes (`/post/delete`,
`/admin/deletePost` — the latter previously used `axios.delete(url,
{...config, data})`, confirmed functionally equivalent to the unified
`axios({...config, data, method: 'DELETE', url})` form used everywhere
else) use `method: 'DELETE'`. `/post/upload/:contentId` (multipart,
callback-based `.submit()`, not axios) and `/post/autocomplete`
(org/rootOrg sent as headers, not merged into the body) are structurally
different and stay fully untouched.

Given the size and risk of this cluster, the existing table-driven test
suite (which only verified response-forwarding shape) was extended with
15 new tests asserting the actual request each route builds — the exact
extra-field key/value per route, which routes set the `SOCIAL_TIMEOUT`
override and which rely on `axiosRequestConfig`'s own default timeout
instead, which 2 routes log with their own label, and a concurrency test
proving 3 simultaneous requests to different routes never leak each
other's extra fields. `file.ts` dropped from 656 to 325 lines.

### Cluster E — `signupWithAutoLogin.ts` / `V2` / `appSignUpWithAutoLogin.ts`, OTP tails

**E-1 (OTP-dispatch tail, all 3 files).** Diffed directly: the
phone-then-email OTP-send block is byte-identical across all 3 files,
except `appSignUpWithAutoLogin.ts`'s two success responses include one
extra field (`userUUId: userId`) the other two don't. Extracted to new
file `publicApi_v8/signupOtpDispatch.ts`'s `sendRegistrationOtp(res,
userPhone, userEmail, userId, extraSuccessFields?)`.

**E-2 (OTP-verify tail, v1 + v2 only).** Diffed directly: the
phone-then-email OTP-verify block is byte-identical between
`signupWithAutoLogin.ts` and `signupWithAutoLoginV2.ts`.
`appSignUpWithAutoLogin.ts`'s verify flow is structurally different (no
`session.save`/`regenerate` wrapping, a different response shape) and was
excluded. **A real bug was found and fixed during this extraction, not
merely refactored around:** the original code used
`return res.status(400).json(...)` inside the verify block on a
failure — a `return` that exits the **entire route handler** immediately.
A naive extraction returning a plain boolean loses that early-exit:
`signupWithAutoLoginV2.ts`'s caller has an `else` branch that ALSO sends
a response when the result is falsy, and a first version of this
extraction caused a double `res.send` there (caught by the existing test
suite — `signupWithAutoLoginV2.test.ts` failed with "Cannot set headers
after they are sent"). Fixed by having `verifyRegistrationOtp` return
`undefined` specifically for "a response was already sent, caller must
return immediately," distinct from `false` ("neither phone nor email was
provided, continue with your own existing true/false handling" — which
differs by file: v2 has an `else` sending a 400 for that case,
`signupWithAutoLogin.ts` has no such else, a separate pre-existing gap
left untouched). Both callers now do
`if (userOtpVerified === undefined) return` before their own
`if (userOtpVerified) {...}` logic. 6 new tests were added specifically
covering this, including 2 that directly assert exactly one `res.status`
call on a verification failure.

**E-3 (Keycloak-exchange tail, v2 only) — deliberately NOT extracted.**
`signupWithAutoLoginV2.ts`'s block superficially matches the shared
`ssoKeycloakExchange.ts` helper (CHANGE 31) — same client_id/client_secret/
grant_type/scope/username shape, same decode+session+roles sequence — but
reading it in full found 4 real logging differences from the shared
helper's existing 4 callers: a missing `logInfo(userId, 'userid...')`
line, a differently-worded final success log, a differently-worded
"entered into authorization part" log that also wraps an
already-a-string value in `JSON.stringify` (producing different logged
text than the shared helper's plain concatenation), and an extra
intermediate log line the shared helper doesn't have. Given the OTP-verify
work in this same cluster had just demonstrated how easily a
looks-safe merge can introduce a live double-send bug, and the shared
helper already serves 4 stable callers that parameterizing further would
put at risk, this was judged not worth the ~35-line gain and left as-is.

| File(s) | What changed |
|---|---|
| `protectedApi_v8/network.ts` | 9 catch blocks + 5 GET routes replaced with shared calls |
| `protectedApi_v8/connections_v2.ts` | 5 GET routes replaced with the shared import |
| `utils/connectionsListFetch.ts` | **new** — shared GET-route helper + test file (incl. concurrency test) |
| `publicApi_v8/mobileAppApi.ts` | 5 sub-clusters extracted/wired (see above) |
| `publicApi_v8/publicSearch.ts` | query branch replaced with the shared import |
| `publicApi_v8/ratingsSearch.ts` | query branch replaced with the shared import |
| `utils/courseQuerySearch.ts` | **new** — shared query-branch helper + test file (incl. concurrency test) |
| `protectedApi_v8/social.ts` | 23 routes replaced with `proxySocialRoute` calls; file 656 → 325 lines |
| `protectedApi_v8/social.test.ts` | +15 tests verifying exact request construction per route + 1 concurrency test |
| `publicApi_v8/signupWithAutoLogin.ts` | OTP-dispatch + OTP-verify tails replaced with shared imports |
| `publicApi_v8/signupWithAutoLoginV2.ts` | same, plus the double-send fix |
| `publicApi_v8/appSignUpWithAutoLogin.ts` | OTP-dispatch tail replaced with the shared import (`userUUId` extra field) |
| `publicApi_v8/signupOtpDispatch.ts` | **new** — shared OTP-dispatch/verify helpers + test file (13 tests incl. the double-send regression tests) |

**Impact: zero.** Every touched route's own pre-existing test suite
passed with zero test changes required, except `social.test.ts` (extended
with deeper assertions, not changed) and `signupWithAutoLoginV2.test.ts`
(which caught the real bug above during development — fixed before this
batch was considered done, not shipped with a known issue). `tsc --noEmit`
and `tslint` clean on both configs. One further real fix: 2 new-code Sonar
findings in `mobileAppApi.ts`'s newly-extracted functions (the same
`err && err.response...` → `err?.response?...` optional-chaining pattern
fixed in earlier changes) — semantically identical, fixed to restore the
gate to OK. Full regression: 223 suites / 3644 tests pass (up from 220 /
3606 before this batch), confirmed on 3 consecutive runs including 2
coverage-instrumented runs. `npm run build` exits 0, clean `dist/` (268
files, zero `*.test.js` leaked).

**Sonar result:** duplication **11.3% → 8.3%** (1,312 fewer duplicated
lines, 4,731 → 3,419; 68 fewer blocks, 224 → 156), coverage steady at
93.2%, quality gate **OK**.

**MUST VERIFY IN PROD:** nothing — every extraction is a body-for-body
move with every genuine per-route/per-file difference threaded through as
an explicit parameter; the one real behavioral bug found
(signupWithAutoLoginV2.ts's double-send) was fixed, not shipped, and is
covered by new regression tests.

---

## CHANGE 34 — duplication reduction: discussionHub topics.ts/posts.ts catch blocks

**What:** `topics.ts` (6 routes) and `posts.ts` (1 route) each inlined the
same catch-block shape already extracted in this directory's own
`writeApi.ts` as `handleWriteApiError(res, err, label)` (originally CHANGE
8): `logError(label, err)` then
`res.status((err && err.response && err.response.status) || 500).send((err && err.response && err.response.data) || {})`.
`handleWriteApiError` is now exported from `writeApi.ts` and imported
directly by both files, replacing all 7 inlined copies.

**Why not a file-local copy instead (the Cluster B precedent)?** Cluster B
(`network.ts`/`connections_v2.ts`) kept near-identical error handlers
file-local because each file's own message text differed. Here the shape
is truly identical — same empty-object fallback, no message-text
differences beyond the `label` parameter the function already accepts —
so a cross-file import is the more direct fit and doesn't add a second
near-duplicate helper.

**Pre-existing bug preserved verbatim, not fixed:** `topics.ts`'s
`/unread/total` route's catch block already logged the wrong label
(`'ERROR ON GET topicsApi /unread >'` instead of `.../unread/total >'`) —
a copy-paste artifact from the `/unread` route above it. This label text
is passed through unchanged to `handleWriteApiError`; only the
call-site mechanics changed, not the message.

**Impact:** ~21 duplicated lines removed (7 call sites × 3 lines each,
collapsed to 1-line calls). No behavioral change — verified via each
file's existing test suite, which already asserts exact status/body on
both success and failure paths.

**Testing:** `discussionHub` suite (8 files, 94 tests) green, unchanged
(no new tests needed — existing coverage already asserts the exact
status/body on the failure path per route). Full suite run 3× (3653
passed; one `bulkUploadUser.test.ts` failure on run 2 was a transient
`mountRouter`-harness flake, confirmed clean in isolation and on runs 1
and 3 — not a regression, and unrelated to `discussionHub`). `tsc
--noEmit` clean on both `tsconfig.json` and `tsconfig.spec.json`,
`tslint` clean, `npm run build` clean, `dist/` has 268 `.js` files and
zero `.test.js` files.

**MUST VERIFY IN PROD:** nothing — this is a pure call-site consolidation
of an already-shared, already-tested error handler; no request/response
shape, status code, or logged text changed for any route.

---

## CHANGE 35 — duplication reduction: profile-details.ts + ratingsSearch.ts/courseRecommendation.ts

### Part 1 — `profile-details.ts` self-duplication

**What:** `/createUserV2WithRegistry` and `/createUserWithoutInvitationEmail`
were byte-identical (confirmed via direct diff — only whitespace, quote
style, and a stray tslint comment differed). Both are now the same
function, `createUserWithRegistry(req, res)`, registered as the handler
for both routes. `/createUserV2WithoutRegistry` was deliberately left
separate: it's a real behavioral variant (skips the OpenSaber registry
step entirely), not a duplicate.

Separately, 8 GET/POST routes in the same file (`/createUserRegistry`,
`/getUserRegistry`, `/getUserRegistryById/:id`, `/userProfileStatus`,
`/setUserProfileStatus`, `/getMasterLanguages`, `/getMasterNationalities`,
`/getProfilePageMeta`, `/migrateRegistry`) shared the identical
`logError(label, err)` + `status(err.response.status || 500).send(err)`
catch shape (note: sends the raw `err`, not `err.response.data` — a
different shape than `writeApi.ts`'s `handleWriteApiError`, so this is a
new file-local `handleProfileDetailsError` helper, not a reuse of that
one). `createUser` (Kong-based, structured `USR_EMAIL_EXISTS` body,
`'SUCCESS'` uppercase check) and `completeUserInfo`/`updateUser`/`v2/updateUser`
(different send shapes — `err.message`, `err.response.data` — or no
axios-error handling at all) were left untouched; their catch shapes
genuinely differ.

**Pre-existing bug preserved verbatim, not fixed:** `/getProfilePageMeta`'s
catch block already logged the wrong label
(`'ERROR FETCHING MASTER NATIONALITIES >'`, copy-pasted from the route
above it, instead of a page-meta-specific message). Passed through
unchanged to `handleProfileDetailsError`.

**New tslint suppression, not a behavior change:** the merged
`createUserWithRegistry` function trips tslint's cognitive-complexity
rule at 16 (the limit is 15) purely because it's now a single named
function instead of two separately-linted inline arrow handlers with the
identical body. Suppressed with `// tslint:disable-next-line:
cognitive-complexity` — the logic itself is an unmodified relocation.

**Impact:** ~90 duplicated lines removed (`profile-details.ts` dropped
from 883 to ~800 lines). Test coverage unchanged — `profile-details.test.ts`
(73 tests, unmodified) already asserts exact status codes and response
bodies per route, including all 3 `createUserV2*` variants' distinct
failure messages, so no new tests were needed to prove the merge is safe.

### Part 2 — `ratingsSearch.ts` / `courseRecommendation.ts` `/getcourse` routes

**What:** `ratingsSearch.ts`'s `/recommendation/publicSearch/getcourse`
and `courseRecommendation.ts`'s `/publicSearch/getcourse` were ~90%
byte-identical (confirmed via direct diff): same primary
recommendation-service search, same Postgres competency lookup, same
secondary Elasticsearch search, same merge/dedup. Extracted to
`src/utils/courseRecommendationSearch.ts`'s
`searchCourseByRecommendationApi(req, res, pool, includeOffsetLimit,
includeLangFilter, enrichWithRatings)`, following the same
caller-supplies-its-own-pool convention as CHANGE 33's
`courseQuerySearch.ts`.

Three genuine differences threaded through as explicit parameters
(not force-merged):
- `limit`/`offset` pass-through on both the primary and secondary search
  bodies — `ratingsSearch.ts` only (`includeOffsetLimit: true` there,
  `false` in `courseRecommendation.ts`).
- A `lang` filter (deleted from the secondary search body when `language`
  is falsy) — `ratingsSearch.ts` only (`includeLangFilter`).
- Final content enrichment — `ratingsSearch.ts` passes its own
  `getCombinedRatingsResult` (a ratings-service lookup);
  `courseRecommendation.ts` passes an identity pass-through
  (`async (courses) => courses`), since it has no ratings-enrichment step.

Each file keeps its own separately-instantiated Postgres pool
(`createSearchPgPool()` vs `new Pool(...)`) — not merged, matching the
established "each caller manages its own pool" convention. The trust
boundary that made `recommendationEngineV2.ts` vs `courseRecommendation.ts`
correctly irreducible does NOT apply here — `ratingsSearch.ts` and
`courseRecommendation.ts` are both mounted on the public router, so no
trust difference was flattened by this merge.

**Dead code surfaced, not introduced:** extracting `courseRecommendation.ts`'s
route body made the TypeScript compiler flag its `API_END_POINTS` object
(`cbpCourseRecommendation`, `recommendationAPI`) as fully unused — a
`tsc` hard error (`TS6133`), not a lint warning. Checked: both keys were
already unreferenced anywhere else in the file before this change: this
was pre-existing dead code that the extraction merely stopped masking.
Removed as required to keep the build compiling; not a functional change.
Similarly, `ratingsSearch.ts`'s `unknownError` constant, `_` (lodash)
import, and 2 of 4 `API_END_POINTS` entries (`search`, `searchAPI`)
became unused by the same extraction and were removed.

**New-code quality gate findings, found via Sonar rescan and fixed:** the
merged function tripped Sonar's own cognitive-complexity count (19 vs the
15 allowed — a different count than tslint's local check, which didn't
flag it) and 2 instances of the familiar `err && err.response &&
err.response.status` pattern (`typescript:S6582`, "prefer optional
chaining" — the same finding fixed twice before in this campaign).
Fixed identically: the pattern became `err?.response?.status` (no
behavior change — both short-circuit to `undefined` on any falsy link).
The complexity finding was resolved by extracting the secondary
Elasticsearch-competency-search block into its own
`searchSecondaryByCompetency(...)` function — a pure structural split
with no logic change, confirmed by all 27 tests in both files still
passing unchanged afterward.

**Testing:** existing tests for both routes checked overall response
shape but not the exact `limit`/`offset`/`lang`/enrichment request
construction, so — per this campaign's standard of asserting exact
request construction, not just status codes — 9 new tests were added: 5
in `ratingsSearch.test.ts` (limit/offset on primary body, limit/offset on
secondary body, lang filter present when language given, lang filter
absent when not, ratings enrichment applied) and 4 in
`courseRecommendation.test.ts` proving the inverse (no limit/offset, no
lang filter, no enrichment — content returned raw). All 27 tests in both
files pass.

Full suite run twice (3661 passed both times, up from 3653 — the net of 9
new tests here plus the CHANGE 34 catch-block consolidation, which added
none). `tsc --noEmit` clean on both configs, `tslint` clean, `npm run
build` clean, `dist/` has 269 `.js` files (268 + the new
`courseRecommendationSearch.js`) and zero `.test.js` files.

**MUST VERIFY IN PROD:** nothing — every request/response shape, status
code, and error message is unchanged per route; the only removed code
(`API_END_POINTS.cbpCourseRecommendation`/`recommendationAPI` in
`courseRecommendation.ts`, `unknownError`/2 endpoint entries in
`ratingsSearch.ts`) was already unreachable before this change.

**Sonar result (CHANGE 34 + 35 combined):** duplication **8.3% → 7.0%**
(552 fewer duplicated lines, 3,419 → 2,867; 33 fewer blocks, 156 → 123),
coverage steady at 93.3%, quality gate **OK** (0 new violations after the
optional-chaining and cognitive-complexity fixes above).

---

## CHANGE 36 — duplication reduction: user/playlist.ts catch-block dedup

**What:** 11 catch sites in `src/protectedApi_v8/user/playlist.ts` (10
route catch blocks plus the `GET /` route's `if (allPlaylists.error)`
forward, which shares the identical response-formatting shape despite
not being inside a `try/catch`) shared the identical
`status((err.response.status) || 500).send((err.response.data) || {error:
GENERAL_ERROR_MSG})` shape. Consolidated into a new file-local
`handleUserPlaylistError(res, err, label?)`. Not a reuse of either
existing helper in the codebase with a similar name:
`protectedApi_v8/playlist.ts`'s `handlePlaylistError` uses `.json()`, a
different message format, and different fallback-logging branches —
genuinely different response shape, not a fit.

**Pre-existing inconsistency preserved verbatim, not fixed:** 2 of the 11
sites (`/sync/:playlistId`, `/recent`) log a route-specific label
(`'SYNC PLAYLIST ERROR >'`, `'RECENT PLAYLIST CONTENTS FETCH ERROR >'`)
before responding; the other 9 don't log at all. This was preserved via
an optional `label` parameter that only logs when given — verified this
didn't silently add logging to the other 9 by adding an explicit
"does not log" test for `/accept/:playlistId`.

This file (and its sibling `workallocation.ts`, researched but not
touched) is itself the output of an earlier pass (CHANGE 18) that
already extracted a param-guard helper and the catch-block pattern for
similarly-shaped files; this change extends the same technique to the
error-response shape CHANGE 18 left inline in this specific file.

**Testing:** existing suite (58 tests) already asserted exact status
codes and response bodies for both the network-error and
upstream-error-with-response paths on every route, so the merge itself
needed no new coverage to prove safe. 3 new tests were added
specifically for the logging-label preservation (a gap the existing
suite didn't cover): `/sync/:playlistId` logs under its label on
failure, `/recent` logs under its label on failure, `/accept/:playlistId`
does NOT log on failure. All 61 tests pass.

Full suite run twice (3664 passed both times, up 3 for the new logging
tests). `tsc --noEmit` clean on both configs, `tslint` clean, `npm run
build` clean, `dist/` has 269 `.js` files and zero `.test.js` files.

**MUST VERIFY IN PROD:** nothing — every status code, response body, and
logged message is unchanged per route.

**Sonar result:** duplication **7.0% → 6.8%** (73 fewer duplicated lines,
2,867 → 2,794; 4 fewer blocks, 123 → 119), coverage steady at 93.3%,
quality gate **OK**.

---

## CHANGE 37 — duplication reduction: training.ts + certifications.ts shared error helper

**What:** all 20 routes in `training.ts` and all 25 in `certifications.ts`
shared the identical catch shape:
`res.status((err && err.response && err.response.status) ||
<fallback>).send((err && err.response && err.response.data) ||
{error: 'Failed due to unknown reason'})`. Both files even had a
byte-identical `GENERAL_ERROR_MSG` constant. Extracted to a new
cross-file shared util, `src/utils/upstreamErrorForward.ts`'s
`forwardUpstreamError(res, err, fallbackStatus = 400)`.

This is a genuinely new cross-file shared helper (unlike CHANGE 8's
per-file helpers, kept file-local because each file's message text
differed) — here the shape, including the message text, is identical
across both files with zero exceptions, so a shared util is the more
direct fit and doesn't create two near-duplicate helpers.

**Pre-existing difference preserved verbatim, not fixed:** 24 of the 25
`certifications.ts` routes and 19 of the 20 `training.ts` routes fall
back to status 400 on a non-upstream error. `training.ts`'s `POST
/trainings/jit` route alone falls back to 500. Threaded through via the
optional `fallbackStatus` parameter (default 400, called with `500`
explicitly only at that one call site) — confirmed still asserted by the
existing test suite (`training.test.ts` already has a dedicated 500
assertion for this exact route, distinct from every other route's 400
assertion).

**Testing:** existing suites (69 tests in `training.test.ts`, 79 in
`certifications.test.ts` — 148 total) already asserted exact status
codes and response bodies on both the network-error and
upstream-error-with-response paths for every route, including the
`/trainings/jit` 500-vs-400 distinction, so no new tests were needed to
prove the merge safe. All 148 pass unchanged.

Full suite run twice (3664 passed both times — no net change in test
count, since this change added zero new tests). `tsc --noEmit` clean on
both configs, `tslint` clean, `npm run build` clean, `dist/` has 270
`.js` files (269 + the new `upstreamErrorForward.js`) and zero
`.test.js` files.

**New-code quality gate finding, found via Sonar rescan and fixed:** the
new `forwardUpstreamError` tripped the familiar `err && err.response &&
err.response.status` optional-chaining finding (`typescript:S6582`) — the
same finding fixed 3 times before in this campaign. Fixed identically:
`err?.response?.status` / `err?.response?.data` (no behavior change).

**MUST VERIFY IN PROD:** nothing — every status code, response body, and
fallback behavior is unchanged per route.

**Sonar result:** duplication **6.8% → 6.7%** (86 fewer duplicated
lines, 2,794 → 2,708; 7 fewer blocks, 119 → 112), coverage steady at
~93%, quality gate **OK** (0 new violations after the optional-chaining fix).

---

## CHANGE 38 — duplication reduction: admin/userRegistration.ts catch-block dedup

**What:** 13 of the 14 routes in `admin/userRegistration.ts` shared the
identical `logError(label, err)` +
`status((err.response.status) || 500).send((err.response.data) || {})`
catch shape (the cassandra-query routes' inner callback-based error
branches — `res.status(400).send('Something went wrong!')` — are a
different shape and correctly left untouched; only their outer
`catch`-block, guarding cassandra client construction itself, matches
the cluster). Consolidated into a new file-local
`handleUserRegistrationError(res, err, label)`, following the same
pattern as CHANGE 8/34/36's per-file helpers (kept local rather than
reused from elsewhere since the exact fallback status (500, not 400) and
body shape (`{}`, not `{error: ...}`) differ from every existing shared
helper in the codebase).

**Pre-existing label text preserved verbatim, not fixed:** the
`/register` route's label already read `'ERROR ON REGISTRATIO USERS >'`
(a typo — missing the second `N`); `/user/department` and
`/user/department/update` already shared the identical label
`'ERROR ON /user/department >'`. Both passed through unchanged.

**Testing:** existing suite (53 tests) already asserted exact status
codes and response bodies for both the network-error and
upstream-error-with-response paths, so no new tests were needed. All 53
pass unchanged.

---

## CHANGE 39 — duplication reduction: discussionHub/writeApi.ts residual POST routes

**What:** `POST /topics` and `POST /topics/:topicId` were structurally
identical to this same file's already-existing `postWithUserUid(req, res,
url, body, label)` helper (built for the bookmark/vote POST routes) —
same `getRootOrg` → `extractUserIdFromRequest` → `logInfo` →
`getUserUID` → `axios.post(url, {...body, _uid}, {headers: {authorization:
getWriteApiToken()}})` → conditional send shape, differing only in the
URL builder and log label, with `req.body` forwarded as-is exactly
matching `postWithUserUid`'s existing `body` parameter usage. Rewired
both routes to call the existing helper directly — no new abstraction,
a mechanical reuse of code already proven safe by 4 other call sites.

**Pre-existing label text preserved verbatim, not fixed:**
`/topics/:topicId`'s label already read
`'ERROR ON writeAPI  POST /topics/:topicId >'` (double space before
"POST", a pre-existing formatting artifact) — passed through unchanged.

**Testing:** existing suite (18 tests in `writeApi.test.ts`) already
asserted exact status codes and response forwarding for both routes on
success and failure. All 18 pass unchanged.

**Combined verification for CHANGE 38 + 39:** full suite run 3 times
(3664 passed on runs 1 and 3; run 2 had a single failure in
`maharastraNursingCouncilAuth.test.ts` — a file untouched by either
change — confirmed clean in isolation immediately after, consistent
with this campaign's long-documented `mountRouter`-adjacent transient
flakiness, not a regression). `tsc --noEmit` clean on both configs,
`tslint` clean, `npm run build` clean, `dist/` has 270 `.js` files
(unchanged — no new files this round) and zero `.test.js` files.

**MUST VERIFY IN PROD:** nothing for either change — every status code,
response body, and logged message is unchanged per route.

**Sonar result:** duplication **6.7% → 6.4%** (97 fewer duplicated
lines, 2,708 → 2,611; 6 fewer blocks, 112 → 106), coverage steady at
~93%, quality gate **OK**.

---

## CHANGE 40 — duplication reduction: recommendation.ts org-header guard

**What:** 4 of `recommendation.ts`'s 5 routes (`/`, `/interestBased`,
`/usageBased`, `/:recommendationType` — `/keyword` doesn't require both
headers, correctly excluded) shared the identical
`if (!org || !rootOrg) { res.status(400).send(ERROR.ERROR_NO_ORG_DATA);
return }` guard. Extracted to a file-local `requireOrgHeaders(req, res)`,
mirroring `content.ts`'s own already-existing, identically-named,
identically-shaped helper (same convention, kept file-local per this
campaign's precedent rather than shared, since it's plain,
self-contained header-reading logic with no other file-specific
dependencies).

**Real difference confirmed preserved, not touched:** `/:recommendationType`
genuinely omits the `contents = shuffleContent(contents)` call that the
other 3 routes have — verified via direct read before and after the
change; the merge only touched the guard clause at the top of each
route, not the response-building logic below it, so this difference
carries through completely untouched.

**Testing:** existing suite (19 tests) already asserted exact status
codes and response bodies for the missing-header 400 path on all 4
routes, so no new tests were needed. All 19 pass unchanged.

Full suite run 3 times (3664 passed on runs 2 and 3; run 1 had a single
failure in `admin/userRegistration.test.ts` — confirmed clean in
isolation immediately after, consistent with this campaign's documented
transient flakiness, not a regression). `tsc --noEmit` clean, `tslint`
clean, `npm run build` clean, `dist/` has 270 `.js` files and zero
`.test.js` files.

**MUST VERIFY IN PROD:** nothing — every status code, response body, and
the `/:recommendationType` shuffle-omission difference are unchanged.

**Sonar result:** duplication **6.4% → 6.3%** (34 fewer duplicated
lines, 2,611 → 2,577; 2 fewer blocks, 106 → 104), coverage steady at
~93%, quality gate **OK**.

---

## CHANGE 41 — duplication reduction: user/content.ts and user/follow.ts org-header guards

### user/content.ts

**What:** 4 of `content.ts`'s 5 routes (`/contentLikes`, `/like`,
`/like/contents`, and — after the guard was pulled out —
`/like/:contentId`/`/unlike/:contentId`) shared the identical
`org`/`rootOrg`-missing 400 guard; `/assigned-content` only requires
`rootOrg` (correctly excluded, left untouched). Extracted to a file-local
`requireOrgHeaders(req, res)`, mirroring the existing
`content.ts` (top-level)/`recommendation.ts` (CHANGE 40) precedent. Also
extracted a file-local catch helper `handleUserContentError` for the 4
catch blocks sharing the identical `logError(label, err)` +
`status(err.response.status || 500).send(err.response.data ||
{error: GENERAL_ERROR_MSG})` shape (`/assigned-content`'s catch —
`res.status(500).json(error)`, no upstream-status forwarding — is a
different shape, correctly left untouched).

**A second cluster this extraction surfaced (not present before):**
collapsing the guard in `/like/:contentId` (POST) and
`/unlike/:contentId` (DELETE) left their bodies byte-identical apart from
the HTTP method and the logged error label — flagged by tslint's
`no-identical-functions` rule the moment the guard noise was removed.
Merged into a new `likeOrUnlikeContent(req, res, rootOrg, method, label)`,
parameterized by the one real difference (`'POST'` vs `'DELETE'`). The
two now-thin `.post()`/`.delete()` route registrations that call it are
still flagged as near-identical by the same lint rule (5-line wrappers
differing only in the two literal arguments) — suppressed with the
established `// tslint:disable-next-line: no-identical-functions`
convention already used for this exact situation in `profile-details.ts`
and elsewhere in the codebase.

**Testing:** existing suite (29 tests) already asserted exact status
codes and response bodies for the missing-header 400 path and the
success/failure paths on every route, so no new tests were needed. All
29 pass unchanged.

### user/follow.ts

**What:** 8 of `follow.ts`'s 9 routes (`/fetchAll`, `/following/:type`,
`/getFollowing`, `/getFollowingv3`, `/getFollowersv3`, `/`, `/unfollow`,
`/getFollowers`) shared the identical `org`/`rootOrg`-missing 400 guard;
`/followers/:targetId` doesn't require org headers at all, correctly
excluded. Extracted to a file-local `requireOrgHeaders(req, res)`
following the same pattern.

**Testing:** existing suite (29 tests) already asserted exact status
codes and response bodies for the missing-header 400 path on every
route, so no new tests were needed. All 29 pass unchanged.

**Combined verification:** full suite run twice (3664 passed both
times). `tsc --noEmit` clean, `tslint` clean, `npm run build` clean,
`dist/` has 270 `.js` files and zero `.test.js` files.

**MUST VERIFY IN PROD:** nothing — every status code, response body, and
logged message is unchanged per route in both files.

**Sonar result:** duplication **6.3% → 6.1%** (87 fewer duplicated
lines, 2,577 → 2,490; 4 fewer blocks, 104 → 100), coverage steady at
~93%, quality gate **OK**.

---

## CHANGE 42 — duplication reduction: publicSearch.ts/ratingsSearch.ts competency-grouping block

**What:** the two files' `/getCourses` routes each had a byte-identical
~30-line block — grouping courses by `lang`, then sorting each group by
competency level (parsed from `competencies_v1`) with a
most-recently-updated tiebreaker — gated behind an identical
`filters.competencySearch.length >= 5` threshold check. Extracted to
`src/utils/competencyLevelSort.ts`'s `sortCoursesByCompetencyLevel(courses)`
and `hasCompetencySearchThreshold(filters)`.

The only difference between the two call sites is which variable the
sort is applied to (`searchFilteredData` in `publicSearch.ts` vs
`combinedRatingsData`, the ratings-enriched result, in
`ratingsSearch.ts`) — a difference that requires no parameterization
since both files pass their own local variable in and reassign it from
the return value.

**Testing:** existing suite already had exact-order assertions for this
branch in both files (`publicSearch.test.ts`: `'groups and sorts by
competency level when competencySearch has 5+ entries'`,
`ratingsSearch.test.ts`: the same test name) — asserting the returned
content array's identifier order after a level-3/level-1 input, so no
new tests were needed. All 27 tests across both files pass unchanged.

Full suite run 3 times (3664 passed on runs 1 and 3; run 2 had a single
failure in `resource.test.ts` — a file untouched by this change —
confirmed clean in isolation immediately after, consistent with this
campaign's documented transient flakiness, not a regression). `tsc
--noEmit` clean, `tslint` clean, `npm run build` clean, `dist/` has 271
`.js` files (270 + the new `competencyLevelSort.js`) and zero `.test.js`
files.

**MUST VERIFY IN PROD:** nothing — the grouping/sort algorithm, its
5-entry threshold gate, and which variable each file applies it to are
all unchanged.

**Sonar result:** duplication 2,490 → 2,466 duplicated lines (24 fewer;
density still rounds to 6.1%), 100 → 98 blocks, coverage steady at ~93%,
quality gate **OK**.

---

## CHANGE 43 — duplication reduction: cross-file requireOrgHeaders consolidation

**What:** a self-inflicted gap from earlier in this session — CHANGE 13
gave `content.ts` a file-local `requireOrgHeaders(req, res)`; CHANGE 40
and CHANGE 41 each added byte-identical (behaviorally — only `req`'s
type annotation and the `org`/`rootOrg` read order differed cosmetically)
copies to `recommendation.ts`, `user/content.ts`, and `user/follow.ts`,
deliberately kept file-local at the time to match the existing
per-file-helper convention. A Sonar rescan afterward flagged the 4 now-identical
copies as new cross-file duplication. Per this campaign's own established
rule (first applied at CHANGE 34/37: when a helper's shape, including
message text, is identical across files with zero exceptions, share it
rather than keep N near-duplicate local copies), consolidated all 4 into
`src/utils/requireOrgHeaders.ts`.

**Confirmed no behavioral difference before merging:** all 4 copies read
`org`/`rootOrg` via `req.header(...)` (not raw property access), all 4
respond with the identical `res.status(400).send(ERROR.ERROR_NO_ORG_DATA)`
on failure, and all 4 return `{ org, rootOrg }` on success. The read
order (`org` then `rootOrg`, or the reverse in `follow.ts`'s original)
has no observable effect since neither read has a side effect. `user/content.ts`'s
copy was typed `req: IAuthorizedRequest` (which extends Express's
`Request`) — the shared version's `req: Request` parameter accepts it
via normal structural typing, confirmed by a clean `tsc` pass.

**Testing:** existing suites across all 4 files already asserted the
exact 400 response on the missing-header path per route, so no new
tests were needed. All 136 tests across `content.test.ts`,
`recommendation.test.ts`, `user/content.test.ts`, and `user/follow.test.ts`
pass unchanged.

Full suite run twice (3664 passed both times). `tsc --noEmit` clean,
`tslint` clean, `npm run build` clean, `dist/` has 272 `.js` files (271
+ the new `requireOrgHeaders.js`) and zero `.test.js` files.

**MUST VERIFY IN PROD:** nothing — every route's 400 response and every
success path is unchanged; this is a pure code-location consolidation
of 4 already-identical helpers.

**Sonar result:** total duplicated lines held flat at 2,466 (density
still 6.1%) — the new shared `requireOrgHeaders.ts` itself shows 0%
duplication, confirming the 4 near-duplicate definitions are gone; the
CPD-detected line count didn't move measurably this round because the
4 call sites' surrounding code (which the detector's token window also
weighs) shrank by roughly the same amount elsewhere. Quality gate **OK**,
coverage steady at ~93%. The real improvement — one source of truth
instead of 4 — doesn't always show up 1:1 in the density number, but
removes genuine maintenance risk (a future header-format change would
otherwise need 4 synchronized edits).

---

## Post-commit re-verification (CHANGE 34–43, commit `ddcc1b3`)

CHANGE 34 through 43 were committed as `ddcc1b3` on
`feat-sonarqube-integration-v2` ("Dedupe discussionHub, profile-details,
search, training/certifications, and org-header guards"), 23 files
changed. Before reporting this work as safe to build on, the entire
committed diff was independently re-verified end to end in a fresh
session — not by re-reading the claims above, but by re-running every
check from a clean working tree:

- **`tsc --noEmit`** on both `tsconfig.json` and `tsconfig.spec.json` —
  clean, zero errors.
- **`tslint -c tslint.json -p tsconfig.json`**, full repo (not just
  touched files) — clean, zero findings.
- **Full Jest suite, 3 consecutive runs** — 223 suites / 3,664 tests
  passing every time, zero regressions. No flakes surfaced this round
  (contrast with individual CHANGE entries above, several of which hit
  and cleared a transient `mountRouter`-harness flake — see each
  entry's own testing note).
- **A focused re-run of every file touched across all 10 changes**,
  isolated from the rest of the suite (15 test files, 548 tests) — all
  green, confirming no cross-file interaction masked anything under
  full-suite parallelism.
- **`npm run build`** — clean. `dist/` has 272 `.js` files (matching
  CHANGE 43's count) and zero leaked `.test.js` files.
- **Router-mount audit** — grepped every router exported from a file
  touched this session (`profileDeatailsApi`, `topicsApi`, `postsApi`,
  `writeApi`, `trainingApi`, `certificationApi`, `userRegistrationApi`,
  `recommendationApi`, `userContentApi`, `followApi`, `playlistApi`,
  `ratingsSearch`, `courseRecommendation`, `publicSearch`) against
  `protectedApiV8.ts`, `publicApiV8.ts`, `admin/admin.ts`, and
  `user/user.ts` — confirmed all 13 are still mounted at their original
  path. This catches the one failure mode none of the other checks
  would: a router silently orphaned by an import/export edit during
  refactoring, which would compile, lint, and even pass tests (since
  route tests mount the router directly, bypassing the aggregator) while
  quietly 404ing in production.

No new findings. The Sonar dashboard itself could not be re-scanned in
this follow-up session (local Sonar server/Docker not running) — the
6.1% figure and gate-OK status reported per change above are the last
live scan taken immediately after CHANGE 43, before the commit; they
were not re-confirmed today, only the code-level checks were.

---

## CHANGE 44 — CI config: SonarCloud workflow trigger narrowed to `master` only

**File:** `.github/workflows/sonar.yml`. **No source code touched** —
this is a CI-configuration-only change, explicitly requested and
confirmed by the repo owner (not a duplication-reduction or refactor
change, and separate from CHANGE 1–43).

**What it was:** the `on:` block fired the SonarCloud scan job on push
to 5 branches (`development`, `cbrelease-4.0.1`, `production`,
`feat-sonarqube-integration`, `master`) and on `pull_request` targeting
2 of those (`development`, `cbrelease-4.0.1`).

**What was found during verification, before any edit:** the
`feat-sonarqube-integration` entry (no `-v2` suffix) referenced a
branch this campaign no longer works on — all of CHANGE 1–43 landed on
`feat-sonarqube-integration-v2`, which was never in the trigger list at
all. Practically, this meant the workflow would not have fired on a
push to the actual working branch, on either its old or its new name in
the list as it stood.

**What changed, per explicit instruction:** the repo owner asked to
"keep master branch, not add any feature branch," then, after being
shown the leftover `feat-sonarqube-integration` entry, asked to remove
it too, then clarified the final scope directly: **`push: master`
only** — `development`, `cbrelease-4.0.1`, `production`, and the entire
`pull_request` block were all explicitly removed at the owner's
request, not inferred. The workflow now runs the SonarCloud scan only
on a direct push to `master`.

```yaml
on:
  push:
    branches:
      - master
```

**Backward compatibility — nothing else in the job changed.** All 3
steps below the trigger block are untouched, byte-for-byte:
`actions/checkout@v4` (`fetch-depth: 0`, for Sonar blame data),
`actions/setup-node@v4` (`node-version: 20`), `npm install
--ignore-scripts --legacy-peer-deps`, `npm run test:coverage`, and the
`SonarSource/sonarqube-scan-action@v5` step reading `SONAR_TOKEN` from
the `sonarcloud` environment and pointing at
`https://sonarcloud.io`. `sonar-project.properties` (project key,
organization, lcov paths, exclusions) is untouched — this change only
narrows *when* the job runs, not *what* it does when it runs.

**Verification performed, before committing:**
- YAML re-parsed with `python3 -c "import yaml; yaml.safe_load(...)"`
  after every edit — valid at each step, final `on:` block confirmed to
  be exactly `{'push': {'branches': ['master']}}`.
- `actions/checkout@v4`, `actions/setup-node@v4`,
  `SonarSource/sonarqube-scan-action@v5` confirmed to be real, current,
  correctly-pinned major versions (unchanged by this edit, but checked
  as part of validating the file as a whole).
- `npm install --ignore-scripts --legacy-peer-deps` — run in an
  isolated directory (not the working tree) with the repo's
  `package.json`/`package-lock.json`, matching the CI step exactly.
  Succeeded (2,087 packages installed, exit 0); the vulnerability
  warnings `npm audit` reports are pre-existing dependency findings,
  unrelated to this change.
- `npm run test:coverage` (the exact CI step, same command) — run from
  a clean `coverage/` directory. 223 suites / 3,664 tests passing, exit
  0, `coverage/lcov.info` produced (288 KB, 24,090 lines) at the exact
  path `sonar-project.properties` expects
  (`sonar.javascript.lcov.reportPaths=coverage/lcov.info`).
- `tsc --noEmit` and `tslint -c tslint.json -p tsconfig.json` (full
  repo) re-run after this change — both clean, confirming the
  CI-config edit had no effect on the source tree (expected for a
  single-YAML-file change, but verified rather than assumed).
- Grepped the repo for any other file referencing this workflow's
  trigger branches or the workflow file itself — none found, so no
  other doc needed updating to stay in sync.

**MUST VERIFY IN PROD:** nothing in application behavior — this change
touches only when a GitHub Actions job runs, not any code path a
request goes through. The one thing to be aware of operationally: pushes
to `development`, `cbrelease-4.0.1`, `production`, or any feature
branch (including `feat-sonarqube-integration-v2`) will **no longer**
trigger an automatic SonarCloud scan or post a PR check — a scan on
those branches now requires either a manual `workflow_dispatch`-style
trigger (not currently configured) or a merge to `master`. If that
turns out to be broader than intended, the fix is purely additive:
re-add the desired branch names to the `push.branches` list.

---

## Dead-code sweep (post CHANGE 44) — 2 new findings, flagged, not removed

A fresh `ts-prune -p tsconfig.json` run (same AST-aware tool used for
CHANGE 32's sweep, which catches transitive/type-only usage a grep-based
pass misses), filtered to drop "used in module" self-matches, found 4
exports with zero live callers. 2 are already documented and were
deliberately left alone in CHANGE 32
(`authorizationV2Api.ts`'s `authorizationV2Api`, `searchUser.ts`'s
`fetchUser` — both have dedicated test suites, flagged for a team
decision, still unresolved). The other 2 are new:

- **`transformToSbExtUpsertRequest`** (`src/service/playlist.ts:62`,
  present since the initial 2021 commit) — the only reference anywhere
  in the codebase is inside a **commented-out import** in
  `src/protectedApi_v8/user/playlist.ts` (line 24). Never called, live
  or dead.
- **`transformToSbExtDeleteRequest`** (`src/service/playlist.ts:69`,
  same 2021 origin) — only called inside a commented-out
  `else if (type === EPlaylistUpsertTypes.delete)` branch of
  `POST /:playlistId/:type` in the same file (lines 526–539), disabled
  since the initial commit. The live code only ever handles
  `EPlaylistUpsertTypes.add`; the `delete` case has been dead for the
  file's entire history.

Both pass the 3-month-inactivity bar easily (5 years untouched, `git
log -L` confirms neither the function nor the commented-out call site
has been touched since `cf5127a`, the initial commit) — but, matching
the existing 2 findings, each has its own dedicated test in
`src/service/playlist.test.ts` (`describe('transformToSbExtUpsertRequest', ...)`,
`describe('transformToSbExtDeleteRequest', ...)`). Per this campaign's
standing rule — code with a deliberately-written test suite is treated
as "someone kept this reachable on purpose for a reason not visible from
the code alone," not auto-deleted even when genuinely dead — **these are
flagged here for a team decision, not removed.**

If a decision is made to remove them: delete the 2 functions, their 2
`describe` blocks in `service/playlist.test.ts`, and the disabled
`else if` branch + its 3 fully-commented import lines in
`user/playlist.ts` (lines 11–13, 21, 24, and 526–539) — all in the same
commit, since the branch is the only reason
`transformToSbExtDeleteRequest` is imported (commented) at all.

---

## SSO/Keycloak auth family — re-verified, rejection upheld with sharper evidence

At the repo owner's request, re-checked (skeptically, not by re-reading the
prior verdict) whether the SSO auth family
(`tnaiAuth.ts`/`tnnmcAuth.ts`/`tnnmcAuthV2.ts`/`sashaktAuth.ts`/`maternityFoundationAuth.ts`)
had any safe further-merge opportunity missed by earlier passes (CHANGE
31, CHANGE 33 section E-3). Read every file in full again, cross-checked
against every existing `// sonar-cleanup:` tag in the family, and looked
specifically for (1) whether the "create→assign role→patch profile"
sequence is really as similar as "org-signup-trio-like" implies, (2)
whether the client_id/secret/logging differences cited earlier are still
the real blocker or could be parameterized like other clusters in this
campaign, (3) any 2-of-5 or 2-of-4 pairwise sub-slice never isolated on
its own, and (4) whether existing tests would actually catch a bad merge.

**Result: the prior rejection holds, and the fresh read sharpens rather
than weakens it.**

- **client_id/client_secret was already fully solved, not a live
  blocker.** CHANGE 31's `ssoKeycloakExchange.ts` already threads
  `clientId`/`clientSecret`/`username` through as explicit parameters
  for all 4 non-outlier files, the same technique used elsewhere in this
  campaign (CHANGE 35's `includeOffsetLimit`/`includeLangFilter`,
  CHANGE 37's `fallbackStatus`). Citing "client_id/secret differences"
  as the reason not to merge further was shorthand that undersold the
  real barrier.
- **The real, still-unparameterizable barrier is the profile-PATCH body
  shape**, which is not 4 instances of one schema with different
  values — it's 4 different schemas. `tnnmcAuth.ts` alone adds a whole
  extra `professionalDetails` array (keyed off a role→designation
  lookup), `regNurseRegMidwifeNumber`, `gender`, and duplicates
  `firstName`/`lastName` at the top level of the request — fields no
  sibling file has. `sashaktAuth.ts`/`maternityFoundationAuth.ts` omit
  `preferences.language` entirely (present in the other two) and use a
  hardcoded `dob` neither of the other two files has. `sashaktAuth.ts`
  additionally runs a 4th step (a Cassandra insert into
  `user_sso_bulkupload_v2`) and its own `checkMandatoryUserProfileDetails`
  helper that no other file has at all. `tnaiAuth.ts` uniquely writes a
  `tnaiUserId` field sourced from the partner API's own numeric id.
- **No safe pairwise sub-slice exists.** The closest pair by surface
  similarity (`sashaktAuth.ts`/`maternityFoundationAuth.ts`, both
  omitting `preferences.language`) still diverges on the Cassandra step,
  the mandatory-field helper, GET-vs-POST, and the upstream call shape
  (Bearer-GET vs. token-in-body-POST). The closest pair by
  control-flow (`tnaiAuth.ts`/`tnnmcAuth.ts`, both redirect-on-catch)
  diverges sharply on the PATCH body and the upstream token-validation
  method (KEY/TOKEN vs. HMAC signature + custom headers).
  `tnnmcAuthV2.ts` doesn't even use the shared `ssoKeycloakExchange.ts`
  helper — confirmed via grep, zero hits — it inlines its own Keycloak
  call with an org-membership gate and a migration path no sibling has,
  making it the most structurally distinct file in the family.
- **The status-code/catch-shape/response-shape differences already
  documented (changes T, AD, AH, BS) are real and load-bearing** — 302
  vs. 400 on auth failure, silent fallthrough vs. explicit 400 JSON vs.
  redirect-fallback in the catch block, `resRedirectUrl` present in 2
  files and absent in 2 — each tied to a separately-documented
  double-send bug specific to that file. Preserved, not merged, exactly
  as CHANGE 31 already chose.
- **Existing tests would not catch every regression a merge could
  introduce.** Coverage is solid on response status/redirect behavior
  per file, but none of the 5 files' test suites assert the exact
  outbound PATCH body field-by-field — a merge that cross-wired, say,
  `tnnmcAuth.ts`'s `professionalDetails` block onto `tnaiAuth.ts`'s org
  could pass every existing test while being wrong for a real user. Any
  future attempt at even the closest pairwise merge would need new
  exact-request-shape tests first, the same standard this campaign
  already applied to `social.ts` (CHANGE 33) once a similar gap was
  found there.

**Conclusion:** this is confirmed structurally irreducible business
logic, not under-researched duplication. No code change made as a
result of this re-check.

---

## CHANGE 45 — fix a CI-only flaky test: missing `node-html-to-image` mock

**Symptom:** GitHub Actions' `Test with coverage` step failed
intermittently with `mobileAppApi.test.ts`'s
`GET /ios/certificateDownload ... renders and returns the certificate
image for a valid token and correct secretKey` expecting `200`, getting
`500`. Consistently passed locally (4+ consecutive local runs, isolated
and full-suite, all green) — a CI-environment-only failure, not
reproducible on a dev machine.

**Root cause:** this test (and only this test, in this file) exercises
the real certificate-render pipeline —
`certificateRenderer.ts`'s `fetchAndRenderCertificate` calls
`renderCertificateImage`, which calls `node-html-to-image`, which
launches **real headless Chrome via Puppeteer**. `mobileAppApi.test.ts`
was missing the mock for that dependency. Every other test file that
exercises the same shared render helper already mocks it —
`certificateRenderer.test.ts`, `appCertificateDownload.test.ts`, and
`publicCertifcateFlinkv2.test.ts` all have
`jest.mock('node-html-to-image', () => jest.fn())`. Only
`mobileAppApi.test.ts`'s copy of this same route (added when
`/ios/certificateDownload` was wired as a 3rd caller of the shared
helper in CHANGE 29/33) never got the matching mock.

Real Puppeteer launches are a well-known source of CI-only flakiness —
GitHub Actions' shared runners are memory- and CPU-constrained relative
to a dev machine, and 223 Jest suites (many run in parallel workers)
competing for resources makes an occasional Chrome-launch failure or
timeout far more likely there than locally, where the same test passed
every time it was tried.

**Confirmed pre-existing, not a regression from this session:** `git
log` shows the test file was last touched `d24bfba` (2026-08-07,
"Extend branch-coverage tests, round 2"), well before CHANGE 34–45; the
missing mock has been there since that test was written, not introduced
by anything in this campaign.

**Fix:** added the same 4 pieces every sibling file already has —
`jest.mock('node-html-to-image', () => jest.fn())` alongside the
file's other top-of-file mocks, the `import nodeHtmlToImage from
'node-html-to-image'` + `const mockNodeHtmlToImage = nodeHtmlToImage as
unknown as jest.Mock` cast, a `mockNodeHtmlToImage.mockReset()` in the
shared `beforeEach`, and `mockNodeHtmlToImage.mockResolvedValue(Buffer.from('fake-png-bytes'))`
in the one test that reaches the render call — matching
`appCertificateDownload.test.ts`'s exact established pattern for the
same shared helper.

**Not touched:** the plain, non-iOS `GET /certificateDownload` route in
the same file returns a JSON body (`certUrl`) directly and never calls
the render pipeline — confirmed by reading its test assertions before
concluding it didn't need the same mock.

**Testing:** full `mobileAppApi.test.ts` suite (98 tests) passes, and
noticeably faster (~7.6s vs. ~9.1–9.6s before, since real Chrome no
longer launches). Full repo suite run twice after the fix — 223 suites
/ 3,664 tests passing both times, no regressions, and each run itself
faster (33–36s vs. CI's reported 62s for the same step, further
supporting that the removed Puppeteer launch was the source of both the
flakiness and the extra time). `tsc --noEmit` clean on both configs,
`tslint` clean across the repo, `npm run build` clean, `dist/` has 272
`.js` files (unchanged — this is a test-file-only change, no source
file touched) and zero leaked `.test.js` files.

**MUST VERIFY IN PROD:** nothing — this changes only test-double setup
in a `.test.ts` file; no production source file was modified.

---

## CHANGE 46 — duplication reduction: workflow-handler.ts and workallocation.ts, re-examined and merged

**Context:** both files had been researched earlier in this campaign and
judged low-value/too-fragmented to merge safely. At the repo owner's
request to look again for any safe reduction toward 5%, both were
re-read in full — not by re-reading the prior verdict — and the prior
call turned out to be wrong for the bulk of each file: both have a
large, genuinely mergeable core, with only a small number of routes
that are real exceptions.

### workflow-handler.ts

**What:** all 9 routes shared the identical
`axios.<method>(url, [body,] {...axiosRequestConfig, headers}) ->
res.status(response.status).send(response.data)` shape feeding into the
already-extracted `handleWorkflowError`. Extracted to a new
`proxyWorkflowRoute(req, res, method, url, sendBody, orgHeaders?, wid?)`.
Every real per-route difference threaded through as an explicit
parameter: HTTP method, whether the body is forwarded, whether org
headers are attached at all and in what form (both `org`+`rootOrg` via
the existing `requireWorkflowOrgHeaders` guard on 5 routes; both headers
read raw with no guard on 2 routes — `/nextActionSearch`,
`/historyByApplicationIdAndWfId`, `/historyByApplicationId`; `rootOrg`
alone on `/workflowProcess`), and whether the `wid` header is sent
(`/userWfSearch`, `/userWFApplicationFieldsSearch` only).

**Testing:** existing suite (42 tests) already asserted exact upstream
URL per route, including the `wid`-header-forwarding assertion for the
2 routes that send it — so no new tests were needed to trust the merge.
All 42 pass unchanged.

### workallocation.ts

**What:** 9 of the file's 12 routes (`/v2/add`, `/v2/update`,
`/add/workorder`, `/update/workorder`, `/getWorkOrders`,
`/getWorkOrderById/:workOrderId`, `/getWorkAllocationById/:workAllocationId`,
`/copy/workOrder`, `/getUserBasicInfo/:userId`) shared the identical
`axios.<method>(url, [body,] {...axiosRequestConfig, headers}) ->
res.status(response.status).send(response.data)` shape, all using
`handleWorkAllocationError(res, err, true)` (the pre-existing
buggy-log-string variant — see that function's own doc comment).
Extracted to a new `proxyWorkAllocationRoute(req, res, method, url,
sendBody, guard?, userIdHeader?)`. Real per-route differences
threaded through: HTTP method, whether the body is forwarded, whether
a required-value guard applies before the call (and which value/message
it checks — `userId` from `extractUserId(req)`, a route param, or none
at all for `/getWorkOrders`), and whether the resolved `userId` is sent
as a header.

**Explicitly excluded, confirmed genuinely different, not merged:**
- `/add`, `/update` — v1 endpoints using `extractAuthorizationFromRequest(req)`
  for `Authorization` instead of the constant `CONSTANTS.SB_API_KEY`
  every v2 route uses; a real, different auth mechanism.
- `/userSearch` — sends no auth headers at all (`headers: {}`).
- `/user/autocomplete/:searchTerm` — uses `CONSTANTS.SB_API_KEY` like the
  merged routes but with `useBuggyLog: false`, the non-buggy log variant;
  a real, different (correct) logging behavior, not folded into the
  9-route merge which is uniformly `useBuggyLog: true`.
- `/getWOPdf/:workOrderId` — sends `Accept: application/pdf` and sets
  `responseType: 'arraybuffer'`, neither of which any other route does;
  a real, different response-handling contract for a binary download.

**Testing:** the existing suite (35 tests) checked status codes and the
userId-missing 400 path but never asserted the exact upstream URL,
method, or `userId`-header presence/absence per route — a real gap this
merge could have silently broken without new coverage. Added 9 new
tests, one per merged route, asserting exact request construction:
resolved URL, whether the body is forwarded, and whether `userId`
appears in the outbound headers (present for the 5 routes deriving it
from `extractUserId(req)`, explicitly absent for `/getWorkOrders`,
which has no guard and sends no `userId` at all). All 44 tests
(35 existing + 9 new) pass.

**Combined verification:** full suite run 3 times (3673/3674 — 1
skipped, as always — on runs 2 and 3; run 1 had 2 failures in files
untouched by this change — `discussionHub/users.test.ts`,
`signupWithAutoLoginV2.test.ts` — both showing the documented
`mountRouter`-adjacent "Parse Error: Expected HTTP/" flake signature,
confirmed clean in isolation immediately after, not a regression).
`tsc --noEmit` clean on both configs, `tslint` clean across the repo
(one style finding — `guard?: {value: string | undefined; ...}` should
be `guard?: {value?: string; ...}` — fixed during this same change,
same behavior). `npm run build` clean, `dist/` has 272 `.js` files
(unchanged — both merges stay within their existing files, no new
file created) and zero leaked `.test.js` files. Both routers
(`workAllocationApi`, `workflowHandlerApi`) confirmed still mounted at
their original paths (`/workallocation`, `/workflowhandler`) in
`protectedApiV8.ts`.

**MUST VERIFY IN PROD:** nothing — every route's method, URL, body
forwarding, header set (including the pre-existing buggy-log-string
behavior, the `wid` header, and the org-header guard/no-guard split),
and error response shape is unchanged.

**Sonar result:** not measured — the local Sonar server was unreachable
at the time of this change (same as CHANGE 45). Based on the ~99 net
source lines removed across both files (283+279 lines replaced with
much shorter route registrations plus 2 shared helpers), expect a
further reduction from the last confirmed 6.1%, but this has not been
confirmed by a live scan. Rescan and update this figure once Sonar is
reachable again.

---

## CHANGE 47 — duplication reduction: mobileAppApi.ts, 3 more clusters found on re-read

**Context:** `mobileAppApi.ts`'s remaining ~96 duplicated lines had been
researched and judged "generic boilerplate, too entangled to safely
template further" earlier in this campaign. Same as CHANGE 46, a fresh,
skeptical re-read (not a re-read of the prior summary) found real safe
duplication the earlier pass had mischaracterized or missed entirely.

### Cluster 1 — the 5 `/*/homepageconfig` routes

**What:** `/create`, `/read`, `/getById`, `/updateById`,
`/deleteById/homepageconfig` all share the identical
`axios({...headers: {Authorization: CONSTANTS.SB_API_KEY,
contentTypeHeader}, method, url}) -> res.status(response.status).send(response.data)`
shape feeding into the already-extracted `handleMobileApiDefaultError(res,
err, 'error')`. The earlier pass called this "mostly generic boilerplate" —
on a fresh read it's the exact same axios-call-plus-headers pattern
already proven safe to merge in `workflow-handler.ts`/`workallocation.ts`
(CHANGE 46), not incidental repetition. Extracted to
`proxyHomepageConfigRoute(req, res, method, url, sendBody, logResponse?)`.

**Real difference preserved exactly, caught by re-reading twice:** the
first attempt at this extraction dropped a real behavior — 2 of the 5
routes (`updateById`, `deleteById`) log the upstream response body
*after* a successful call (`logInfo('Response from homepageconfig',
JSON.stringify(response.data))`), which the other 3 don't do. Caught
this by re-reading the diff against the original before running any
tests, not by a test failure — added it back via an explicit
`logResponse` parameter, defaulting to `false` (the 3 routes that don't
log) and passed `true` only at the 2 call sites that need it.

Each route's own pre-call `logInfo` (wording and arguments vary
per-route, including 2 that literally reuse the string `'Inside CBP
course recommendation route '` — a pre-existing copy-paste artifact from
an unrelated route, left as-is) stays at the call site, not folded into
the shared helper.

### Cluster 2 — 5 of 7 scattered `(err && err.response && err.response.status) || 500` catch blocks

**What:** this second family of duplicated catch blocks — distinct from
`handleMobileApiDefaultError`'s existing call sites — was not mentioned
by the earlier pass at all. 7 occurrences
(`/updateUserProfile` ×2, `/courseRemommendationv2`, `/learnerPath`
POST/GET, `/getUnreadUserNotifications`, `/ext-forms/*`) used the same
status/body-fallback logic as `handleMobileApiDefaultError`, just written
in the older `&&`-chain style instead of optional chaining. 5 of the 7
(`/courseRemommendationv2`, both `/learnerPath` routes,
`/getUnreadUserNotifications`, `/ext-forms/*`) call `logInfo(JSON.stringify(err))`
with no prefix — exactly matching `handleMobileApiDefaultError`'s
no-prefix branch — and were rewired to call it directly, with an added
optional `errorMessage` parameter (defaulting to the existing
`DEFAULT_ERROR_MSG` so every pre-existing caller's behavior is
unchanged) so each route's own distinct fallback message text is
preserved.

**Deliberately NOT touched — a real difference found and correctly left
alone:** the other 2 occurrences, both inside `/updateUserProfile`
(the inner Joi-validation catch and the outer route catch), call
`logError(...)`, not `logInfo(...)` — a genuinely different log
severity. Merging them into `handleMobileApiDefaultError` would have
silently downgraded an error-level log to info-level, a real behavior
change disguised as deduplication. Left as-is.

### Cluster 3 — getEntityById / getAllEntity

**What:** both routes share an identical `verifyToken` guard ->
`axios` POST -> `res.status(response.data.responseCode).send(...)`
shape and both use `logError` (matching each other, so safe to merge
unlike cluster 2's exception). Extracted to `proxyEntityRoute(req, res,
url, requestLogLabel, errorLogLabel, failMessage, applyPilotMockEntity)`.
The one real behavioral difference — `getAllEntity` alone
post-processes the response through the pilot-demo `appendPilotMockEntity`
wrapper — threaded through as an explicit boolean, not force-merged.

**Testing:** the existing suite (98 tests) already covered most of the
touched routes' status codes, but per this campaign's deep-verification
standard, 3 real gaps were found and closed with 8 new tests before
trusting any of the 3 merges:
- `getAllEntity` had no URL assertion — added one.
- 4 of the 5 homepageconfig routes (`create`, `read`, `updateById`,
  `deleteById`) had no method/URL assertion at all, and none of the 5
  had a failure-path test — added exact method+URL+body assertions for
  all 4, plus a 500-on-failure test for each of the 5 routes (4 new,
  `create` already had one).
- Both `/learnerPath` routes had **zero** failure-path test — only the
  userId-mismatch 400 branch was covered. Added 4 new tests: an
  upstream-error-with-response case and a transport-failure case for
  each of POST and GET, confirming both the error-forwarding path and
  the default-message fallback path.

All 106 tests (98 existing + 8 new) pass.

Full suite run 3 times, all clean (3681/3682 — 1 skipped, as always —
every time, zero flakes this round). `tsc --noEmit` clean on both
configs. `tslint` clean across the repo (5 findings surfaced during this
change and fixed: a multi-line function signature broke a
`tslint:disable-next-line: no-any` comment's scoping on 2 new helper
functions — fixed by keeping signatures effectively single-statement
with the disable comment directly above the `any`-typed parameters; a
4-element `'POST' | 'GET' | 'PUT' | 'DELETE'` union was replaced with
axios's own `Method` type; an optional `logResponse?: boolean` parameter
was given an explicit `= false` default). `npm run build` clean, `dist/`
has 272 `.js` files (unchanged — both new helpers stay within the
existing file) and zero leaked `.test.js` files. Router
(`mobileAppApi`) confirmed still mounted at `/mobileApp/` in
`publicApiV8.ts`.

**MUST VERIFY IN PROD:** nothing — every route's method, URL, body
forwarding, response-logging behavior (including which 2 of 5
homepageconfig routes log the response and which 3 don't), log
severity (`logInfo` vs `logError`, preserved exactly per site), fallback
error message text, and the `appendPilotMockEntity` pilot-only
post-processing step are all unchanged.

**Sonar result:** not measured — Sonar still unreachable. Based on line
count (270 lines replaced with ~220, net ~50 source lines removed
across 3 clusters, on top of the ~99 from CHANGE 46), expect further
reduction from 6.1%; not yet confirmed by a live scan.

---

## CHANGE 48 — duplication reduction: forgotPassword.ts's email/phone OTP-send tail

**File:** `src/publicApi_v8/forgotPassword.ts`.

**Context:** an exploratory pass over the last handful of files still
showing Sonar duplication after the campaign's 5% target was already hit.
Confirmed via the Sonar duplications API which exact lines were flagged
before touching anything, then re-checked the other 5 candidate files
against this campaign's own prior decisions (see below).

### What changed and why

`/reset/proxy/password`'s email and phone branches, once a user is found,
did the identical sequence: log the resolved `userUUId`, call
`API_END_POINTS.generateOtp` with the same request shape, log the axios
response, and send the same 200 body. Direct diff confirmed the two real
differences are just text: the userId-log label (`'>>>>>>>> User Id : '`
vs `'User Id : '`) and the send-confirmation log label (`'Sending
Responses in email : '` vs `'...in phone part : '`). Extracted to
`sendPasswordResetOtp(res, userUUId, sbUsername, userType,
userIdLogLabel, sentLogLabel)`, with both labels threaded through as
explicit parameters rather than homogenized. A stray, already-dead
comment (`// res.status(200).send(userUUId)`, commented out and never
executed) that sat only in the email branch was dropped along with it.

The `else` branches (user not found, `res.status(302).send(count)` —
including this file's own pre-existing `res.send(0)` bug, documented in
this file's test header) and the outer `/verifyOtp` route were left
completely untouched; they weren't part of the flagged duplication and
carry their own separate pre-existing issues already documented in
`forgotPassword.test.ts`.

### Other 5 candidate files: re-checked, nothing further merged

- **`mobileAppApi.ts`** — the one remaining flagged block (27 lines,
  `/updateUserProfile`'s Joi-validate-then-patch tail) is a cross-file
  match against `protectedApi_v8/user/profile-details.ts`'s
  `/updateUser`, a file already confirmed unmergeable earlier in this
  campaign. Direct diff confirmed the same reasoning still holds:
  `mobileAppApi.ts` gates the whole body behind
  `verifyToken`/`accesTokenResult.status == 200` and forwards the
  caller's own token via `getHeaders(req)`; `profile-details.ts` has no
  such gate and calls upstream with a static `Authorization:
  CONSTANTS.SB_API_KEY` service key instead — a real auth-model
  difference, not cosmetic. Left untouched.
- **`signupWithAutoLoginV2.ts` / `signupWithAutoLogin.ts` /
  `appSignUpWithAutoLogin.ts` / `signupWithAutoLoginOrgForm.ts`** — all 4
  remaining flagged blocks are the family's post-Keycloak-token-exchange
  tail (decode token, set session/kauth, call `getCurrentUserRoles`,
  respond 200), the same block CHANGE 33's cluster E-3 already
  investigated and deliberately left unmerged against the shared
  `ssoKeycloakExchange.ts` helper. Re-diffing the 3-way match among the
  family members themselves (not against the shared helper this time)
  found the same category of real differences that motivated the
  original rejection, now confirmed across 3 files instead of 1: the
  token-exchange payload shape itself differs (v1 sends `client_id:
  'portal'` with an actual `password` field; V2/OrgForm send `client_id:
  'aastrika-sso-login'` with `client_secret` + `scope`, no password —
  a real auth-flow difference, not text); the guard condition differs
  (`authTokenResponse.data` vs `authTokenResponse.data?.access_token`);
  every log line's text and/or level differs across all 3 files
  (`logInfo` vs `logError`, `'VALIDATE_OTP:'`-prefixed vs not, `+ e` vs
  `+ JSON.stringify(e)`). The smaller "outer shell" duplication (the
  `verifyRegistrationOtp` result-handling wrapper around the
  `session.save`/`regenerate` call, shared byte-for-byte between v1 and
  V2 only) was also considered and rejected: its inner body is exactly
  the block above, so extracting the shell alone would only relocate the
  same rejected duplication into a callback parameter without reducing
  it, fragmenting a linear handler for no real simplification. Left
  untouched, consistent with and extending CHANGE 33's original
  reasoning.

### Verified

- `forgotPassword.test.ts`'s existing 19 tests: all pass with zero test
  changes required, proving both branches' external behavior
  (status codes, response bodies, exact log call arguments via the
  mocked logger) is unchanged.
- Coverage on `forgotPassword.ts`: 100% statements/branches/functions/
  lines, no new tests needed.
- Full Jest suite: 223 suites, 3689 passed / 1 skipped (matches the
  pre-existing baseline).
- `npx tsc --noEmit -p tsconfig.json`: clean.
- `npx tslint -c tslint.json -p tsconfig.json`: clean (one `no-any`
  finding surfaced on the new helper's `res` parameter, fixed by moving
  the `tslint:disable-next-line` directly above the parameter line,
  matching this file's own multi-line-signature convention elsewhere in
  the codebase).
- `npm run build`: exits 0, clean `dist/`, zero leaked `.test.js` files.

### MUST VERIFY IN PROD

- [ ] None expected — the extracted function is a body-for-body move of
      both branches' tail with the only two genuine differences (the two
      log labels) threaded through as explicit parameters; every request
      shape, header, URL, and response body is byte-identical to before.

---

## Pre-existing issues NOT changed

Found during review, deliberately left alone — each would be a behavioural
change and needs its own decision:

1. **`getAuthToken()` can hang forever.** In the `request.post` callback, if
   `err` is falsy **and** `body` is empty/undefined, neither `resolve` nor
   `reject` is called and the promise never settles. The caller waits
   indefinitely. Pre-existing; not introduced here.
2. **`JSON.parse(body)` is unguarded.** A non-JSON response (an HTML error page
   from a proxy, for example) throws inside the callback, which is an uncaught
   exception rather than a rejection.
3. **`reject` and `resolve` can both be called** when `err` and `body` are both
   truthy. Harmless today (first call wins) but fragile.
4. **`generateRandomPassword` returns more characters than requested** when
   `length` is less than the number of selected charsets. Not reachable from
   current callers, which all pass length 8 with 4 charsets.

---

## Rollback

Both changes are self-contained in two files with no schema, config, API-shape
or dependency changes. Reverting the commit and redeploying fully restores the
previous behaviour. No data migration is involved and no issued credential is
affected.
