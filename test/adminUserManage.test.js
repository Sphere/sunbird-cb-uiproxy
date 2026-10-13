const assert = require("assert");
const fs = require("fs");
const path = require("path");

/**
 * Guards for the admin user search/update proxy (adminUserManage).
 *
 * These endpoints let the admin portal (which does its own AWS login and sends the
 * SB_API_KEY) search/update any user WITHOUT an end-user token. They must:
 *   - call lern-service's PRIVATE endpoints (private/user/v1/search|update), which are
 *     the tokenless, SB_API_KEY-authenticated paths (NOT the Kong /user/v1/* routes that
 *     require x-authenticated-user-token and 401 on Spark),
 *   - forward the caller's Authorization header to lern,
 *   - reject requests with no Authorization, so the route is not an open user-CRUD surface.
 */
describe("adminUserManage routes", function () {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "src", "publicApi_v8", "adminUserManage.ts"),
    "utf8"
  );
  const mount = fs.readFileSync(
    path.join(__dirname, "..", "src", "publicApi_v8", "publicApiV8.ts"),
    "utf8"
  );

  it("exposes POST /search and POST /update", function () {
    assert.ok(/\.post\(\s*['"]\/search['"]/.test(src), "must define POST /search");
    assert.ok(/\.post\(\s*['"]\/update['"]/.test(src), "must define POST /update");
  });

  it("calls the lern-service PRIVATE endpoints (tokenless), not the Kong user routes", function () {
    assert.ok(
      /API_END_POINTS\.USER_SEARCH/.test(src),
      "search must use API_END_POINTS.USER_SEARCH (private/user/v1/search)"
    );
    assert.ok(
      /API_END_POINTS\.profileUpdate/.test(src),
      "update must use API_END_POINTS.profileUpdate (private/user/v1/update)"
    );
    assert.ok(
      !/kongUpdateUser|kongUserSearch|kongSearchUser/.test(src),
      "must NOT use the Kong /user/v1/* routes (those need a user token and 401 on Spark)"
    );
  });

  it("forwards the caller's Authorization (SB_API_KEY) header to lern", function () {
    assert.ok(
      /header\(\s*['"]Authorization['"]\s*\)/i.test(src),
      "must read the incoming Authorization header"
    );
    assert.ok(
      /headers:\s*\{\s*Authorization:\s*authorization/.test(src),
      "must forward that Authorization value to the lern call"
    );
  });

  it("rejects requests without an Authorization header (not an open surface)", function () {
    assert.ok(
      /status\(\s*401\s*\)/.test(src),
      "must return 401 when Authorization is missing"
    );
    // both handlers guard: two 401 responses expected
    const guards = (src.match(/status\(\s*401\s*\)/g) || []).length;
    assert.ok(guards >= 2, "both /search and /update must guard the missing-auth case");
  });

  it("is mounted under /adminUserManage in publicApiV8", function () {
    assert.ok(
      /publicApiV8\.use\(\s*['"]\/adminUserManage['"]\s*,\s*adminUserManage\s*\)/.test(mount),
      "adminUserManage must be mounted on publicApiV8"
    );
    assert.ok(
      /import\s*\{\s*adminUserManage\s*\}\s*from\s*['"]\.\/adminUserManage['"]/.test(mount),
      "adminUserManage must be imported in publicApiV8"
    );
  });
});
