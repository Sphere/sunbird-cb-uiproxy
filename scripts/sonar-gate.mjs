/**
 * Configure the quality gate AS CODE, so the shared goals are reproducible on
 * any server instead of being clicked into a UI once and forgotten.
 *
 *   npm run sonar:gate            # requires a token with ADMIN rights
 *
 * Idempotent and self-correcting: creates the gate if missing, creates missing
 * conditions, and UPDATES any condition that has drifted from target. Safe to
 * re-run; a second run makes no changes.
 *
 * Why this exists rather than just using "Sonar way": the built-in gate sets
 * Coverage on New Code to 80%, which is stricter than our agreed 60% target.
 * Every other Sonar-way default already matches, but that one must be changed.
 *
 * Nothing here touches the repository or the application — it only talks to the
 * Sonar Web API.
 */

import { getConfig, sonarRequest } from './sonar-api.mjs'

const GATE_NAME = process.env.SONAR_GATE_NAME || 'Aastrika Way'

// All conditions except the last are on NEW code (Clean as You Code). `op` is
// the FAILING comparison: e.g. new_coverage LT 60 means "fail when coverage
// is below 60".
const CONDITIONS = [
  { metric: 'new_coverage',                   op: 'LT', error: '60',  label: 'Coverage >= 60%' },
  { metric: 'new_duplicated_lines_density',   op: 'GT', error: '3',   label: 'Duplicated lines <= 3%' },
  { metric: 'new_security_rating',            op: 'GT', error: '1',   label: 'Security rating = A' },
  { metric: 'new_reliability_rating',         op: 'GT', error: '1',   label: 'Reliability rating = A' },
  { metric: 'new_maintainability_rating',     op: 'GT', error: '1',   label: 'Maintainability rating = A' },
  { metric: 'new_security_hotspots_reviewed', op: 'LT', error: '100', label: 'Hotspots 100% reviewed' },

  // OVERALL (whole-repo) coverage, not new-code. Added once the Phase 1/2
  // Jest coverage campaign pushed the absolute figure to 81% — this condition
  // is a floor so that number can't silently regress on a later PR that adds
  // untested code elsewhere in the repo (Clean-as-You-Code alone wouldn't
  // catch that, since it only judges lines actually touched by a change).
  { metric: 'coverage',                       op: 'LT', error: '80',  label: 'Overall coverage >= 80%' },
]

/**
 * SonarQube 10.x addresses gates by name; 9.x uses a numeric id. Try the modern
 * form and fall back, so this works against whichever server is in front of us.
 */
async function withGateIdentifier(config, gate, call) {
  try {
    return await call({ gateName: gate.name })
  } catch (error) {
    if (error.statusCode !== 400 && error.statusCode !== 404) throw error
    return call({ gateId: gate.id })
  }
}

function orgParams(config) {
  return config.organization ? { organization: config.organization } : {}
}

async function findOrCreateGate(config) {
  const list = await sonarRequest('GET', '/api/qualitygates/list', orgParams(config), config)
  const existing = (list.qualitygates || []).find(g => g.name === GATE_NAME)
  if (existing) {
    console.log(`  gate "${GATE_NAME}" already exists`)
    return existing
  }
  const created = await sonarRequest(
    'POST',
    '/api/qualitygates/create',
    { name: GATE_NAME, ...orgParams(config) },
    config
  )
  console.log(`  created gate "${GATE_NAME}"`)
  return { id: created.id, name: created.name || GATE_NAME }
}

async function syncConditions(config, gate) {
  const show = await sonarRequest(
    'GET',
    '/api/qualitygates/show',
    { name: gate.name, ...orgParams(config) },
    config
  )
  const current = new Map((show.conditions || []).map(c => [c.metric, c]))

  let created = 0
  let updated = 0
  let unchanged = 0

  for (const wanted of CONDITIONS) {
    const existing = current.get(wanted.metric)

    if (!existing) {
      await withGateIdentifier(config, gate, identifier =>
        sonarRequest(
          'POST',
          '/api/qualitygates/create_condition',
          { ...identifier, metric: wanted.metric, op: wanted.op, error: wanted.error, ...orgParams(config) },
          config
        )
      )
      console.log(`  + ${wanted.label}`)
      created++
      continue
    }

    const drifted = String(existing.error) !== wanted.error || existing.op !== wanted.op
    if (drifted) {
      await sonarRequest(
        'POST',
        '/api/qualitygates/update_condition',
        { id: existing.id, metric: wanted.metric, op: wanted.op, error: wanted.error, ...orgParams(config) },
        config
      )
      console.log(`  ~ ${wanted.label}  (was op=${existing.op} error=${existing.error})`)
      updated++
      continue
    }

    unchanged++
  }

  return { created, updated, unchanged }
}

async function assignToProject(config, gate) {
  await withGateIdentifier(config, gate, identifier =>
    sonarRequest(
      'POST',
      '/api/qualitygates/select',
      { ...identifier, projectKey: config.projectKey, ...orgParams(config) },
      config
    )
  )
  console.log(`  gate assigned to project "${config.projectKey}"`)
}

async function main() {
  const config = getConfig()
  console.log(`\nConfiguring quality gate on ${config.hostUrl}\n`)

  const gate = await findOrCreateGate(config)
  const result = await syncConditions(config, gate)
  await assignToProject(config, gate)

  console.log(
    `\n  conditions: ${result.created} created, ${result.updated} updated, ` +
      `${result.unchanged} already correct`
  )
  console.log('\n  Re-run this command any time to correct drift.\n')
}

main().catch(error => {
  const isPermissions = error.statusCode === 401 || error.statusCode === 403
  console.error(`\n${error.message}\n`)
  if (isPermissions) {
    console.error('This script needs a token with ADMIN rights on quality gates.\n')
  }
  process.exit(1)
})
