// Pure helpers for public certificate verification (QR scan -> /certs/:id on the portal).
// A QR on a Sunbird RC certificate carries the RC id; a QR on a certificate printed before
// the Spark migration carries the old cert-registry id, which the migration stored on the
// RC record as `oldId`. These helpers keep the route free of shape handling and decide what
// a public visitor may see: only what the printed certificate already shows.

export const DEFAULT_CERT_ENTITY = 'TrainingCertificate'

// An RC record is schema-driven JSON; fields are read defensively below.
// tslint:disable-next-line: no-any
type RcRecord = Record<string, any>

const CERT_ID_PATTERN = /^[A-Za-z0-9-]{8,80}$/
const ENTITY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{1,60}$/

export interface IVerifiedCertificate {
  certificateId: string
  courseId: string
  entity: string
  recipientName: string
  courseName: string
  issuedOn: string
  issuerName: string
  revoked: boolean
}

/** Ids come from a URL anyone can type; only RC osids and old UUID-style ids pass. */
export function isValidCertificateId(id: unknown): id is string {
  return typeof id === 'string' && CERT_ID_PATTERN.test(id)
}

/** The QR's `entity` param picks the RC schema; anything unexpected falls back to course certificates. */
export function normaliseEntity(entity: unknown): string {
  return typeof entity === 'string' && ENTITY_PATTERN.test(entity) ? entity : DEFAULT_CERT_ENTITY
}

export function oldIdSearchBody(oldId: string) {
  return { filters: { oldId: { eq: oldId } }, limit: 1, offset: 0 }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// RC returns the record either bare or wrapped in an array (search); empty means "not found".
function firstRecord(body: unknown): RcRecord | null {
  const record = Array.isArray(body) ? body[0] : body
  return record && typeof record === 'object' && !Array.isArray(record) ? record : null
}

/**
 * The signed credential's subject. RC's read-by-id omits the nested `training` object (search
 * returns it), but `_osSignedData` always carries what credential_template.json mapped into
 * credentialSubject: trainingName, trainingId, issuedDate. Stored as a JSON string or object.
 */
function signedSubject(record: RcRecord): RcRecord {
  let signed = record._osSignedData
  if (typeof signed === 'string') {
    try {
      signed = JSON.parse(signed)
    } catch {
      return {}
    }
  }
  const subject = signed && typeof signed === 'object' ? signed.credentialSubject : null
  const first = Array.isArray(subject) ? subject[0] : subject
  return first && typeof first === 'object' ? first : {}
}

/**
 * The issued date as the certificate prints it. Course certificates carry the pre-formatted
 * training.issuedDate ("10 September 2026"); older and event records only have timestamps.
 */
function issuedOn(record: RcRecord, subject: RcRecord): string {
  const training = record.training || {}
  return (
    text(training.issuedDate) ||
    text(subject.issuedDate) ||
    text(record.issuedDate) ||
    text(record.issuanceDate) ||
    text(training.osCreatedAt) ||
    text(record.osCreatedAt) ||
    text(record._osCreatedAt)
  )
}

function isRevoked(record: RcRecord): boolean {
  const status = text(record.status).toUpperCase()
  return status === 'REVOKED' || record.revoked === true || record.isRevoked === true
}

/**
 * Maps an RC certificate record to the public verification view. Returns null when the
 * record has no id or no recipient, i.e. nothing a visitor could recognise as a certificate.
 */
export function toVerifiedCertificate(body: unknown, entity: string): IVerifiedCertificate | null {
  const record = firstRecord(body)
  if (!record) {
    return null
  }
  const certificateId = text(record.osid) || text(record.id)
  // RC read-by-id drops nested objects inconsistently (training on one env, recipient on
  // another); the signed credential always names the learner.
  const subject = signedSubject(record)
  const recipientName = text((record.recipient || {}).name) || text(subject.recipientName)
  if (!certificateId || !recipientName) {
    return null
  }
  const training = record.training || {}
  return {
    certificateId,
    courseId: text(training.id) || text(subject.trainingId),
    // certificateLabel is the template's name, so it is only the last resort for the course
    courseName: text(training.name) || text(subject.trainingName) || text(record.certificateLabel),
    entity,
    issuedOn: issuedOn(record, subject),
    issuerName: text((record.issuer || {}).name),
    recipientName,
    revoked: isRevoked(record),
  }
}
