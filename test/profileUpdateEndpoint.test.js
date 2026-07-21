const assert = require("assert");
const fs = require("fs");
const path = require("path");

/**
 * Regression guard for the Sunbird Spark profileDetails-null bug.
 *
 * All self-registration flows populate the new user's profile via a PATCH to
 * lern's user-update API. That call is made with the api_admin service key and
 * NO end-user token (the user isn't logged in yet at registration time), so it
 * MUST target the PRIVATE endpoint (`/private/user/v1/update`, direct to
 * lern-service). Pointing it at the public `/api/user/v1/update` route makes
 * lern reject it with `UNAUTHORIZED_USER` ("Token not present"), which silently
 * leaves `profileDetails` null and later crashes the portal's TnC step on
 * `profileDetails.profileReq`.
 *
 * See memory: project_spark_signup_profiledetails_401.
 */
describe("registration profileUpdate endpoint", function () {
  const flows = [
    "signupWithAutoLoginV2.ts",
    "signupWithAutoLogin.ts",
    "signupWithAutoLoginOrgForm.ts",
    "appSignUpWithAutoLogin.ts",
    "bnrcUser.ts",
    "upsmfUser.ts",
    "mpNHMUser.ts",
    "maternityFoundationAuth.ts",
    "maharastraNursingCouncilAuth.ts",
    "sashaktAuth.ts",
    "tnaiAuth.ts",
    "tnnmcAuth.ts",
    "tnnmcAuthV2.ts",
    "mobileAppApi.ts",
  ];

  const profileUpdateLine = /profileUpdate:\s*`([^`]+)`/;

  flows.forEach(function (file) {
    it(`${file} must PATCH the private lern user-update endpoint`, function () {
      const src = fs.readFileSync(
        path.join(__dirname, "..", "src", "publicApi_v8", file),
        "utf8"
      );
      const match = src.match(profileUpdateLine);
      assert.ok(match, `no profileUpdate endpoint found in ${file}`);
      const endpoint = match[1];

      // Must use the private endpoint (api_admin-authorized, no user token required).
      assert.ok(
        endpoint.includes("/private/user/v1/update"),
        `${file}: profileUpdate must use /private/user/v1/update but was "${endpoint}"`
      );
      // Must NOT regress back to the public /user/v1/update route (requires a user token → 401).
      // Lookbehind excludes the legitimate /private/user/v1/update path.
      assert.ok(
        !/(?<!private)\/user\/v1\/update/.test(endpoint),
        `${file}: profileUpdate must not use the public /user/v1/update route but was "${endpoint}"`
      );
    });
  });
});
