const assert = require("assert");
const fs = require("fs");
const path = require("path");

/**
 * learnerPath was consolidated: the old /learnerPathV2 route (which pointed at
 * cb-ext) was removed, and the original /learnerPath route was repointed from the
 * recommendation-v2 service to cb-ext (SB_EXT_API_BASE_2). These guards keep it
 * on cb-ext and ensure the V2 duplicate stays gone.
 */
describe("learnerPath -> cb-ext consolidation", function () {
  const read = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");
  const learnerPath = read("src", "protectedApi_v8", "learnerPath.ts");
  const mount = read("src", "protectedApi_v8", "protectedApiV8.ts");
  const whitelist = read("src", "utils", "whitelistApis.ts");
  const publicConstants = read("src", "publicApi_v8", "apiConstants.ts");

  it("learnerPath calls cb-ext (SB_EXT_API_BASE_2), not the recommendation-v2 service", function () {
    assert.ok(
      /SB_EXT_API_BASE_2\}\/learnerpath/.test(learnerPath),
      "learnerpath endpoints must use SB_EXT_API_BASE_2 (cb-ext)"
    );
    assert.ok(
      !/RECOMMENDATION_API_BASE_V2/.test(learnerPath),
      "learnerPath must no longer reference RECOMMENDATION_API_BASE_V2"
    );
  });

  it("the learnerPathV2 route is fully removed", function () {
    assert.ok(
      !fs.existsSync(path.join(__dirname, "..", "src", "protectedApi_v8", "learnerPathV2.ts")),
      "learnerPathV2.ts file must be deleted"
    );
    assert.ok(!/learnerPathApiV2|learnerPathV2/.test(mount), "no learnerPathV2 import/mount in protectedApiV8");
    assert.ok(!/learnerPathV2/.test(whitelist), "no learnerPathV2 entry left in the whitelist (object map or flat array)");
  });

  it("the mobile learnerPath constants also point at cb-ext", function () {
    assert.ok(
      /GET_LEARNER_PATH:\s*`\$\{CONSTANTS\.SB_EXT_API_BASE_2\}\/learnerpath`/.test(publicConstants),
      "GET_LEARNER_PATH must use SB_EXT_API_BASE_2 (cb-ext)"
    );
    assert.ok(
      /UPDATE_LEARNER_PATH:\s*`\$\{CONSTANTS\.SB_EXT_API_BASE_2\}\/learnerpath`/.test(publicConstants),
      "UPDATE_LEARNER_PATH must use SB_EXT_API_BASE_2 (cb-ext)"
    );
  });

  it("the /learnerPath route is still mounted and whitelisted", function () {
    assert.ok(/protectedApiV8\.use\(\s*['"]\/learnerPath['"]/.test(mount), "/learnerPath must remain mounted");
    assert.ok(/['"]\/protected\/v8\/learnerPath['"]/.test(whitelist), "/protected/v8/learnerPath must remain whitelisted");
  });
});
