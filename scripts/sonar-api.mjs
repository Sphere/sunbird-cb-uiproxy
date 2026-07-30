/**
 * Shared helpers for the Sonar tooling scripts.
 *
 * Dev/CI tooling only — never imported by application code, never bundled into
 * dist/. Uses Node core modules exclusively (no `fetch`) so it also runs on the
 * older Node versions present on the Jenkins build slaves.
 *
 * Config resolution is deliberately env-agnostic: a git-ignored .env.sonar is
 * sourced ONLY if it exists, otherwise the ambient environment wins. That is
 * what lets `npm run sonar:report` work unchanged on a laptop, in GitHub
 * Actions, and inside withSonarQubeEnv() on Jenkins.
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import https from 'node:https'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Load .env.sonar into process.env WITHOUT clobbering already-set vars. */
function loadDotEnv() {
  const envPath = resolve(REPO_ROOT, '.env.sonar')
  if (!existsSync(envPath)) return
  for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    // Ambient env (CI secrets) must always win over the local file.
    if (!process.env[key]) process.env[key] = value
  }
}

/** Read a single property out of sonar-project.properties. */
function propertyFromSonarConfig(name) {
  const configPath = resolve(REPO_ROOT, 'sonar-project.properties')
  if (!existsSync(configPath)) return undefined
  for (const rawLine of readFileSync(configPath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(new RegExp(`^${name}\\s*=\\s*(.+)$`))
    if (match) return match[1].trim()
  }
  return undefined
}

export function getConfig() {
  loadDotEnv()

  // SONAR_AUTH_TOKEN is what the Jenkins SonarQube plugin exports.
  const token = process.env.SONAR_TOKEN || process.env.SONAR_AUTH_TOKEN
  const hostUrl = (process.env.SONAR_HOST_URL || 'http://localhost:9000').replace(/\/+$/, '')
  const projectKey = process.env.SONAR_PROJECT_KEY || propertyFromSonarConfig('sonar.projectKey')

  if (!token) {
    throw new Error(
      'No Sonar token found.\n' +
        '  local : cp .env.sonar.example .env.sonar and fill in SONAR_TOKEN\n' +
        '  CI    : set the SONAR_TOKEN secret (or SONAR_AUTH_TOKEN on Jenkins)'
    )
  }
  if (!projectKey) {
    throw new Error('Could not determine sonar.projectKey from sonar-project.properties')
  }

  // SonarCloud requires an organization on several endpoints; a self-hosted
  // SonarQube rejects the parameter, so only send it when talking to the cloud.
  const isSonarCloud = /(^|\.)sonarcloud\.io$/.test(new URL(hostUrl).hostname)
  const organization = isSonarCloud
    ? process.env.SONAR_ORGANIZATION || propertyFromSonarConfig('sonar.organization')
    : undefined

  return { token, hostUrl, projectKey, isSonarCloud, organization }
}

/**
 * Call the Sonar Web API. Token auth is HTTP Basic with the token as the
 * username and an empty password — the form accepted by both SonarQube and
 * SonarCloud.
 */
export function sonarRequest(method, apiPath, params = {}, config = getConfig()) {
  const url = new URL(config.hostUrl + apiPath)
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.append(key, String(value))
  }

  let body
  if (method === 'GET') {
    url.search = search.toString()
  } else {
    body = search.toString()
  }

  const transport = url.protocol === 'https:' ? https : http
  const headers = {
    Authorization: 'Basic ' + Buffer.from(`${config.token}:`).toString('base64'),
    Accept: 'application/json',
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    headers['Content-Length'] = Buffer.byteLength(body)
  }

  return new Promise((resolvePromise, rejectPromise) => {
    const req = transport.request(
      { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers },
      res => {
        let raw = ''
        res.on('data', chunk => (raw += chunk))
        res.on('end', () => {
          const parsed = raw ? safeJsonParse(raw) : {}
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolvePromise(parsed)
            return
          }
          // Sonar returns an empty body on 401/403, so an unexplained status
          // code is all the caller would otherwise see.
          const fallbackByStatus = {
            401: 'unauthorized — token missing, invalid, or expired',
            403: 'forbidden — the token lacks the required permission',
            404: 'not found — check sonar.projectKey and that the project exists',
          }
          const detail =
            parsed?.errors?.map(e => e.msg).join('; ') ||
            raw.slice(0, 300) ||
            fallbackByStatus[res.statusCode] ||
            'no response body'
          const err = new Error(`${method} ${apiPath} -> HTTP ${res.statusCode}: ${detail}`)
          err.statusCode = res.statusCode
          err.sonarErrors = parsed?.errors || []
          rejectPromise(err)
        })
      }
    )
    req.on('error', e =>
      rejectPromise(
        new Error(`Cannot reach Sonar at ${config.hostUrl} (${e.message}).\n` +
          'Is the server up?  docker compose -f docker-compose.sonar.yml up -d')
      )
    )
    if (body !== undefined) req.write(body)
    req.end()
  })
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return { raw }
  }
}

/** Sonar encodes ratings as 1..5; humans read A..E. */
export const RATING_LETTERS = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' }

export function ratingToLetter(value) {
  if (value === undefined || value === null || value === '') return null
  return RATING_LETTERS[Math.round(Number(value))] || String(value)
}
