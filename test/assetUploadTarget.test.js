const assert = require("assert");
const fs = require("fs");
const path = require("path");

/**
 * Regression guard: the portal's upload handler (POST /proxies/v8/upload/action/*) must post
 * to the asset upload API, not the content one.
 *
 * Seen on Spark (aastar-stage-new) while preparing certificate templates: the SVG is an Asset,
 * and forwarding it to /api/content/v1/upload failed, so the template never got an artifactUrl.
 */
const SRC = fs.readFileSync(
  path.join(__dirname, "..", "src", "proxies_v8", "proxies_v8.ts"),
  "utf8"
);

const HANDLER = (function () {
  const idx = SRC.indexOf("proxiesV8.post('/upload/action/*'");
  assert.ok(idx !== -1, "upload handler proxiesV8.post('/upload/action/*') not found");
  return SRC.slice(idx, idx + 1500);
})();

describe("portal upload handler target", function () {
  it("posts to /api/asset/v1/upload/", function () {
    assert.ok(
      /const targetUrl = '\/api\/asset\/v1\/upload\/' \+ url/.test(HANDLER),
      "upload handler must target /api/asset/v1/upload/"
    );
  });

  it("no longer posts to /api/content/v1/upload/", function () {
    assert.ok(
      !/\/api\/content\/v1\/upload\//.test(HANDLER),
      "upload handler must not target /api/content/v1/upload/"
    );
  });

  it("still sends the upload to HTTPS_HOST", function () {
    assert.ok(
      /url: `\$\{CONSTANTS\.HTTPS_HOST\}` \+ targetUrl/.test(HANDLER),
      "upload handler must build its URL from HTTPS_HOST + targetUrl"
    );
  });
});
