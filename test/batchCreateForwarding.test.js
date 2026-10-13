const assert = require("assert");
const fs = require("fs");
const path = require("path");

/**
 * proxyCreatorLearner used to swallow every learner batch/create call and answer
 * with a hardcoded success carrying an empty batchId. That suited Sunbird ED,
 * where post-publish-processor created the batch automatically and forwarding
 * would have produced a duplicate. Sunbird Spark does not ship that job, so the
 * swallowed request left published courses with no batch and learners unable to
 * enrol -- while the caller saw "SUCCESS". The short-circuit is now opt-in.
 */
describe("learner batch/create forwarding", function () {
  const read = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");
  const proxyCreator = read("src", "utils", "proxyCreator.ts");
  const env = read("src", "utils", "env.ts");
  const whitelist = read("src", "utils", "whitelistApis.ts");

  it("declares STUB_BATCH_CREATE, defaulting to off", function () {
    assert.ok(
      /STUB_BATCH_CREATE:\s*env\.STUB_BATCH_CREATE === 'true'/.test(env),
      "STUB_BATCH_CREATE must come from the environment and default to false"
    );
  });

  it("only short-circuits batch/create when STUB_BATCH_CREATE is set", function () {
    assert.ok(
      /if \(CONSTANTS\.STUB_BATCH_CREATE && url\.includes\('\/batch\/create'\)\)/.test(proxyCreator),
      "the batch/create short-circuit must be guarded by CONSTANTS.STUB_BATCH_CREATE"
    );
    assert.ok(
      !/if \(url\.includes\('\/batch\/create'\)\) \{/.test(proxyCreator),
      "the unconditional batch/create short-circuit must be gone"
    );
  });

  it("keeps the canned response available for deployments that opt in", function () {
    assert.ok(
      /batchId: '',/.test(proxyCreator),
      "the stubbed response is still needed where post-publish-processor runs"
    );
  });

  it("keeps batch/create whitelisted so the forwarded call is allowed through", function () {
    assert.ok(
      /'\/proxies\/v8\/learner\/course\/v1\/batch\/create'/.test(whitelist),
      "batch/create must stay in the whitelist or the forwarded request is rejected"
    );
  });
});
