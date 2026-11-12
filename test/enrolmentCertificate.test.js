// Executed tests (ts-node), like certificateSvg.test.js: the helper's contract is
// rows in -> certificate out, which only running it can verify.
require("ts-node/register");
const assert = require("assert");
const { pickIssuedCertificate, ENROLMENT_CERTIFICATE_QUERY } = require("../src/publicApi_v8/adapters/enrolmentCertificate.ts");

/**
 * A learner can have a stray user_enrolments row on another batch of the same course
 * (active null, no status, no certificate). The download routes read rows[0] and
 * 500'd whenever that stray row came back first.
 */
describe("enrolmentCertificate", function () {
  const cert = (identifier, lastIssuedOn) => ({ identifier, name: "QOC", lastIssuedOn });
  const real = { batchid: "real", active: true, status: 2, issued_certificates: [cert("1-real", "2026-10-27T17:03:24.262+0000")] };
  const stray = { batchid: "stray", active: null, status: null, issued_certificates: null };

  it("stray row first: still returns the real enrolment's certificate", function () {
    assert.deepStrictEqual(pickIssuedCertificate([stray, real]), { batchId: "real", identifier: "1-real", name: "QOC" });
  });

  it("prefers the active row when an inactive row also carries a certificate", function () {
    const inactiveWithCopy = { batchid: "old", active: false, status: null, issued_certificates: [cert("1-copy", "2026-10-28T00:00:00.000+0000")] };
    assert.strictEqual(pickIssuedCertificate([inactiveWithCopy, real]).identifier, "1-real");
  });

  it("among active rows, prefers the completed one", function () {
    const activeIncomplete = { batchid: "b2", active: true, status: 1, issued_certificates: [cert("1-b2", "2026-01-01T00:00:00.000+0000")] };
    assert.strictEqual(pickIssuedCertificate([activeIncomplete, real]).identifier, "1-real");
  });

  it("falls back to any row with a certificate", function () {
    const onlyInactive = { batchid: "old", active: false, status: 2, issued_certificates: [cert("1-old", "2026-01-01T00:00:00.000+0000")] };
    assert.strictEqual(pickIssuedCertificate([stray, onlyInactive]).identifier, "1-old");
  });

  it("returns the newest certificate when a row holds more than one", function () {
    const reissued = { batchid: "r", active: true, status: 2, issued_certificates: [cert("1-first", "2026-01-01T00:00:00.000+0000"), cert("1-latest", "2026-10-01T00:00:00.000+0000")] };
    assert.strictEqual(pickIssuedCertificate([reissued]).identifier, "1-latest");
  });

  it("returns null, not a throw, when nothing is issued", function () {
    assert.strictEqual(pickIssuedCertificate([stray]), null);
    assert.strictEqual(pickIssuedCertificate([{ batchid: "x", active: true, status: 2, issued_certificates: [] }]), null);
    assert.strictEqual(pickIssuedCertificate([]), null);
    assert.strictEqual(pickIssuedCertificate(undefined), null);
  });

  it("query binds userid and courseid as parameters, not string concatenation", function () {
    assert.ok(/userid = \? AND courseid = \?/.test(ENROLMENT_CERTIFICATE_QUERY));
    assert.ok(/\bactive\b/.test(ENROLMENT_CERTIFICATE_QUERY) && /\bstatus\b/.test(ENROLMENT_CERTIFICATE_QUERY));
  });
});
