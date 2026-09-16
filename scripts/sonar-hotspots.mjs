/**
 * Apply the versioned security hotspot review decisions to a Sonar server.
 *
 *   npm run sonar:hotspots                     # whatever .env.sonar points at
 *   SONAR_HOST_URL=https://sonarcloud.io \
 *   SONAR_TOKEN=<token> npm run sonar:hotspots # SonarCloud / CI
 *
 * Hotspot review state lives in the server database and cannot be committed, so
 * a hotspot reviewed locally is still unreviewed on SonarCloud. This script
 * replays the decisions in scripts/sonar-hotspot-reviews.mjs against whichever
 * server is configured, making Security Review A reproducible rather than a
 * one-off set of clicks on one machine.
 *
 * Idempotent: only hotspots still in TO_REVIEW are touched.
 *
 * SAFETY: a hotspot with no matching justification is NEVER auto-accepted. The
 * script reports it and exits non-zero, so a newly-introduced risk cannot be
 * silently rubber-stamped by re-running this.
 *
 * Changes nothing in the application or the repository.
 */

import { getConfig, sonarRequest } from './sonar-api.mjs'
import { HOTSPOT_REVIEWS, findReview } from './sonar-hotspot-reviews.mjs'

async function fetchAllHotspots(config, status) {
  const hotspots = []
  let page = 1
  for (;;) {
    const response = await sonarRequest(
      'GET',
      '/api/hotspots/search',
      { projectKey: config.projectKey, status, ps: 500, p: page },
      config
    )
    hotspots.push(...(response.hotspots || []))
    const total = response.paging?.total ?? hotspots.length
    if (hotspots.length >= total || !(response.hotspots || []).length) {
      return hotspots
    }
    page++
  }
}

async function main() {
  const config = getConfig()
  console.log(`\nApplying hotspot reviews on ${config.hostUrl}`)
  console.log(`Project: ${config.projectKey}\n`)

  const pending = await fetchAllHotspots(config, 'TO_REVIEW')
  if (!pending.length) {
    const reviewed = await fetchAllHotspots(config, 'REVIEWED')
    console.log(`  nothing to review — ${reviewed.length} hotspot(s) already reviewed\n`)
    return
  }

  console.log(`  ${pending.length} hotspot(s) awaiting review\n`)

  let applied = 0
  const unmatched = []

  for (const hotspot of pending) {
    const filePath = hotspot.component.split(':').slice(1).join(':')
    const review = findReview(hotspot.ruleKey, filePath)

    if (!review) {
      unmatched.push({ rule: hotspot.ruleKey, file: filePath, line: hotspot.line })
      continue
    }

    await sonarRequest(
      'POST',
      '/api/hotspots/change_status',
      {
        hotspot: hotspot.key,
        status: 'REVIEWED',
        resolution: review.resolution,
        comment: review.justification,
      },
      config
    )
    console.log(`  ✓ ${review.resolution.padEnd(6)} ${hotspot.ruleKey}  ${filePath}:${hotspot.line ?? '?'}`)
    applied++
  }

  console.log(`\n  reviewed: ${applied}`)

  if (unmatched.length) {
    console.error(
      `\n  ${unmatched.length} hotspot(s) have NO recorded review decision and were ` +
        `left untouched:\n`
    )
    for (const u of unmatched) {
      console.error(`    ${u.rule}  ${u.file}:${u.line ?? '?'}`)
    }
    console.error(
      '\n  These are NOT auto-accepted. Review each one and either fix the code\n' +
        '  or add a justification to scripts/sonar-hotspot-reviews.mjs.\n' +
        '  Adding an entry is a security decision — do not do it just to go green.\n'
    )
    process.exit(1)
  }

  console.log(`  ${HOTSPOT_REVIEWS.length} decision(s) on file. Security Review should now be A.\n`)
}

main().catch((error) => {
  console.error(`\n${error.message}\n`)
  if (error.statusCode === 403) {
    console.error('Marking hotspots requires the "Administer Security Hotspots" permission.\n')
  }
  process.exit(1)
})
