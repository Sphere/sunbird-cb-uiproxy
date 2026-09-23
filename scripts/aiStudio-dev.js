/**
 * Dev-only runner for the AI Studio proxy. NOT used in production.
 *
 * The full portal (`npm run start:dev`) cannot boot without Cassandra: session.config.ts
 * builds a cassandra-store unconditionally, so express-session fails at startup with
 * ECONNREFUSED on 9042. Keycloak has to be reachable too, for a login that produces a
 * session in that store.
 *
 * Both of those are the *session* layer. AI Studio's code starts after it: read the session,
 * build three headers, forward to Kong. This runner mounts the real router with a stand-in
 * for what keycloak.protect would have left on the request, so the whole path
 *
 *     your curl  ->  aiStudio router  ->  Kong  ->  AI service
 *
 * is exercised for real, minus the Keycloak hop — which is not this feature's code.
 *
 * The upstream it forwards to is whatever src/utils/env.ts resolves AI_STUDIO_API_BASE to —
 * no host is repeated here, so this runner cannot drift from the real configuration.
 *
 * Usage:
 *   npm run dev:aiStudio                     # port 3005, against the configured Kong route
 *   PORT=4000 npm run dev:aiStudio           # different port
 *   AI_STUDIO_API_BASE=http://127.0.0.1:4800 npm run dev:aiStudio   # straight at the service
 *
 * Then:
 *   curl http://localhost:3005/apis/protected/v8/aiStudio/quiz/languages
 *
 * No cookie needed here: there is no session to unlock, because this runner supplies one.
 */

const express = require('express')
const fileUpload = require('express-fileupload')

// The portal's gateway key. Read from the dev nodemon config so this file holds no secret.
if (!process.env.SB_API_KEY) {
  try {
    process.env.SB_API_KEY = require('../nodemon/nodemon-aastar-dev.json').env.SB_API_KEY
  } catch (err) {
    console.error('Could not read SB_API_KEY from nodemon/nodemon-aastar-dev.json.')
    console.error('Set it yourself:  SB_API_KEY="bearer <key>" npm run dev:aiStudio')
    process.exit(1)
  }
}

require('ts-node').register({
  compilerOptions: { esModuleInterop: true, module: 'commonjs', strict: false, target: 'ES2019' },
  // The router is type-checked by `npx tsc` and by CI; re-checking it on every boot only
  // makes startup slow, and drags in @types/babel__traverse, which TypeScript 4.2 cannot parse.
  transpileOnly: true,
})

const { aiStudioApi } = require('../src/protectedApi_v8/aiStudio/aiStudio')
const { CONSTANTS } = require('../src/utils/env')

const PORT = Number(process.env.PORT || 3005)
const CREATOR = process.env.DEV_CREATOR || 'Local Dev'

const app = express()
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: false, limit: '50mb' }))
app.use(fileUpload())

/**
 * Stands in for keycloak.protect, which normally populates both of these from the session
 * behind the connect.sid cookie. resolveCreator() reads the token's display name first and
 * falls back to session.userName, so both are supplied to mirror a real signed-in user.
 */
app.use((req, _res, next) => {
  const [given, ...rest] = CREATOR.split(' ')
  req.session = { userId: 'dev-user-id', userName: CREATOR.toLowerCase().replace(/\s+/g, '.') }
  req.kauth = {
    grant: {
      access_token: {
        content: { family_name: rest.join(' '), given_name: given, name: CREATOR },
        token: 'dev-stand-in-token',
      },
    },
  }
  next()
})

app.use('/apis/protected/v8/aiStudio', aiStudioApi)

app.listen(PORT, '127.0.0.1', () => {
  console.log('')
  console.log('  AI Studio proxy (dev runner — no Cassandra, no Keycloak)')
  console.log('  listening   http://localhost:' + PORT + '/apis/protected/v8/aiStudio')
  console.log('  forwarding  ' + CONSTANTS.AI_STUDIO_API_BASE)
  console.log('  creator     ' + CREATOR + '   (override with DEV_CREATOR)')
  console.log('')
  console.log('  try:  curl http://localhost:' + PORT + '/apis/protected/v8/aiStudio/quiz/languages')
  console.log('')
})
