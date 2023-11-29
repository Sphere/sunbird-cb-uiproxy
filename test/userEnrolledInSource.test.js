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
