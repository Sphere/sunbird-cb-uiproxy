const assert = require("assert");
const fs = require("fs");
const path = require("path");

/**
 * Regression guard: the generic /kong/* proxy in publicApi_v8/mobileAppApi.ts must
 * propagate the upstream status and body instead of collapsing every failure into a
 * hardcoded 500.
 *
 * Seen on Spark (aastar-stage-new): GET /public/v8/mobileApp/kong/user/v2/read/{id}
 * reported "Internal Server Error" (21 bytes, the literal string) while the upstream
 * was actually answering 401 - the user-read routes need x-authenticated-user-token
 * alongside the api key. The masked status sent the investigation after HTTPS_HOST and
 * a missing kong route before the log revealed the real 401. Same trap family as the
 * assessment-submit handler mapping every failure to 404.
 */
const SRC = fs.readFileSync(
  path.join(__dirname, "..", "src", "publicApi_v8", "mobileAppApi.ts"),
  "utf8"
);

// the catch block of the generic kong proxy, identified by its log line
const KONG_CATCH = (function () {
  const idx = SRC.indexOf("Error forwarding request:");
  assert.ok(idx !== -1, "generic kong proxy catch block not found");
  return SRC.slice(idx, idx + 500);
})();

describe("generic /kong/* proxy error propagation", function () {
  it("does not hardcode a 500 status", function () {
    assert.ok(
      !/res\.status\(\s*500\s*\)/.test(KONG_CATCH),
      "the kong proxy catch must not hardcode res.status(500) - it hides the real upstream status"
    );
  });

  it("uses the upstream response status when there is one", function () {
    assert.ok(
      /res\.status\(\s*\(?\s*error\s*&&\s*error\.response\s*&&\s*error\.response\.status/.test(
        KONG_CATCH
      ),
      "the kong proxy catch must derive its status from error.response.status"
    );
  });

  it("still falls back to 500 when the error carries no response", function () {
    assert.ok(
      /\|\|\s*500\s*\)/.test(KONG_CATCH),
      "a connection-level failure (no error.response) must still yield 500"
    );
  });

  it("sends the upstream body, falling back to the generic message", function () {
    assert.ok(
      /error\.response\.data\s*\)?\s*\|\|\s*INTERNAL_SERVER_ERROR/.test(KONG_CATCH),
      "the kong proxy catch must send error.response.data, falling back to INTERNAL_SERVER_ERROR"
    );
  });
});
