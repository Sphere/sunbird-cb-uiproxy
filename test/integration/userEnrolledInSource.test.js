/**
 * LIVE INTEGRATION TEST — deliberately NOT run by any CI pipeline.
 *
 * Makes a real network call to a deployed environment. Quarantined out of CI so
 * that builds never depend on a live host being reachable.
 *
 * Run explicitly:   npm run test:integration
 *
 * Black-box HTTP only; never imports src/, so it contributes zero code
 * coverage. See docs/sonarqube.md.
 */
const request = require("supertest")("https://sphere.aastrika.org/apis/");
//Checking for invalid cookie
describe("GET /enrolledUsersCount", function () {
  it("Get contents", async function () {
    // Use supertest to run assertions for our API
    await request
      .get(
        "protected/v8/userEnrolledInSource?sourceName=Indian Nursing Council"
      )
      .expect(419)
      .expect("Content-Type", "application/json; charset=utf-8");
  }).timeout(10000);
});
