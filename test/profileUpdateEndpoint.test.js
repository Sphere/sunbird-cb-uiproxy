const assert = require("assert");
const fs = require("fs");
const path = require("path");

/**
 * Regression guard for the Sunbird Spark profileDetails-null bug.
 *
 * Self-registration flows populate the new user's profile via a PATCH to lern's
 * user-update API using the api_admin service key and NO end-user token (the
 * user isn't logged in yet at registration time). That call MUST target the
 * PRIVATE endpoint (`/private/user/v1/update`, direct to lern-service). The
 * public `/user/v1/update` route needs a user token -> lern returns
 * UNAUTHORIZED_USER, leaving `profileDetails` null and crashing the portal TnC
 * step; the `${SUNBIRD_PROXY}/user/private/v1/update` route 404s in Spark.
 *
 * Endpoints are centralized in apiConstants.ts, so the guard lives here.
 * See memory: project_spark_signup_profiledetails_401.
 */
const EXPECTED = "${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/update";

describe("registration profileUpdate endpoint (apiConstants)", function () {
  it("publicApi_v8/apiConstants: profileUpdate + httpsProfileUpdate use the private lern endpoint", function () {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "publicApi_v8", "apiConstants.ts"),
      "utf8"
    );
    ["profileUpdate", "httpsProfileUpdate"].forEach(function (key) {
      const m = src.match(new RegExp(key + ":\\s*`([^`]+)`"));
      assert.ok(m, `${key} not found in publicApi_v8/apiConstants.ts`);
      assert.strictEqual(
        m[1],
        EXPECTED,
        `${key} must be "${EXPECTED}" (private lern endpoint that works in Spark) but was "${m[1]}"`
      );
    });
  });
});
