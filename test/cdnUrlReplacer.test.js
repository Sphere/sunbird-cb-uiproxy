const assert = require("assert");
const fs = require("fs");
const path = require("path");

/**
 * The CDN URL replacer must rewrite ONLY the configured S3_DOMAIN to CDN_DOMAIN.
 * A previous version ran a generic https://*.s3*.amazonaws.com/ regex first, which
 * shadowed the S3_DOMAIN logic, over-matched other buckets, and swallowed the
 * trailing slash (breaking the domain/path join when CDN_DOMAIN had no trailing
 * slash). These guards keep it scoped to S3_DOMAIN.
 */
describe("cdn-url-replacer", function () {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "src", "authoring", "utils", "cdn-url-replacer.ts"),
    "utf8"
  );

  it("matches on the configured S3_DOMAIN", function () {
    assert.ok(
      /str\.includes\(\s*CONSTANTS\.S3_DOMAIN\s*\)/.test(src),
      "must match using CONSTANTS.S3_DOMAIN"
    );
  });

  it("replaces to CDN_DOMAIN", function () {
    assert.ok(
      /new RegExp\(escapedS3Domain[\s\S]*CONSTANTS\.CDN_DOMAIN/.test(src),
      "must replace the S3 domain with CONSTANTS.CDN_DOMAIN"
    );
  });

  it("no longer uses the generic *.s3*.amazonaws.com over-match regex", function () {
    assert.ok(
      !/\\\.s3\[\^\/\]\*\\\.amazonaws\\\.com/.test(src),
      "the generic amazonaws.com regex must be removed (it over-matched other buckets and ate the trailing slash)"
    );
  });
});
