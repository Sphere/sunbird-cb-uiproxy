const assert = require("assert");
const fs = require("fs");
const path = require("path");

/**
 * Regression guard: the two side-effects of protectedApi_v8 /v2/updateUser
 * (the telemetry POST and the profile-journey Cassandra insert) MUST be
 * non-blocking, so an outage of telemetry-service or Cassandra can never turn a
 * successful profile update into a 500.
 *
 * Root cause seen on Spark (aastar-stage-new): a dead node left telemetry-service
 * with no endpoints; the handler AWAITED the telemetry POST inside the main try,
 * so every profile update returned 500 ("Error occurred while updating user
 * profile") even though lern had already updated the profile. Same trap existed
 * for the audit-only user_profile_journey insert (its catch returned 500).
 * See memory: reference_spark_crossrepo_index (TnC/profile-update 500, cause #1).
 */
const SRC = fs.readFileSync(
  path.join(__dirname, "..", "src", "protectedApi_v8", "user", "profile-details.ts"),
  "utf8"
);

describe("/v2/updateUser side-effects are non-blocking", function () {
  it("telemetry POST is fire-and-forget (not awaited, has its own .catch)", function () {
    const idx = SRC.indexOf("axios.post(API_END_POINTS.telemetryUpdate");
    assert.ok(idx !== -1, "telemetry POST to API_END_POINTS.telemetryUpdate not found");

    // must NOT be awaited — an awaited telemetry call 500s the update when telemetry is down
    const before = SRC.slice(Math.max(0, idx - 12), idx);
    assert.ok(
      !/await\s*$/.test(before),
      "telemetry POST must NOT be awaited (a telemetry outage would 500 the profile update)"
    );

    // must attach a .catch(...) so a telemetry failure is swallowed, not thrown
    const after = SRC.slice(idx, idx + 400);
    assert.ok(
      /\}\)\s*\.catch\s*\(/.test(after),
      "telemetry POST must attach a .catch(...) so failures are non-blocking"
    );
  });

  it("profile-journey Cassandra insert failure does not fail the response", function () {
    const m = SRC.match(/catch\s*\(\s*dbError\s*\)\s*\{([\s\S]*?)\}/);
    assert.ok(m, "catch (dbError) block for the profile-journey insert not found");
    assert.ok(
      !/res\.status\(\s*500\s*\)/.test(m[1]),
      "the profile-journey insert catch must NOT return res.status(500) — it is an audit-only side-effect"
    );
  });

  it("the primary profile update (kongUpdateUser PATCH) is still awaited", function () {
    // the actual update MUST stay blocking so its result/errors drive the response
    assert.ok(
      /await\s+axios\.patch\(\s*API_END_POINTS\.kongUpdateUser/.test(SRC),
      "the primary profile update PATCH to kongUpdateUser must remain awaited"
    );
  });
});
