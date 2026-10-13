const assert = require("assert");
const fs = require("fs");
const path = require("path");

/**
 * Guard for the course-search competency lookup.
 *
 * getCourses (keyword path) resolves a search term to competency ids and then
 * finds courses tagged with those competencies. That lookup must use the FRAC
 * entity service (FRAC_ETL_API_BASE /v1/entity/search) directly — NOT the old
 * competency Postgres `data_node` table (pg pool), which was a per-env DB that
 * kept breaking in Spark (missing role/db). FRAC is the source of truth and is
 * reachable in-cluster with no auth.
 */
describe("publicSearch competency lookup", function () {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "src", "publicApi_v8", "publicSearch.ts"),
    "utf8"
  );

  it("resolves competencies via the FRAC entity service", function () {
    assert.ok(
      src.includes("CONSTANTS.FRAC_ETL_API_BASE") && src.includes("/v1/entity/search"),
      "publicSearch must call ${CONSTANTS.FRAC_ETL_API_BASE}/v1/entity/search"
    );
    assert.ok(
      src.includes("entityType: 'Competency'") || src.includes('entityType: "Competency"'),
      "the FRAC call must request entityType Competency"
    );
    assert.ok(
      /\$\{competency\.entityId\}-\$\{level\}/.test(src),
      "must build ES competency tags as entityId-level from the FRAC response"
    );
  });

  it("no longer uses the Postgres data_node lookup", function () {
    assert.ok(!/pool\.query/.test(src), "pool.query must be removed");
    assert.ok(!/from ['\"]pg['\"]/.test(src), "the pg import must be removed");
    assert.ok(!/public\.data_node/.test(src.replace(/\/\/.*$/gm, "")), "no data_node SQL should remain (comments aside)");
  });

  it("only expands competencies whose name matches the query (no fuzzy over-match)", function () {
    // FRAC strict:'false' fuzzy-matches every word in the query and returns many
    // competencies (e.g. "Normal Labour & Birth and AMTSL" -> 57). Expanding all of
    // them flooded results (67 vs prod's 2). The lookup must filter FRAC entities to
    // those whose name equals the query before building competency tags.
    assert.ok(
      /normalizeName\s*\(\s*competency\.name\s*\)\s*!==\s*normalizedQuery/.test(src),
      "must skip FRAC entities whose normalized name !== the normalized query"
    );
    assert.ok(
      /const\s+normalizeName\s*=/.test(src) &&
        /toLowerCase\(\)/.test(src) &&
        /replace\(\/\\s\+\/g/.test(src),
      "normalizeName must trim, lowercase and collapse whitespace for comparison"
    );
  });
});
