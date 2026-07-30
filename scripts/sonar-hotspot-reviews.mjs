/**
 * Security hotspot review decisions, as code.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * SonarQube stores hotspot review state in the SERVER database, not in the
 * repository. There is no way to commit a review. That means a hotspot reviewed
 * on a local SonarQube is still unreviewed on SonarCloud, so Security Review
 * reads A locally and E in CI — the same code, two different ratings.
 *
 * Keeping the decisions here makes them:
 *   - reproducible  : `npm run sonar:hotspots` applies them to ANY server
 *   - reviewable    : justifications go through normal code review
 *   - auditable     : `git log` shows who accepted which risk and when
 *
 * This does NOT change application code and has NO effect on production
 * behaviour. It records a human judgement that a flagged pattern is acceptable.
 *
 * ADDING A NEW ENTRY IS A SECURITY DECISION. Do not add one to make a build
 * green. If a hotspot is a real problem, fix the code instead — see
 * randomPasswordGenerator.ts, where Math.random was replaced with a CSPRNG
 * rather than accepted here.
 */

/**
 * Matched most-specific-first: an entry with `file` wins over a rule-wide one.
 * Files are matched by suffix, so line numbers moving does not break anything.
 */
export const HOTSPOT_REVIEWS = [
  // ---------------------------------------------------------------------
  // S5332 — clear-text protocol
  // ---------------------------------------------------------------------
  {
    rule: 'typescript:S5332',
    file: 'src/server.ts',
    resolution: 'SAFE',
    justification:
      'Cluster-internal WebSocket to notification-engine, resolved through ' +
      'Kubernetes service DNS. The connection never leaves the cluster network ' +
      'and is not reachable from the public internet.',
  },
  {
    rule: 'typescript:S5332',
    resolution: 'SAFE',
    // VERIFIED FROM SOURCE: each of these is an `env.X || 'http://...'`
    // fallback whose host is an internal service name (learner-service,
    // content-service, notification-service, frac-etl-service, ...) or a
    // localhost placeholder — not a public domain, and not a URL handed to a
    // browser. The public-facing base, HTTPS_HOST, defaults to https.
    //
    // NOT VERIFIED HERE: that the cluster network is actually isolated and
    // that TLS terminates at the ingress. This repository contains no
    // deployment manifests, so that cannot be checked from source. It is the
    // assumption this decision rests on.
    //
    // TO RATIFY: someone who owns the deployment topology should confirm that
    // assumption. If any of these addresses is reachable from outside the
    // cluster, this decision is wrong and the entry must be revisited.
    justification:
      'Default fallback for an internal service address, overridden by an ' +
      'environment variable in deployed environments. Hosts are internal ' +
      'service names or localhost placeholders, not public domains, and are ' +
      'not returned to browsers. Accepted on the assumption that this traffic ' +
      'stays on the cluster network — see scripts/sonar-hotspot-reviews.mjs ' +
      'for the caveat; not verifiable from this repository.',
  },

  // ---------------------------------------------------------------------
  // S2245 — pseudorandom number generator
  // ---------------------------------------------------------------------
  {
    rule: 'typescript:S2245',
    resolution: 'SAFE',
    justification:
      'Math.random is used only to randomise display order (Fisher-Yates ' +
      'shuffle) of content and assessment questions. No credential, token, ' +
      'session identifier or security decision derives from this value. ' +
      'NOTE: the password generator did NOT qualify for this justification ' +
      'and was fixed in code to use crypto.randomBytes instead.',
  },

  // ---------------------------------------------------------------------
  // S5122 — CORS
  // ---------------------------------------------------------------------
  {
    rule: 'typescript:S5122',
    file: 'src/server.ts',
    resolution: 'SAFE',
    justification:
      'CORS restricted to a single explicit origin ' +
      '(https://local.igot-dev.in:3000) and only on the dev branch ' +
      "(CORS_ENVIRONMENT === 'dev'). Not a wildcard.",
  },
  {
    rule: 'typescript:S5122',
    file: 'src/proxies_v8/proxies_v8.ts',
    resolution: 'SAFE',
    justification:
      'Wildcard origin on a public CDN asset proxy serving GET/HEAD/OPTIONS ' +
      'only. Access-Control-Allow-Credentials is never set anywhere in this ' +
      'codebase, so browsers will not attach cookies to a wildcard origin, and ' +
      'the upstream request() is a fresh call that forwards no authorization ' +
      'headers. No credentialed data is exposed cross-origin.',
  },

  // ---------------------------------------------------------------------
  // S5852 — super-linear regex backtracking
  // ---------------------------------------------------------------------
  {
    rule: 'typescript:S5852',
    file: 'src/utils/assessmentSubmitHelper.ts',
    resolution: 'SAFE',
    justification:
      'HTML-tag-stripping regex applied to assessment question text fetched ' +
      "from the platform's own content service via fetchAssessment(), not to " +
      'user-supplied request data. The negated character class [^>]+ is not ' +
      'nested inside another quantifier, so backtracking is bounded.',
  },
]

/** Most specific match wins; returns undefined when nothing applies. */
export function findReview(ruleKey, filePath) {
  const forRule = HOTSPOT_REVIEWS.filter((r) => r.rule === ruleKey)
  return (
    forRule.find((r) => r.file && filePath.endsWith(r.file)) ||
    forRule.find((r) => !r.file)
  )
}
