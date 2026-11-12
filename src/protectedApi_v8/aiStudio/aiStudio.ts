import { Request, Response, Router } from 'express'
import { artifactsApi } from './artifacts'
import { UPSTREAM_BASES } from './constants'
import { forwardAny, requestLogger } from './helpers'
import { quizApi } from './quiz'
import { studioApi } from './studio'
import { usageApi } from './usage'

/**
 * Aastrika AI service — documents in, narrated training videos and validated MCQ quizzes out.
 *
 * Mounted at `/protected/v8/aiStudio`; each sub-router maps one-to-one onto a feature area
 * of the upstream service, so `/aiStudio/studio/generate-plan` here is
 * `/ai-studio/v1/studio/generate-plan` at the gateway.
 *
 * The upstream service does no authentication of its own — that is the gateway's job. Its
 * whole client integration is one header, `x-aastrika-creator`, naming the signed-in person
 * the work belongs to. Kong's `x-consumer-username` identifies the *portal*, one value for
 * every request it makes, so it cannot answer which health worker made a given video; only
 * this proxy knows that. It fills the header from the session on every call and overwrites
 * anything the caller sent, so spend cannot be recorded against another user. Request bodies
 * are forwarded untouched. See `helpers.ts`.
 *
 * The service's health, auth and sign-out routes are deliberately not written out here: the
 * portal authenticates through Keycloak, and liveness is the orchestrator's business, not
 * the UI's.
 *
 * Each sub-router names and documents the endpoints in use today and ends with a wildcard
 * that forwards anything else to the matching upstream prefix, so the AI service can grow
 * `/v1/studio/*` or `/v1/quiz/*` endpoints without a change here. The wildcard below does
 * the same one level up, for a feature area that does not exist yet at all.
 *
 * Nothing here validates a request body. Which fields an endpoint requires is the AI
 * service's rule to state, and a second copy of it in a forwarding layer only drifts: the
 * first time the service relaxes a rule, this proxy would still be refusing requests the
 * service would have accepted. Bodies go upstream as they arrive and the service's own
 * rejection, with its own message, is relayed back untouched.
 */
export const aiStudioApi = Router()

// First, so one access line covers every route below it — named and wildcard alike.
aiStudioApi.use(requestLogger)

/**
 * Each feature area is reachable under two shapes, and they behave identically:
 *
 *   /protected/v8/aiStudio/quiz/languages        the portal shape
 *   /protected/v8/aiStudio/v1/quiz/languages     the upstream shape
 *
 * The second exists because that is what clients actually send — a UI written against the AI
 * service's own API keeps its `/v1` and simply changes the host. Without these aliases every
 * such request fell through to the wildcard at the bottom of this file: it worked, but it
 * skipped the named route that documents the endpoint, so the logs said `via=passthrough` for
 * traffic this proxy does in fact know about.
 *
 * Both mounts share one router, so there is no second copy of anything to keep in step.
 */
const FEATURES: Array<[string, Router]> = [
    ['/studio', studioApi],
    ['/quiz', quizApi],
    ['/artifacts', artifactsApi],
    ['/usage', usageApi],
]
FEATURES.forEach(([path, router]) => {
    aiStudioApi.use(path, router)
    aiStudioApi.use(`/v1${path}`, router)
})

/**
 * Anything outside the four feature areas, forwarded to the AI service unchanged.
 *
 * Declared last, so the routers above win. The path is relayed verbatim rather than being
 * mapped, which means a future feature area is reached under its own upstream shape — a
 * `/v1/translate/run` added upstream is `/protected/v8/aiStudio/v1/translate/run` here.
 */
aiStudioApi.all('/*', async (req: Request, res: Response) => {
    return forwardAny(req, res, UPSTREAM_BASES.root, 'aiStudio/passthrough')
})
