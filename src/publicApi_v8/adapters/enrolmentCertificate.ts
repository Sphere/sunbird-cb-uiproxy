// A learner can have more than one user_enrolments row for the same course: their real
// enrolment, plus a stray row on another batch left by an old portal bug (active null,
// no status, no certificate). The download routes used to read rows[0].issued_certificates[0];
// when the stray row came back first that threw on null and every download 500'd.
// Pick the row lern itself would show (active), then a completed one, then any row that
// carries a certificate.

export const ENROLMENT_CERTIFICATE_QUERY =
  'SELECT batchid, active, status, issued_certificates FROM sunbird_courses.user_enrolments WHERE userid = ? AND courseid = ?'

export interface IssuedCertificate {
  batchId: string
  identifier: string
  name: string
}

// tslint:disable-next-line: no-any
const rank = (row: any) => (row.active === true ? 0 : 2) + (row.status === 2 ? 0 : 1)

// tslint:disable-next-line: no-any
export function pickIssuedCertificate(rows: any[]): IssuedCertificate | null {
  const candidates = (rows || [])
    .filter((candidate) => Array.isArray(candidate.issued_certificates) && candidate.issued_certificates.length > 0)
    .sort((a, b) => rank(a) - rank(b))
  if (!candidates.length) {
    return null
  }
  const row = candidates[0]
  // The newest issue wins when a certificate was reissued under a new identifier.
  const certificate = [...row.issued_certificates]
    .filter((c) => c && c.identifier)
    .sort((a, b) => String(b.lastIssuedOn || '').localeCompare(String(a.lastIssuedOn || '')))[0]
  if (!certificate) {
    return null
  }
  return { batchId: row.batchid, identifier: certificate.identifier, name: certificate.name }
}
