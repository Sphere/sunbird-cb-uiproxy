# Production verification checklist — AI Studio onboarding

> **Read this before deploying.** This is a new, purely additive service proxy: no
> existing route, handler or constant changed behaviour. It ships with a mocha suite
> (`test/aiStudio.test.js`, 48 cases, 60 consecutive runs green) that runs offline against a mock AI service, so
> nothing here needs the real one to be up and nothing spends money to test. The items
> under "Must be verified in production" touch the Kong route and the AI service's own
> object storage, neither of which can be exercised from a developer machine.

Branch: `feat-onbaord-ai-studio-service`

**New files**

| File | What it holds |
|---|---|
| `src/protectedApi_v8/aiStudio/aiStudio.ts` | Parent router; mounts the four feature routers |
| `src/protectedApi_v8/aiStudio/studio.ts` | Document → video (9 routes) |
| `src/protectedApi_v8/aiStudio/quiz.ts` | Sources → MCQs (8 routes) |
| `src/protectedApi_v8/aiStudio/artifacts.ts` | Direct file storage (3 routes) |
| `src/protectedApi_v8/aiStudio/usage.ts` | Usage and spend report (2 routes) |
| `src/protectedApi_v8/aiStudio/constants.ts` | Upstream endpoints, headers, messages, timeouts |
| `src/protectedApi_v8/aiStudio/helpers.ts` | Identity, multipart, error relay, streaming and wildcard passthrough |

**Modified files**

| File | Change |
|---|---|
| `src/utils/env.ts` | Added `AI_STUDIO_API_BASE`; lifted `KONG_API_BASE` to a module const so it can be derived from |
| `src/protectedApi_v8/protectedApiV8.ts` | Mounted `aiStudioApi` at `/aiStudio` |
| `src/utils/whitelistApis.ts` | Added the 20 route rules, their URL patterns, and 5 wildcards |
| `README.md` | Documented the env var and the route table |
| `test/aiStudio.test.js` | New — 48 mocha/supertest cases against a mock AI service |

---

## What was onboarded

The Aastrika AI service, following the same shape as the playlist service
(`src/protectedApi_v8/playlist.ts`): an Express router per feature area that
forwards to Kong with the portal's gateway key and the signed-in user's Keycloak
token, relaying the upstream status and body unchanged.

Folders 0 (Health), 1 (Auth) and 9 (Sign out) of the Postman collection were
**deliberately not proxied**. The portal authenticates through Keycloak, so the AI
service's own sign-in form has no role here, and liveness is the orchestrator's
business rather than the UI's. They can be added later without touching anything
below.

| Postman folder | Requests | Proxied |
|---|---|---|
| 0 · Health | 2 | no — orchestrator concern |
| 1 · Auth | 2 | no — Keycloak already authenticates |
| 2 · AI Studio — document to video | 9 | yes |
| 3 · Quiz — sources to MCQs | 8 | yes |
| 4 · Artifacts | 3 | yes |
| 5 · Usage & spend | 5 requests over 2 endpoints | yes |
| 9 · Sign out | 1 | no — no session to end |

---

## CHANGE 1 — Creator identity travels in `x-aastrika-creator`, set from the session

**Files:** `helpers.ts` (`resolveCreator`, `buildUpstreamHeaders`), `constants.ts`

### What the issue was

Three identities were in play and only one of them answers the question the dashboard asks.

| | `x-consumer-username` | `x-aastrika-creator` |
|---|---|---|
| Set by | Kong, after it verifies the API key | The consuming app, on the request |
| Can a caller fake it? | No — it cannot reach the service except through Kong | Yes — anyone can type any name |
| Identifies | The **application** (e.g. `aastrika-web`) | The **person** |

Kong authenticates the consuming app, not the human using it, so `x-consumer-username` is one
value for every request the portal makes. The usage report needs to say which health worker
made the video; the portal knows that and Kong does not. `x-aastrika-creator` is the AI
service's whole client integration — one header, on every endpoint.

Two earlier versions of this got it wrong, and both are worth recording because the mistakes
are easy to repeat:

1. It set `x-consumer-username` to the session user. That is Kong's header to write, and if
   Kong had forwarded ours rather than overwriting it, this proxy would have been the
   component putting an unverified claim into the field the service treats as proven.
2. It stamped a `creator` field into request bodies. That was based on an older draft of the
   service's contract; the service takes the header, not a body field.

### Why it was fixed this way

`buildUpstreamHeaders` sends exactly two headers — `Authorization` for Kong and
`x-aastrika-creator` for the AI service — on **every** upstream call, named routes and
wildcard passthrough alike.

Three headers, and the reasoning for each:

| Header | Why |
|---|---|
| `Authorization` | The portal's gateway key. Kong identifies the consuming application from it. |
| `x-authenticated-user-token` | The signed-in user's Keycloak token. The AI service does not read it — but **every** other protected route in this repo that calls Kong on a user's behalf sends it (14 files, no exceptions; only the public login routes omit it, and they have no user yet). Being the single caller that leaves it out risks an integration that fails only once deployed, for a saving that is not worth it. |
| `x-aastrika-creator` | The person. Set from `resolveCreator(req)`. |

`x-consumer-username` is **not** sent: Kong writes it after verifying the API key, and it names
the application rather than the person, so our own value would be a claim in the field the
service treats as proven.

Both `x-authenticated-user-token` and `x-aastrika-creator` are omitted rather than sent empty
when the session cannot supply them — an undefined header value is
`ERR_HTTP_INVALID_HEADER_VALUE` in Node, which would surface as an opaque 500 from inside the
proxy instead of a 401 from the gateway. It is set after the header spread
and never read from the incoming request, so a caller who sends their own
`x-aastrika-creator` has it overwritten — spend cannot be recorded against somebody else.
`x-consumer-username` is not sent at all.

Request bodies are now forwarded **byte-for-byte as they arrived**. The proxy adds, drops and
rewrites nothing, which is both simpler and makes the AI service's own Postman collection an
exact description of what it receives.

`resolveCreator` tries three sources in order:

| # | Source | Example | Why here |
|---|---|---|---|
| 1 | Keycloak display name (`name`, else `given_name` + `family_name`) | `Asha Kumari` | What the dashboard's Creator column should read like |
| 2 | Sunbird `session.userName` | `asha.kumari` | Less readable but always distinct; used when the profile has no display name |
| 3 | `session.userId` | a UUID | Set by `custom-keycloak.ts` on every authenticated request, so something is always there |

With none of the three the header is omitted rather than sent empty, and the service records
the work against `admin` — a truthful "we do not know" instead of a blank name.

**The display name is deliberately preferred, and it is not unique.** Two users called Asha
Kumari become one row in the usage report, and their spend cannot be separated afterwards
because it was recorded that way. That is an accepted trade for a readable dashboard rather
than an oversight: `userName` is unique and was the original choice, and promoting source 2
back above source 1 is a one-line change if per-person accuracy turns out to matter more than
readability.

`session.userName` is populated at login by `setRolesData` — every sign-in path calls it
(`ssoLogin`, `emailOrMobileLoginSignIn`, `googleSignInRoutes`, the partner auth routes, the
signup-with-auto-login routes, and the Keycloak `authenticated` hook), so it does not depend on
`PORTAL_API_WHITELIST_CHECK`.

### Must be verified in production

1. **Confirm the usage report's Creator column shows the individual user**, not `admin` and not
   the portal's Kong consumer name. Create a video as a normal user and look. `admin` means the
   header is not arriving — check whether Kong strips unknown `x-` headers on that route.
2. **Confirm the display name is actually populated in Keycloak** for real users, and that it
   is what the dashboard should group by. If tokens in this environment carry no `name` claim
   the report will quietly show `userName` instead, which is correct but different from what
   was intended — and the two are not interchangeable as filter values in 5.2.
3. **Check whether any two active users share a display name.** If they do, their spend is
   already merged in the report and only source 2 can separate it.
4. **Confirm the delete routes work for a normal user's own content**, and that they do *not*
   let one portal user delete another's. If the service authorises deletes on
   `x-consumer-username` — the app — every portal user arrives as the same consumer. That is a
   question for whoever owns the AI service.

---

## CHANGE 2 — File-serving routes pass the redirect through instead of following it

**File:** `helpers.ts` (`forwardDownload`)

### What the issue was

`studio/download-video`, `quiz/export` and `artifacts/:contentId/:filename` answer a
302 to a short-lived storage URL when object storage is configured, and the bytes
themselves when the service runs on local storage. Axios follows redirects by
default and buffers the whole response, which would pull an entire MP4 through the
proxy's heap for no benefit.

### Why it was fixed this way

`maxRedirects: 0` plus `validateStatus: () => true` stops axios doing either thing
for us, and the three cases are then handled explicitly:

- **3xx** — the `location` header is relayed with `res.redirect`, and the redirect's
  (empty but open) response socket is destroyed. The signed URL is minted for the
  browser, so the browser is who should follow it.
- **2xx** — streamed with `.pipe`, carrying `Content-Type`, `Content-Length` and
  `Content-Disposition` so the file saves under the right name.
- **4xx/5xx** — the error body is drained to a string and relayed verbatim with its
  original status. Relaying a stream as JSON would have produced an empty body.

### Must be verified in production

4. **The storage URL must be reachable by the browser.** If the AI service is
   configured with an internal MinIO or S3 endpoint hostname, the 302 will point at
   a host the user's browser cannot resolve. Download a finished MP4 and an xlsx
   export from a real browser, not just from curl inside the cluster.
5. **Confirm the signed URL's lifetime** is long enough for a large MP4 to start
   downloading. The URL expires; the proxy deliberately does not cache it.

---

## CHANGE 3 — Upstream status codes are relayed, not collapsed

**File:** `helpers.ts` (`handleUpstreamError`, `relay`)

### What the issue was

Several AI service responses carry meaning the UI must branch on: a **201** from
`generate-plan` and `quiz/generate`, a **202** with a queue position from
`generate-video`, a **422** when the source material is too thin for the number of
questions asked for, a **400 SOURCE_MISSING**, a **403** on someone else's content.
Normalising these to 200/500 would destroy the contract.

### Why it was fixed this way

Success relays `response.status` rather than hardcoding 200. Failure relays the
upstream status and body untouched; only a transport failure, where there is no
upstream response to pass on, becomes a 500. This is the same pattern
`playlist.ts` uses.

### Verified locally

A mock 422 with `{ error: { code: 'THIN_MATERIAL' } }` arrives at the caller as a
422 with that body intact.

---

## CHANGE 4 — Path segments supplied by the caller are percent-encoded

**File:** `constants.ts` (`segment`)

### What the issue was

Job ids, content ids and filenames are interpolated straight into the upstream URL.
A filename is whatever the uploader typed, and an unencoded `/` or `?` in one would
address a different upstream resource than intended.

### Why it was fixed this way

Every interpolated segment goes through `encodeURIComponent`. Verified locally: a
request for `/quiz/../../usage/get-report` reaches the upstream as
`/v1/quiz/..%2F..%2Fusage%2Fget-report`, not as the usage endpoint.

---

## CHANGE 5 — Timeouts sized per class of call

**File:** `constants.ts` (`TIMEOUTS`)

The shared presets in `configs/request.config.ts` do not fit this service: the 10s
default is too tight for a model call and the 200s `axiosRequestConfigVeryLong` is
far too loose for a list endpoint. Four values are defined instead — `READ` 30s,
`DOWNLOAD` 120s, `GENERATION` 200s, `UPLOAD` 200s — all inside the app's own 240s
`connect-timeout`.

### Must be verified in production

6. **`GENERATION` (200s) must cover the real `generate-plan` latency** for the
   longest documents in use, and `UPLOAD` (200s) must cover transcribing the longest
   video anyone uploads to the quiz builder. Both sit under the app's 240s connect
   timeout, so raising them further means raising that too.

---

## CHANGE 6 — Route ordering on the quiz router

**File:** `quiz.ts`

`GET /:quizJobId` is declared **last**. Express matches in declaration order, so
declared earlier it would have captured `/languages` and `/list`, which are literal
single-segment paths on the same router. The same ordering is mirrored in
`whitelistApis.ts`: the literal paths are listed in `URL_PATTERN` before the
`:quizJobId` pattern, so a concrete `/quiz/list` resolves to its own rule rather
than being rewritten to the pattern's.

---

## CHANGE 7 — A wildcard passthrough, so new upstream endpoints need no change here

**Files:** `helpers.ts` (`forwardAny`, `buildForwardedBody`), each feature router's trailing
`.all('/*')`, `aiStudio.ts`, `whitelistApis.ts`

### What the issue was

Writing each endpoint out by hand documents and validates the surface in use today, but it
also means the AI service cannot ship an endpoint the portal can reach until this proxy is
edited, reviewed and released. For a service under active development that is the wrong
default.

### Why it was fixed this way

Every feature router ends with `.all('/*')`, declared last so that Express — which matches in
declaration order — always prefers a named route. The wildcard relays the method, path, query
string and body as they arrived and streams the response back, so a new endpoint works
whether it answers with JSON, a file or a redirect.

`aiStudio.ts` carries one more, one level up, for a feature area that does not exist yet at
all. It relays the path verbatim rather than mapping it, so a future `/v1/translate/run` is
`/protected/v8/aiStudio/v1/translate/run`.

Two details worth knowing:

- **Multipart is rebuilt, not forwarded.** `express-fileupload` has already consumed the
  request stream and buffered each part by the time any route runs, so `buildForwardedBody`
  reassembles the body from `req.files` and `req.body` under the field names it arrived with.
- **`creator` is stamped only when the caller already sent it.** The named creating routes
  always stamp it; the wildcard does not, because an endpoint this proxy has never seen may
  reject an unexpected field. Where a caller does try to set it, the session value still
  wins — which is the property that matters.

### Must be verified in production

8. **Confirm the Kong route is a prefix route**, not an enumeration of paths. If Kong only
   whitelists the endpoints known today, the passthrough buys nothing — the gateway will
   reject the new path before the AI service sees it.

---

## CHANGE 8 — Five defects found while testing the forwarding code

All five were found by tests written against the forwarding code, and all five are fixed.

### 8a — An undefined header value crashed the request

`extractUserToken()` returns `undefined` when a request arrives without a Keycloak grant.
Node rejects a header whose value is `undefined` with `ERR_HTTP_INVALID_HEADER_VALUE`, so
that case surfaced as an opaque 500 from inside the proxy instead of a 401 from the gateway.

`buildUpstreamHeaders` now sets the header only when a token exists, rather than setting it
unconditionally and filtering afterwards, so the undefined case cannot arise. The same guard
applies to `x-aastrika-creator`.

> **The bug itself is still live in `src/protectedApi_v8/playlist.ts`**, which this service
> was modelled on — it passes `extractUserToken(req)` straight into an axios header. Recorded
> here as pre-existing; deliberately **not** fixed, since it is an unrelated file and outside
> the scope of this change.

### 8b — Copying `Content-Length` truncated compressed downloads

Axios decompresses a gzipped body before this code sees it **and deletes `Content-Encoding`
when it does** — but leaves the *compressed* `Content-Length` in place. Copying that header
made the browser wait for a body that had already ended
(`ERR_CONTENT_LENGTH_MISMATCH`), and there is nothing left in the response to detect the
situation from. `Content-Length` is now never copied on a streamed body; the response goes
out chunked, which is correct either way. The only thing lost is a determinate progress bar.

### 8c — A stream that died mid-body was served as a complete response

The body goes out chunked, so a truncated read looked like a successful short file to the
caller. Worse, an `'error'` event with no listener is *thrown*, which would have taken the
process down. `relayStreamedResponse` now listens for both `'error'` and `'aborted'` and
destroys the connection, which is what tells the client the body is incomplete. Verified: the
caller sees `ECONNRESET` and the proxy stays up.

### 8d — `Range` requests could not be served

A video player seeking within a file sends `Range`, and nothing forwarded it. `Range` is now
carried upstream and `Content-Range` / `Accept-Ranges` are carried back, so byte-range
playback works in the local-storage mode where the service streams bytes itself. (In object
storage mode the browser ranges against storage directly, after the 302.)

### 8e — A download broke the request that came after it

**This one was live in production code, and it is the most consequential of the five.**

`forwardDownload` called `response.data.destroy()` on the redirect body of every 302 — so on
every `download-video` and every `quiz/export`. Destroying an `IncomingMessage` aborts a
socket that axios' keep-alive agent has already taken back into its pool. The **next** upstream
call picks up that dead socket, gets `ECONNRESET`, and the proxy answers 500 without ever
reaching the AI service.

In practice: download a video, and the request immediately after it could fail with a 500.
Intermittent, because it depends on whether the pool hands back that particular socket.

The fix is to drain the body rather than abort it — a 3xx body is empty or tiny, so draining
costs nothing and the connection returns to the pool healthy:

```ts
if (response.data && typeof response.data.resume === 'function') {
    response.data.resume()
}
```

**How it hid.** The test that kept failing was `keeps /languages and /list from being read as
quiz ids`, and it asserted only `lastHit().url`, never the status. When the request failed at
the transport layer no upstream hit was recorded, so `lastHit()` returned the *previous*
test's hit — and the assertion failed with a misleading "expected `/v1/quiz/list`, got
`/v1/quiz/languages`" instead of "this request never arrived". It looked like a routing flake
for several rounds, and a first guess at the cause (`Connection: close` in the mock) was wrong
because it was a guess rather than a capture.

Two changes came out of that:

- That test now asserts status alongside path, with a comment saying why, so a request that
  never reaches upstream fails loudly.
- A dedicated regression test, `does not break the next request after a redirect is relayed`,
  relays a 302 and then immediately makes another call and asserts it reaches upstream.

---

## CHANGE 9 — The proxy does not validate request bodies

**Files:** every router, `helpers.ts` (`respondBadRequest` removed), `constants.ts`
(`ERROR_MESSAGES` pruned to two)

### What the issue was

The first version of these routes checked required fields before forwarding — no `docText`
on a plan, no `feedback` on a revision, no material on a quiz, no file on an upload — and
answered 400 locally. It saved a round trip on a request that was going to be rejected
anyway.

The cost is worse than the saving. Which fields an endpoint requires is the AI service's
rule, and a second copy of it in a forwarding layer only drifts. The first time the service
relaxes a rule — makes `userPrompt` optional, accepts a plan built from `sourceId` alone —
this proxy would go on refusing requests the service would have accepted, and the failure
would look like the service's, not the proxy's. It also meant a caller could get two
different error messages for the same mistake depending on which layer caught it.

### Why it was fixed this way

The checks are gone. A body goes upstream as it arrived and the service's own rejection,
status and message are relayed untouched — which is what CHANGE 3 already did for the
interesting errors like the 422 for thin material, now applied consistently.

What remains is not validation: path segments are still percent-encoded (CHANGE 4), the
creator is still stamped from the session (CHANGE 1), and multipart is still rebuilt because
`express-fileupload` has already consumed the stream. None of those are opinions about
whether a request is valid.

Two errors are still raised locally, and both are about the proxy's own plumbing rather than
the caller's request: a transport failure with no upstream response to relay becomes a 500,
and a 3xx with no `location` header becomes a 502.

### Effect on callers

A malformed request now costs one round trip to the AI service instead of failing at the
portal, and comes back with the service's error body rather than
`{"message":"…","status":"error"}`. The UI should surface the relayed message.

---

## CHANGE 10 — A 10% flaky test suite, and what it was not

The suite failed roughly one run in ten. Worth recording because three plausible
explanations were wrong before the right one, and the wrong ones each looked convincing.

### What it was

`supertest` binds a fresh server on an ephemeral port for every `request(app)` call — about
55 per run here. The OS recycles those ports, and a pooled keep-alive socket left over from a
server that has since closed can be handed out for a freshly-bound live one. The client then
reads bytes that are not a status line.

Two signatures, one cause:

```
Error: Parse Error: Expected HTTP/
'/v1/studio/future-upload' !== '/v1/translate/run?q=hi'
```

The second is a response landing on the wrong request, which is also why earlier failures
looked like "the request never reached upstream" (`lastHit()` returning the previous test's
hit) and "the body arrived without its fields" (a 400 from material that belonged to another
request). Three symptoms, one fault.

The harness now binds once in `before()` and addresses that single server:

```js
server = app.listen(0, "127.0.0.1", done)
const api = () => request(server)
```

**60 consecutive runs, 0 failures**, against 4-in-40 before.

### What it was not

| Hypothesis | Why it looked right | Verdict |
|---|---|---|
| A test destroying a socket poisoned the shared mock | It really does destroy one, 20ms asynchronously | Wrong — 3 failures in 40 with that test excluded |
| Keep-alive connection reuse between proxy and upstream | The `Parse Error` is exactly what desync looks like | Wrong — 2 failures in 30 with `keepAlive` disabled |
| `Connection: close` missing on the truncating response | Plausible mechanism, cheap to try | Wrong — guessed rather than measured |

### What it cost, and the lesson

Each wrong hypothesis was a guess at a mechanism instead of a reading of the error. The
actual diagnosis took one clean soak that printed the failure text verbatim — no
instrumentation, no theory. Two further process errors made it slower: soaks were run
concurrently with edits to the source under test, so results could not be attributed to a
known state; and the first capture attempts filtered mocha's output so aggressively that the
failure detail was discarded.

One genuine proxy defect did come out of the investigation — the redirect body being
destroyed rather than drained, recorded as 8e. That one was real, and would have bitten in
production.

---

## Configuration

`AI_STUDIO_API_BASE` defaults to `${KONG_API_BASE}/ai-studio`, which is the path the
Postman collection documents for Kong. Set it explicitly if the Kong route uses a
different prefix.

To support that default, `KONG_API_BASE` was lifted to a module-level const in
`env.ts` and the `CONSTANTS` entry now uses shorthand. **The resolved value is
unchanged** — same env var, same fallback string.

### Must be verified in production

7. **The Kong route for `/ai-studio` must exist and must strip that prefix**, so
   `<kong>/ai-studio/v1/studio/upload` reaches the AI service as `/v1/studio/upload`.
   `GET /protected/v8/aiStudio/quiz/languages` is the cheapest way to check: it takes
   no arguments, spends nothing, and either returns a language list or fails loudly.

---

## Verification performed locally

**Type check** — `tsc --noEmit -p tsconfig.json`: clean across the whole project.

> Note: the project's `tsc` and `gulp build` also report two pre-existing
> `TS1005` syntax errors in `node_modules/@types/babel__traverse/index.d.ts`. That
> package uses `infer N extends number`, which needs TypeScript 4.7+; the repo pins
> 4.2.4. It is unrelated to this change and present on `cbrelease-4.0.1`. The clean
> result above was obtained by neutralising that one `.d.ts` for the duration of the
> run, and confirmed to still catch real errors in `src/` by injecting one.

**Lint** — `tslint -c tslint.json` clean on every new and modified file.

**Tests** — `npx mocha test/aiStudio.test.js`: 48 passing. `npx mocha 'test/*.js'`
(the whole repo suite): 56 passing, nothing regressed.

The suite mounts the real routers on an Express app with a fake Keycloak session and
points them at a mock AI service that records what arrived. It covers:

- All 22 named routes reach the correct upstream path with the correct method.
- Multipart uploads arrive intact — single file, multiple files under one field, text
  fields, and links with no file at all.
- `Authorization`, `x-authenticated-user-token` and `x-aastrika-creator` are present on every
  call, read endpoints included, and `x-consumer-username` is **never** sent.
- With no readable session both the creator and the token headers are omitted rather than sent
  empty, so the service records `admin` and Node does not reject the request.
- A caller-supplied `x-aastrika-creator: somebody-else` is overwritten with the session
  identity, on named routes and on the wildcard alike.
- The whole fallback ladder has a case each: display name, given + family name, Sunbird
  `userName`, user id, and nothing at all.
- Request bodies arrive byte-for-byte as sent: a `deepStrictEqual` asserts the proxy adds,
  drops and rewrites nothing.
- 201, 202 and the 422 for thin material all relay unchanged.
- A 302 relays as a 302 with the storage URL intact; a direct-bytes response streams
  through with its `Content-Disposition`.
- A request missing a field the AI service requires — no `docText`, no `feedback`, no
  assessment, no quiz material, no file — reaches upstream anyway, and **the service's own
  400 is what the caller sees**. The assertions check both halves: that upstream was called,
  and that the relayed error carries the service's code rather than one invented here.
- `/languages` and `/list` are not swallowed by `/:quizJobId`.
- The wildcard carries an unknown endpoint, a nested path, a non-GET method, a rebuilt
  multipart body, a new feature area, a redirect and a 404 body — and never wins over a
  named route.
- The five defects in CHANGE 8 each have a regression test.
- A traversal attempt in a job id is encoded rather than resolved.

**Whitelist** — every concrete route, plus six paths that do not exist upstream yet, was
run through the same `pathToRegexp` + `URL_PATTERN` resolution `apiWhiteList.ts` performs.
All resolve to a rule: the named paths to their own, the unknown ones to the wildcards.
The wildcards are listed **after** the concrete patterns so a real path never resolves to
one of them. This matters only when `PORTAL_API_WHITELIST_CHECK=true`; when it is false the
middleware calls `next()` regardless.

Note the wildcards are `:rest+` rather than `(.*)`: `apiWhiteList.ts` looks the resolved
pattern up with `_.get`, which treats a `.` in the key as a path separator.

---

## Live verification against the deployed Kong route — 2026-09-18

Run against `https://sphere.aastrika.org/api/ai-studio` with the proxy mounted locally on
`:3003` and a stand-in for the Keycloak session, so every request took the real path:
**client cookie → proxy → Kong → AI service**.

`AI_STUDIO_API_BASE` needed no change: its default, `${KONG_API_BASE}/ai-studio`, already
resolves to exactly that URL.

### Routes verified end to end

| Area | Result |
|---|---|
| 2 · AI Studio | **8/8** — upload, list-voices, generate-plan, revise-plan, get-video, list-videos, download-video (302), delete-video |
| 3 · Quiz | **8/8** — languages, upload, generate, list, read, update, export (302), delete |
| 4 · Artifacts | **0/3** — blocked upstream, see below |
| 5 · Usage | **2/2** — POST and GET, including query forwarding |
| Wildcard passthrough | **2/2** — unknown path reached the service; root passthrough works |

`POST /studio/generate-video` was **deliberately not run**: it is the one call that spends
real money, and nothing in a route test justifies that. Everything created during the run
(one plan, one quiz) was deleted afterwards; the usage totals were identical before and after.

### Answers to the open verification items

1. **Kong is a prefix route.** An endpoint the service does not have returned the *service's*
   own `{"error":{"code":"NOT_FOUND"}}`, not a Kong "no Route matched". The wildcard
   passthrough therefore works as intended.
2. **Kong requires the gateway key** — no `Authorization` gives 401 — and **strips the
   `/ai-studio` prefix** correctly.
3. **Kong forwards `x-aastrika-creator` untouched.** Sending `Priya Sharma` records the
   creator as `Priya Sharma`, spaces and capitals intact. The service does not normalise it,
   so the display-name choice in CHANGE 1 reaches the dashboard as intended.

### One real upstream defect found

`POST /v1/artifacts/upload` answers **400 `UPLOAD_FAILED` — "Could not store the file"**.

This is **not** a proxy fault: the identical request direct to Kong, bypassing the proxy
entirely, fails the same way. The AI service cannot write to its artifact storage. Until that
is fixed, `artifacts/upload` and the two routes that depend on an uploaded file
(`GET`/`DELETE /artifacts/:contentId/:filename`) cannot be exercised at all.

**For whoever owns the AI service:** check its object-storage credentials and bucket
configuration in this environment.

### Two service behaviours worth knowing, neither a bug

- **`POST /studio/upload` returns `sourceId: null` for a plain `.txt`.** The upload succeeds
  (200, text and char count returned); a source id appears to be minted only where there are
  slide pages to reference, as in a PDF. Send a PDF if a later `generate-plan` needs to plan
  against slides.
- **`POST /quiz/generate` answers 422 `NOT_ENOUGH_CONTENT` on thin material**, naming the word
  count and the number of questions it cannot support — "only ~43 words — too little to
  support 3 distinct questions". That is the documented behaviour working, and the proxy
  relays it with the message intact. A 385-word source generated three questions without
  complaint.

---

## Not done

- **Health, auth and sign-out routes** (folders 0, 1 and 9) — see "What was
  onboarded" above.
- **No response reshaping.** Bodies are relayed as the AI service sends them, so the
  Postman collection stays an accurate description of what the UI receives.
- **No caching.** `list-videos`, `list` and `get-report` hit upstream every time.
  Worth revisiting if the dashboard turns out to poll them hard.
- **The wildcard makes the health and auth routes reachable** as
  `/protected/v8/aiStudio/healthz` and `/protected/v8/aiStudio/auth/*`, since it relays
  anything it does not recognise. That is a consequence of a general proxy, not an
  invitation: they are still not part of the documented surface, and the portal has no
  reason to call them.
