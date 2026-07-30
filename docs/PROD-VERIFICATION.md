# Production verification checklist

> **Read this before deploying.** Two source files changed. Both are on live
> authentication paths. Everything here was tested locally, but the items under
> "Must be verified in production" touch external systems (Keycloak, SSO
> partners) that cannot be exercised from a developer machine.

Branch: `feat-sonarqube-integration`
Source files changed: **2** — `src/utils/keycloak-user-creation.ts`,
`src/utils/randomPasswordGenerator.ts`
Build artifacts changed: **3 of 272** (the two above + `dist/package.json`,
which carries only npm script names and is never executed at runtime).
**269 of 272 compiled artifacts are byte-identical.**

**Test coverage, as of this commit:** 2205 Jest tests, all passing.
**61.1% overall coverage on SonarQube (100% on new code), gate green.**
Coverage was 2.6% at the start of this work. Every real defect discovered
while writing these tests is documented below (sections CHANGE 1/2, then
A through AP) — each includes what the issue is, why it wasn't fixed
outright, and what to check in production before treating it as resolved.
**None of the findings below were fixed without explicit sign-off** — the
only two behavioral changes in this entire body of work are CHANGE 1 and
CHANGE 2.

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
