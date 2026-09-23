import { CONSTANTS } from '../../utils/env'

/**
 * Root of the Aastrika AI service as it is published by Kong, e.g.
 * `https://<kong-host>/ai-studio`. Every path below is appended to it verbatim, so the
 * proxy route names and the upstream route names stay one-to-one and greppable.
 */
const AI_STUDIO_BASE = CONSTANTS.AI_STUDIO_API_BASE

/**
 * Path segments the caller supplies are interpolated into the upstream URL, so they are
 * percent-encoded here. Job ids are opaque and a filename is whatever the uploader typed;
 * neither may be allowed to introduce a `/` or a `?` and address a different resource.
 */
const segment = (value: string): string => encodeURIComponent(value)

/**
 * Every upstream endpoint this proxy names, keyed by the route that calls it. The key follows
 * the feature area and the upstream path, so a route here and the AI service's own path stay
 * one-to-one and greppable in both directions.
 *
 * Entries that take arguments are functions rather than templates so the percent-encoding in
 * {@link segment} cannot be forgotten at a call site.
 */
export const API_END_POINTS = {
    artifactObject: (contentId: string, filename: string) =>
        `${AI_STUDIO_BASE}/v1/artifacts/${segment(contentId)}/${segment(filename)}`,
    artifactUpload: `${AI_STUDIO_BASE}/v1/artifacts/upload`,
    quizDelete: (quizJobId: string) => `${AI_STUDIO_BASE}/v1/quiz/delete/${segment(quizJobId)}`,
    quizExport: (quizJobId: string) => `${AI_STUDIO_BASE}/v1/quiz/export/${segment(quizJobId)}`,
    quizGenerate: `${AI_STUDIO_BASE}/v1/quiz/generate`,
    quizLanguages: `${AI_STUDIO_BASE}/v1/quiz/languages`,
    quizList: `${AI_STUDIO_BASE}/v1/quiz/list`,
    quizRead: (quizJobId: string) => `${AI_STUDIO_BASE}/v1/quiz/${segment(quizJobId)}`,
    quizUpdate: (quizJobId: string) => `${AI_STUDIO_BASE}/v1/quiz/update/${segment(quizJobId)}`,
    quizUpload: `${AI_STUDIO_BASE}/v1/quiz/upload`,
    studioDeleteVideo: (jobId: string) => `${AI_STUDIO_BASE}/v1/studio/delete-video/${segment(jobId)}`,
    studioDownloadVideo: (jobId: string) => `${AI_STUDIO_BASE}/v1/studio/download-video/${segment(jobId)}`,
    studioGeneratePlan: `${AI_STUDIO_BASE}/v1/studio/generate-plan`,
    studioGenerateVideo: (jobId: string) => `${AI_STUDIO_BASE}/v1/studio/generate-video/${segment(jobId)}`,
    studioGetVideo: (jobId: string) => `${AI_STUDIO_BASE}/v1/studio/get-video/${segment(jobId)}`,
    studioListVideos: `${AI_STUDIO_BASE}/v1/studio/list-videos`,
    studioListVoices: `${AI_STUDIO_BASE}/v1/studio/list-voices`,
    studioRevisePlan: (jobId: string) => `${AI_STUDIO_BASE}/v1/studio/revise-plan/${segment(jobId)}`,
    studioUpload: `${AI_STUDIO_BASE}/v1/studio/upload`,
    usageReport: `${AI_STUDIO_BASE}/v1/usage/get-report`,
}

/**
 * The upstream prefix each feature router maps onto. `API_END_POINTS` above names the
 * endpoints that are documented here; these are what the wildcard passthrough hangs an
 * unrecognised path off, so an endpoint the AI service adds later is reachable without a
 * change to this proxy.
 *
 * `root` is the service itself, for a feature area that does not exist yet at all: a future
 * `/v1/translate/run` is reachable as `/protected/v8/aiStudio/v1/translate/run`.
 */
export const UPSTREAM_BASES = {
    artifacts: `${AI_STUDIO_BASE}/v1/artifacts`,
    quiz: `${AI_STUDIO_BASE}/v1/quiz`,
    root: AI_STUDIO_BASE,
    studio: `${AI_STUDIO_BASE}/v1/studio`,
    usage: `${AI_STUDIO_BASE}/v1/usage`,
}

/**
 * The only two errors this proxy raises on its own.
 *
 * It does not validate request bodies. Which fields an endpoint requires is the AI service's
 * rule to state, and restating it here would mean two copies that drift apart the first time
 * the service relaxes one — a caller would be refused a request the service would have
 * accepted, by a component that is only supposed to forward. So a request goes upstream as it
 * arrived and the service's own rejection, with its own message, is relayed back.
 */
export const ERROR_MESSAGES = {
    INTERNAL_SERVER_ERROR: 'Internal server error',
    NO_REDIRECT_TARGET: 'Upstream redirected without a location to follow',
}

/**
 * Header names, in one place so a typo is a compile error rather than a header silently not
 * arriving. Response headers are matched case-insensitively at the point of use, since Node
 * lower-cases everything it receives.
 */
export const HEADERS = {
    ACCEPT_RANGES: 'Accept-Ranges',
    CONTENT_DISPOSITION: 'Content-Disposition',
    CONTENT_RANGE: 'Content-Range',
    CONTENT_TYPE: 'Content-Type',
    CONTENT_TYPE_JSON: 'application/json',
    /** The AI service's whole client integration: the signed-in person this work belongs to. */
    CREATOR: 'x-aastrika-creator',
    RANGE: 'Range',
    USER_TOKEN: 'x-authenticated-user-token',
}

/**
 * The shared presets in configs/request.config do not fit this service: a 10s read timeout
 * is too tight for a model call and a 200s timeout is far too loose for a list endpoint.
 * These are sized per class of call instead, all inside the app's own 240s connect timeout.
 */
export const TIMEOUTS = {
    /** Streaming an MP4 or an xlsx back through the proxy. */
    DOWNLOAD: 120000,
    /** Planning, revising and quiz generation — each one waits on a model. */
    GENERATION: 200000,
    /**
     * An endpoint this proxy does not name yet, which may turn out to be any of the above.
     * Sized to the most generous of them rather than guessing low.
     */
    PASSTHROUGH: 200000,
    /** Listing, polling and deleting: upstream answers from its own store. */
    READ: 30000,
    /** Parsing a document, or transcribing an uploaded video or audio track. */
    UPLOAD: 200000,
}
