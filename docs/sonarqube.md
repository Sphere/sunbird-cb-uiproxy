# SonarQube / SonarCloud

Code-quality analysis for `sunbird-cb-uiproxy`. Sonar is a **read-only observer**
of the source: nothing here changes application behaviour, runtime dependencies,
or build output.

- **Local development** → a throwaway SonarQube in Docker
- **CI** → SonarCloud (org `sphere`, project `Sphere_sunbird-cb-uiproxy`) 

The same scripts work against both. They source a git-ignored `.env.sonar` only
if it exists, otherwise they use whatever `SONAR_*` variables are already in the
environment, so no command needs editing between a laptop and CI.

---

## Quality goals

Enforced with **Clean as You Code**: the gate judges **new and changed code
only**. A low legacy baseline therefore never breaks a build, and quality
ratchets upward as code is touched.

| Goal | Target on new code |
|---|---|
| Security rating | A (zero vulnerabilities) |
| Reliability rating | A (zero bugs) |
| Maintainability rating | A (tech-debt ratio ≤ 5%) |
| Coverage | ≥ 60% |
| Duplicated lines | ≤ 3% |
| Security hotspots reviewed | 100% |

> The built-in "Sonar way" gate sets **Coverage on New Code to 80%**, stricter
> than our 60% target. `npm run sonar:gate` creates a separate gate with the
> correct value — do not just assign "Sonar way".

**Overall coverage floor: ≥ 80%.** Added once the Phase 1/2 Jest coverage
campaign pushed the whole-repo figure to 81%. This is the one condition in
the gate that is **not** new-code-scoped — Clean-as-You-Code alone can't
prevent the absolute number from drifting down again (a PR that only
touches already-covered lines could still let the overall percentage slip
if untested code is added elsewhere without being flagged as "new" in the
sense Sonar tracks). `npm run sonar:gate` keeps this condition in sync;
re-run it any time to correct drift.

---

## Known flakiness: rare spurious failure in the full suite

Occasionally, a single test somewhere in the suite fails with an unexpected
value — e.g. an HTTP status the mock was never configured to return. It is
not the same test each time. It has **never** reproduced when re-running just
the affected file in isolation, and an immediate retry of the full suite is
reliably clean.

**Root cause, confirmed**: `src/test-support/mountRouter.ts` (the shared
supertest harness nearly every route-handler test uses) originally created a
brand-new Express app and let supertest spin up a fresh ephemeral-port server
via `listen(0)`/`close()` for **every single request**. At small suite sizes
(~600 tests) this produced the rare (~1-in-10 full-suite runs) bind/connect
race described above. As the suite grew past ~1000 tests, the same churn
(1000+ listen/close cycles in a ~15s run) made the failure rate climb to
**nearly every run** — confirmed by deliberately running the full suite
repeatedly and watching the failure rate scale with test count, always a
different test, always clean in isolation, ruling out a logic bug in any one
test or a real mock escape.

**Fix applied**: `mountRouter()` now caches and reuses one long-lived server
per `(router, basePath)` pair for the common `mountRouter(router)` call (no
`session`/`requestProps` override) — cutting total listen/close cycles from
1000+ down to roughly one per test file. Calls that pass `session`/
`requestProps` (a handful of auth-flow test files that need per-test-isolated
session mocks) intentionally keep the original fresh-app-per-call behavior.
Since `agent()` is normally invoked from inside a running `it()` block, and
Jest hook registration (`afterAll`, etc.) is only valid during the collection
phase, the cached servers are **never explicitly closed** — they're reclaimed
when the process exits. This requires `forceExit: true` in `jest.config.js`
(added alongside this fix); without it the process hangs after the last test
instead of exiting.

Measured effect: at ~1054 tests, the failure rate dropped from "fails nearly
every run" back down to roughly the original ~1-in-8–10 baseline (8 full runs:
7 clean, 1 flaky). The fix is a meaningful mitigation, not a full elimination
— the underlying mechanism (concurrent ephemeral TCP servers, even far fewer
of them) is still probabilistically possible.

If this repeats in CI, just retry the job. If the flake rate climbs again as
the suite grows further (per the Phase 1/2 coverage plan), the next lever is
`--detectOpenHandles` plus test sharding by directory, rather than further
server-reuse tuning.

## Coverage: now measured via Jest (superseded the "no data" gap below)

A Jest unit-test harness (`src/**/*.test.ts`, co-located with source) now
covers a growing share of the route-handler and utility code, real coverage
data flows into Sonar via `sonar.javascript.lcov.reportPaths` (pointed at
`coverage/lcov.info`), and `sonar.coverage.exclusions` covers only genuinely
side-effectful bootstrap files (`src/index.ts`, `src/server.ts`,
`src/configs/**`, the logger, `src/test-support/**`).

**To regenerate before a scan**: run the full Jest suite with its default
reporters — `npx jest --coverage` (do **not** override `--coverageReporters`
to something like `json-summary` alone; that silently skips regenerating
`lcov.info`, leaving Sonar re-uploading a stale/narrow snapshot from whatever
the last such override happened to cover). Then `npm run sonar:scan`.

The two suites under `test/integration/` are a separate, older thing —
black-box HTTP calls against a deployed environment
(`supertest("https://sphere.aastrika.org/apis/")`). They never import `src/`
and contribute nothing to coverage; they are not part of the Jest coverage
run.

---

## Local run

### 1. Start a local SonarQube

```bash
docker compose -f docker-compose.sonar.yml up -d
# http://localhost:9000  — admin/admin, change on first login
```

Notes:
- Linux may need `sysctl -w vm.max_map_count=262144`. Docker Desktop handles it.
- The bundled Elasticsearch refuses to start when the disk is **>95% full**
  ("flood stage watermark" in the container logs) — free space first.
- No Docker? SonarQube also runs standalone from the zip with Java 17
  (`bin/<os>/sonar.sh start`). Either way the scripts below are identical; they
  only care about `SONAR_HOST_URL`.
- SonarQube **9.x** takes the token as `sonar.login`; **10.x+** uses
  `sonar.token`. `scripts/sonar-scan.sh` passes both, so it works on either.

> **Sizing caution.** A default local SonarQube uses an embedded H2 database and
> warns that it is "for evaluation purposes only". This repo is ~46k lines across
> 263 TypeScript files — considerably larger than a typical microservice. If you
> are reusing one local instance for several projects, expect it to get slow, and
> do not treat that database as durable. For anything long-lived, point
> `SONAR_HOST_URL` at a real server with PostgreSQL.

### 2. Configure credentials

```bash
cp .env.sonar.example .env.sonar
```

Create a project with key `Sphere_sunbird-cb-uiproxy`, generate a token
(**My Account → Security → Generate Token**), and put it in `.env.sonar`.
`.env.sonar` is git-ignored and must never be committed.

`sonar:gate` needs a token with **admin** rights; the others need only a user token.

### 3. Analyze

```bash
npm run sonar:local     # scan, then apply the gate + hotspot reviews, then report
```

`sonar:local` chains four steps: `sonar:scan` (run the scanner) →
`sonar:gate` (apply the quality gate as code) → `sonar:hotspots` (replay the
recorded review decisions from `scripts/sonar-hotspot-reviews.mjs`) →
`sonar:report` (current-vs-target table in the terminal). All four are
idempotent, so running `sonar:local` repeatedly is safe.

**This matters because local SonarQube is a throwaway server per developer**
(see "Local development" above) — review state and the quality gate live in
each server's database, not in git, so a fresh `docker compose ... up` always
starts unreviewed. Skipping the chain (e.g. running `sonar:scan` directly) is
why two developers scanning the identical branch can see Security Review A on
one machine and E on another: whoever last ran the full `sonar:hotspots` step
against their own server has reviewed hotspots there; everyone else's fresh
instance is still sitting at 0% reviewed. Always use `npm run sonar:local`,
not the bare `sonar:scan`, so this can't happen silently.

The individual steps remain available for CI or troubleshooting:

```bash
npm run sonar:scan      # scanner only
npm run sonar:gate      # apply the quality gate as code (idempotent)
npm run sonar:hotspots  # replay hotspot review decisions (idempotent)
npm run sonar:report    # current-vs-target table in the terminal
```

### 4. Stop

```bash
docker compose -f docker-compose.sonar.yml down
```

---

## CI

### GitHub Actions — `.github/workflows/sonar.yml`

Runs on pushes to `development`, `cbrelease-4.0.1`, `production` and on PRs into
the first two. Checks out with `fetch-depth: 0` (Sonar needs blame data to
attribute new code), installs dependencies with `--ignore-scripts`, runs the
Jest unit suite with coverage (`npm run test:coverage`, producing
`coverage/lcov.info`), then scans with `SonarSource/sonarqube-scan-action`.

**It does not run `test/integration/`** — see [Quarantined tests](#quarantined-tests).
The Jest unit suite (`src/**/*.test.ts`) is fully mocked with no network calls,
so it runs safely in CI; only the live-network integration suite is excluded.

Server-side setup: the `SONAR_TOKEN` secret in the `sonarcloud` environment.
Everything else comes from `sonar-project.properties`.

> This replaced `tests.js.yml`, which called the removed `test-with-coverage`
> script and ran the production-hitting suite on every PR.

### Jenkins — `Jenkinsfile`

Two additive stages, `SonarQube Analysis` and `Quality Gate`, placed after
`docker-pre-Build` so analysis runs against an already-built artifact and cannot
influence what is deployed.

Both stages **swallow their own failures** during rollout, and the gate uses
`waitForQualityGate abortPipeline: false` — it reports status without failing the
build. Flip to `abortPipeline: true` (and drop the `catch`) once it has run
cleanly a few times.

Jenkins-side prerequisites, configured on the server rather than in this repo:

- **Manage Jenkins → System → SonarQube servers**: an entry named `sonarqube`
  with its URL and token credential (the name must match `withSonarQubeEnv`).
- **Global Tool Configuration**: a SonarScanner install named `sonar_scanner`.
- Optional: a Sonar **webhook** back to Jenkins so `waitForQualityGate` returns
  promptly instead of waiting out the timeout.
- The build node needs a Node toolchain new enough for the scanner. The app's own
  images (`node:12` / `node:14`) are too old, which is why analysis runs as its
  own stage rather than inside the build image.

---

## Quarantined tests

`test/integration/` contains live integration tests that make real network calls
to a deployed environment. One case POSTs an assessment payload, so pointed at
production **it writes data to production**.

They are excluded from every pipeline. Run them deliberately:

```bash
npm run test:integration
```

Their assertions have not been modified or weakened — they are simply not run
automatically.

---

## Moving to a different server

Review state lives in each server's database, not in this repo, so it does not
travel with a checkout.

- [ ] Add the `SONAR_TOKEN` secret (GitHub) / credential (Jenkins).
- [ ] Confirm `sonar.organization` in `sonar-project.properties` — required by
      SonarCloud, ignored by self-hosted SonarQube.
- [ ] Create the project with key `Sphere_sunbird-cb-uiproxy`, or change
      `sonar.projectKey`.
- [ ] Run `npm run sonar:gate` once against the new server (needs an admin
      token) to create and assign the gate.
- [ ] Register the SonarQube server + scanner tool in Jenkins if using it.
- [ ] **Re-review security hotspots and accepted issues** — these reset on a new
      server.
- [ ] Verify with `npm run sonar:report` that targets read as expected.

---

## Security hotspots and accepted issues

- Every hotspot must be resolved as **fixed** or **safe**, with a justification
  comment. 100% reviewed is a gate condition.
- Do **not** change application code purely to silence a hotspot — that risks a
  behaviour change. Fix real problems; mark genuinely-safe ones safe.
- Re-review **accepted issues quarterly**, each with a justification comment, so
  acceptances do not quietly accumulate.

Analysis now covers files that were previously excluded, including
`src/utils/randomPasswordGenerator.ts`, `src/utils/keycloak-user-creation.ts` and
`src/server.ts`. Expect genuine findings there on the first run; the old
exclusion list was hiding them, which is incompatible with a Security rating of A.

---

## Removing the integration

It leaves no trace in the running service. Delete:

```
sonar-project.properties
docker-compose.sonar.yml
.env.sonar.example
.github/workflows/sonar.yml
docs/sonarqube.md
scripts/sonar-api.mjs
scripts/sonar-gate.mjs
scripts/sonar-report.mjs
scripts/sonar-scan.sh
```

Then drop the `sonar:*` scripts from `package.json`, the two Sonar stages from
`Jenkinsfile`, and the `.env.sonar` / `xunit.xml` lines from `.gitignore`.

---

## Credential rotation

A previous version of `gulpfile.ts` contained a hardcoded analysis token and an
internal server URL. Both have been removed from the working tree, but **they
remain in git history** — deleting the lines does not purge them.

**That token must be revoked on the Sonar server.** No repository change can do
this for you.
