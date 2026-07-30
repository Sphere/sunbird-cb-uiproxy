/**
 * Print a Current-vs-Target table for the shared quality goals, so pass/fail is
 * visible in the terminal without opening the dashboard.
 *
 *   npm run sonar:report
 *
 * Read-only: issues a single GET against /api/measures/component. It never
 * changes anything on the server or in the repo.
 *
 * Enforcement is Clean-as-You-Code, so the NEW CODE column is the one the
 * quality gate actually acts on. The OVERALL column is context only.
 */

import { getConfig, sonarRequest, ratingToLetter } from './sonar-api.mjs'

const GOALS = [
  { label: 'Security rating',      newMetric: 'new_security_rating',            overallMetric: 'security_rating',            kind: 'rating', target: 1,   targetText: 'A' },
  { label: 'Reliability rating',   newMetric: 'new_reliability_rating',         overallMetric: 'reliability_rating',         kind: 'rating', target: 1,   targetText: 'A' },
  { label: 'Maintainability',      newMetric: 'new_maintainability_rating',     overallMetric: 'sqale_rating',               kind: 'rating', target: 1,   targetText: 'A' },
  { label: 'Coverage',             newMetric: 'new_coverage',                   overallMetric: 'coverage',                   kind: 'atLeast', target: 60, targetText: '>= 60%' },
  { label: 'Duplicated lines',     newMetric: 'new_duplicated_lines_density',   overallMetric: 'duplicated_lines_density',   kind: 'atMost',  target: 3,  targetText: '<= 3%' },
  { label: 'Hotspots reviewed',    newMetric: 'new_security_hotspots_reviewed', overallMetric: 'security_hotspots_reviewed', kind: 'atLeast', target: 100, targetText: '100%' },
]

function evaluate(goal, rawValue) {
  if (rawValue === undefined) return { text: 'no data', mark: '–', ok: null }
  const num = Number(rawValue)
  if (goal.kind === 'rating') {
    return { text: ratingToLetter(num), mark: num <= goal.target ? '✓' : '✗', ok: num <= goal.target }
  }
  const shown = `${num}%`
  const ok = goal.kind === 'atLeast' ? num >= goal.target : num <= goal.target
  return { text: shown, mark: ok ? '✓' : '✗', ok }
}

function pad(text, width) {
  const str = String(text)
  return str + ' '.repeat(Math.max(0, width - [...str].length))
}

/**
 * The scanner uploads a report and returns immediately; the server processes it
 * asynchronously. Without waiting, a report run chained straight after a scan
 * would print the PREVIOUS analysis's numbers and look subtly wrong.
 */
async function waitForPendingAnalysis(config, timeoutMs = 120000) {
  let waited = 0
  const step = 3000
  while (waited < timeoutMs) {
    let activity
    try {
      activity = await sonarRequest(
        'GET',
        '/api/ce/activity_status',
        { component: config.projectKey },
        config
      )
    } catch {
      return // status endpoint unavailable — proceed rather than block the report
    }
    const busy = (activity.pending || 0) + (activity.inProgress || 0)
    if (!busy) return
    if (waited === 0) console.log('  waiting for the server to process the analysis...')
    await new Promise(r => setTimeout(r, step))
    waited += step
  }
  console.log('  (still processing after 120s — numbers below may be stale)')
}

async function main() {
  const config = getConfig()
  await waitForPendingAnalysis(config)
  const metricKeys = GOALS.flatMap(g => [g.newMetric, g.overallMetric]).join(',')

  let response
  try {
    response = await sonarRequest(
      'GET',
      '/api/measures/component',
      { component: config.projectKey, metricKeys },
      config
    )
  } catch (error) {
    if (error.statusCode === 404) {
      console.error(
        `\nProject "${config.projectKey}" does not exist on ${config.hostUrl} yet.\n` +
          'Run an analysis first:  npm run sonar:local\n'
      )
      process.exit(1)
    }
    throw error
  }

  const measures = new Map(
    (response.component?.measures || []).map(m => [m.metric, m.value ?? m.periods?.[0]?.value])
  )

  console.log(`\nSonar quality goals — ${config.projectKey}`)
  console.log(`Server: ${config.hostUrl}\n`)
  console.log(`  ${pad('GOAL', 22)}${pad('TARGET', 10)}${pad('NEW CODE', 14)}OVERALL`)
  console.log(`  ${'-'.repeat(60)}`)

  let failures = 0
  let missing = 0

  for (const goal of GOALS) {
    const newResult = evaluate(goal, measures.get(goal.newMetric))
    const overallResult = evaluate(goal, measures.get(goal.overallMetric))
    if (newResult.ok === false) failures++
    if (newResult.ok === null) missing++
    console.log(
      `  ${pad(goal.label, 22)}${pad(goal.targetText, 10)}` +
        `${pad(`${newResult.mark} ${newResult.text}`, 14)}${overallResult.text}`
    )
  }

  console.log(`  ${'-'.repeat(60)}`)
  console.log('\n  Gate acts on the NEW CODE column (Clean as You Code).')
  if (missing) {
    console.log(
      `  ${missing} goal(s) show "no data" — a metric with no data does not fail the gate.\n` +
        '  Coverage has no data until a unit-test harness exists; see docs/sonarqube.md.'
    )
  }
  console.log(
    failures
      ? `\n  ${failures} goal(s) NOT met on new code.\n`
      : '\n  All goals with data are met on new code.\n'
  )
}

main().catch(error => {
  console.error(`\n${error.message}\n`)
  process.exit(1)
})
