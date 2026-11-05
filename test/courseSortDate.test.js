// Executed tests (ts-node), like certificateSvg.test.js.
require("ts-node/register");
const assert = require("assert");
const { courseSortTime, COURSE_SORT_FIELD } = require("../src/publicApi_v8/adapters/courseSortDate.ts");

/**
 * Course search sorts newest first by publish date. lastUpdatedOn also moves on
 * rating and system updates, which pushed courses nobody had edited to the top.
 */
describe("courseSortDate", function () {
  it("sort field is lastPublishedOn", function () {
    assert.strictEqual(COURSE_SORT_FIELD, "lastPublishedOn");
  });

  it("uses lastPublishedOn over a newer lastUpdatedOn", function () {
    const rated = { lastPublishedOn: "2026-01-10T00:00:00.000+0000", lastUpdatedOn: "2026-11-03T00:00:00.000+0000" };
    const published = { lastPublishedOn: "2026-06-01T00:00:00.000+0000", lastUpdatedOn: "2026-06-01T00:00:00.000+0000" };
    const sorted = [rated, published].sort((a, b) => courseSortTime(b) - courseSortTime(a));
    assert.strictEqual(sorted[0], published);
  });

  it("falls back to lastUpdatedOn when there is no publish date", function () {
    assert.strictEqual(courseSortTime({ lastUpdatedOn: "2026-02-02T00:00:00.000Z" }), Date.parse("2026-02-02T00:00:00.000Z"));
  });

  it("a missing or unparseable date sorts last instead of breaking the sort", function () {
    assert.strictEqual(courseSortTime({}), 0);
    assert.strictEqual(courseSortTime({ lastPublishedOn: "not a date" }), 0);
    assert.strictEqual(courseSortTime(null), 0);
  });
});
