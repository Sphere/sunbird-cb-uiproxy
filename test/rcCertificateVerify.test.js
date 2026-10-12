// Executed tests (ts-node) for the verification helpers, plus source guards for the
// route's lookup order, like certificateSvg.test.js and adminUserManage.test.js.
require("ts-node/register");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  DEFAULT_CERT_ENTITY,
  isValidCertificateId,
  normaliseEntity,
  oldIdSearchBody,
  toVerifiedCertificate,
} = require("../src/publicApi_v8/adapters/rcCertificateVerify.ts");

/**
 * QR codes reach /apis/public/v8/certificate/verify/:id from the portal's /certs page.
 * New and migrated certificates carry their Sunbird RC id; certificates printed before
 * the Spark migration carry the old cert-registry id, stored on the RC record as oldId.
 */
describe("rcCertificateVerify", function () {
  const rcRecord = {
    osid: "1-2a4eee6f-2f0d-41ae-9831-4b4c0a0ac895",
    oldId: "14f6e9ba-0000-4000-8000-000000000000",
    status: "ISSUED",
    recipient: { id: "u-1", name: "Asha Kumari", email: "asha@example.com", phone: "9999999999" },
    training: { id: "do_1", name: "Normal Labour & Birth and AMTSL", issuedDate: "10 September 2026" },
    issuer: { name: "Indian Nursing Council" },
  };

  describe("isValidCertificateId", function () {
    it("accepts RC osids and old UUID ids", function () {
      assert.ok(isValidCertificateId("1-2a4eee6f-2f0d-41ae-9831-4b4c0a0ac895"));
      assert.ok(isValidCertificateId("14f6e9ba-0000-4000-8000-000000000000"));
    });
    it("rejects path tricks, query noise and empty values", function () {
      ["", "../etc/passwd", "abc", "id with space", "a/b/c/d/e/f/g", null, undefined, 42].forEach((v) =>
        assert.strictEqual(isValidCertificateId(v), false, String(v))
      );
    });
  });

  describe("normaliseEntity", function () {
    it("keeps the QR's entity (event certificates)", function () {
      assert.strictEqual(normaliseEntity("MDO-Active-Birth"), "MDO-Active-Birth");
      assert.strictEqual(normaliseEntity("AdultBasicLifeSupportBls"), "AdultBasicLifeSupportBls");
    });
    it("falls back to course certificates for missing or unsafe values", function () {
      [undefined, "", "../x", "a b", ["TrainingCertificate"]].forEach((v) =>
        assert.strictEqual(normaliseEntity(v), DEFAULT_CERT_ENTITY)
      );
    });
  });

  it("searches RC by oldId with an exact match", function () {
    assert.deepStrictEqual(oldIdSearchBody("abc-123"), {
      filters: { oldId: { eq: "abc-123" } },
      limit: 1,
      offset: 0,
    });
  });

  describe("toVerifiedCertificate", function () {
    it("maps a read-by-id record to the public view", function () {
      assert.deepStrictEqual(toVerifiedCertificate(rcRecord, "TrainingCertificate"), {
        certificateId: rcRecord.osid,
        entity: "TrainingCertificate",
        recipientName: "Asha Kumari",
        courseName: "Normal Labour & Birth and AMTSL",
        issuedOn: "10 September 2026",
        issuerName: "Indian Nursing Council",
        revoked: false,
      });
    });

    it("takes the first hit of a search response (array)", function () {
      const view = toVerifiedCertificate([rcRecord], "TrainingCertificate");
      assert.strictEqual(view.certificateId, rcRecord.osid);
    });

    it("never exposes contact details or other record fields", function () {
      const view = toVerifiedCertificate(rcRecord, "TrainingCertificate");
      const json = JSON.stringify(view);
      assert.ok(!json.includes("asha@example.com"));
      assert.ok(!json.includes("9999999999"));
      assert.ok(!("oldId" in view) && !("recipient" in view));
    });

    it("falls back to timestamps when there is no printed date (event and older records)", function () {
      const view = toVerifiedCertificate(
        { osid: "1-x1234567", recipient: { name: "R" }, osCreatedAt: "2026-10-01T10:00:00Z" },
        "MDO-Active-Birth"
      );
      assert.strictEqual(view.issuedOn, "2026-10-01T10:00:00Z");
    });

    it("flags revoked certificates", function () {
      assert.strictEqual(toVerifiedCertificate({ ...rcRecord, status: "REVOKED" }, "TrainingCertificate").revoked, true);
    });

    it("returns null for empty or unrecognisable responses", function () {
      [null, undefined, [], {}, "x", [{ osid: "1-abcdefgh" }], { recipient: { name: "No id" } }].forEach((v) =>
        assert.strictEqual(toVerifiedCertificate(v, "TrainingCertificate"), null, JSON.stringify(v))
      );
    });
  });

  describe("route", function () {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "publicApi_v8", "certificateVerify.ts"),
      "utf8"
    );
    const mount = fs.readFileSync(
      path.join(__dirname, "..", "src", "publicApi_v8", "publicApiV8.ts"),
      "utf8"
    );

    it("is mounted at /apis/public/v8/certificate/verify/:id", function () {
      assert.ok(/\.get\(\s*['"]\/verify\/:id['"]/.test(src));
      assert.ok(/publicApiV8\.use\(\s*['"]\/certificate\/['"]\s*,\s*certificateVerify\s*\)/.test(mount));
    });

    it("validates the id before calling RC", function () {
      assert.ok(src.indexOf("isValidCertificateId(id)") < src.indexOf("readById(entity, id)"));
    });

    it("reads by id first and searches by oldId only for course certificates", function () {
      assert.ok(/readById\(entity, id\)\)\s*\|\|\s*\(entity === DEFAULT_CERT_ENTITY \? await findByOldId/.test(src));
    });

    it("answers not found with 200 and RC failures with 502, never a false 'invalid'", function () {
      assert.ok(/status\(200\)\.send\(\{\s*found: false\s*\}\)/.test(src));
      assert.ok(/status\(502\)/.test(src));
    });
  });
});
