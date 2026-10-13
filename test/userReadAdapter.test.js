const assert = require("assert");
const fs = require("fs");
const path = require("path");

/**
 * Spark's USER_READ and user/v1/search responses each dropped fields the mobile app
 * treats as load-bearing:
 *   - USER_READ dropped `userId` (read in 80+ places) and `roles` (gates whether
 *     user.service.ts / signup.service.ts set up the user profile at all).
 *   - user/v1/search dropped `userId` from each result in content[] - login.component.ts
 *     reads userContent[0].userId and gates the ENTIRE login on it being truthy, so this
 *     breaks login itself, not just profile setup. `roles` on search results was already
 *     `[]` in the OLD contract regardless of organisations[].roles, so - unlike
 *     USER_READ - it must NOT be derived from organisation roles here; that would
 *     introduce a regression ([] -> ["PUBLIC"]) where none exists today.
 * userReadAdapter.ts backfills only what's actually consumed, additively (never
 * overwriting a real value), scoped to exactly one /kong endpoint each.
 */
const ADAPTER_SRC = fs.readFileSync(
  path.join(__dirname, "..", "src", "publicApi_v8", "adapters", "userReadAdapter.ts"),
  "utf8"
);
const MOBILE_APP_SRC = fs.readFileSync(
  path.join(__dirname, "..", "src", "publicApi_v8", "mobileAppApi.ts"),
  "utf8"
);

// Extract a single exported function's source by name, from its `export const <name> =`
// up to (but not including) the next top-level `export const`/EOF - so assertions about
// one function's body can't accidentally match a sibling function's code.
function extractFunction(src, name) {
  const start = src.indexOf(`export const ${name} =`);
  assert.ok(start !== -1, `export const ${name} not found in userReadAdapter.ts`);
  const next = src.indexOf("export const", start + 1);
  return next === -1 ? src.slice(start) : src.slice(start, next);
}

const IS_USER_READ_REQUEST = extractFunction(ADAPTER_SRC, "isUserReadRequest");
const ADAPT_USER_READ_RESPONSE = extractFunction(ADAPTER_SRC, "adaptUserReadResponse");
const IS_USER_SEARCH_REQUEST = extractFunction(ADAPTER_SRC, "isUserSearchRequest");
const ADAPT_USER_SEARCH_RESPONSE = extractFunction(ADAPTER_SRC, "adaptUserSearchResponse");

describe("userReadAdapter - USER_READ (GET /kong/user/v2/read/:id)", function () {
  describe("isUserReadRequest", function () {
    it("matches only GET /kong/user/v2/read/*", function () {
      assert.ok(
        /req\.method\s*===\s*['"]GET['"]/.test(IS_USER_READ_REQUEST),
        "must require a GET request"
      );
      assert.ok(
        /\/kong\\\/user\\\/v2\\\/read\\\//.test(IS_USER_READ_REQUEST),
        "must match the literal /kong/user/v2/read/ path segment"
      );
    });

    it("does not match user/v1/search or any other kong-user path", function () {
      assert.ok(
        !/v1\\\/search/.test(IS_USER_READ_REQUEST),
        "must not widen the match to the user/v1/search route"
      );
    });
  });

  describe("adaptUserReadResponse", function () {
    it("returns the response unchanged when result.response is absent", function () {
      assert.ok(
        /if\s*\(\s*!userResponse\s*\)\s*\{\s*return response\s*\}/.test(
          ADAPT_USER_READ_RESPONSE
        ),
        "must guard against a missing result.response and return the original response"
      );
    });

    it("backfills userId from id only when userId is missing", function () {
      assert.ok(
        /userResponse\.userId\s*===\s*undefined\s*&&\s*userResponse\.id\s*!==\s*undefined/.test(
          ADAPT_USER_READ_RESPONSE
        ),
        "must only set userId when it is undefined and id is present - never overwrite a real value"
      );
      assert.ok(
        /userResponse\.userId\s*=\s*userResponse\.id/.test(ADAPT_USER_READ_RESPONSE),
        "must assign userId from id"
      );
    });

    it("backfills roles from organisations[].roles only when roles is missing", function () {
      assert.ok(
        /userResponse\.roles\s*===\s*undefined/.test(ADAPT_USER_READ_RESPONSE),
        "must only derive roles when roles is undefined - never overwrite a real value"
      );
      assert.ok(
        /Array\.isArray\(userResponse\.organisations\)/.test(ADAPT_USER_READ_RESPONSE),
        "must guard against organisations being null/missing/non-array"
      );
      assert.ok(
        /new Set\(orgRoles\)/.test(ADAPT_USER_READ_RESPONSE),
        "must dedupe roles collected across organisations"
      );
    });

    it("returns the mutated response object", function () {
      assert.ok(
        /return response\s*\n\s*\}/.test(ADAPT_USER_READ_RESPONSE),
        "must return response at the end of the function"
      );
    });
  });
});

describe("userReadAdapter - user/v1/search (POST /kong/user/v1/search)", function () {
  describe("isUserSearchRequest", function () {
    it("matches only POST /kong/user/v1/search", function () {
      assert.ok(
        /req\.method\s*===\s*['"]POST['"]/.test(IS_USER_SEARCH_REQUEST),
        "must require a POST request"
      );
      assert.ok(
        /\/kong\\\/user\\\/v1\\\/search/.test(IS_USER_SEARCH_REQUEST),
        "must match the literal /kong/user/v1/search path"
      );
    });

    it("does not match USER_READ or any other kong-user path", function () {
      assert.ok(
        !/v2\\\/read/.test(IS_USER_SEARCH_REQUEST),
        "must not widen the match to the user/v2/read route"
      );
    });
  });

  describe("adaptUserSearchResponse", function () {
    it("returns the response unchanged when result.response.content is not an array", function () {
      assert.ok(
        /if\s*\(\s*!Array\.isArray\(content\)\s*\)\s*\{\s*return response\s*\}/.test(
          ADAPT_USER_SEARCH_RESPONSE
        ),
        "must guard against a missing/non-array content and return the original response"
      );
    });

    it("backfills userId from id on every content item, only when userId is missing", function () {
      assert.ok(
        /content\.forEach/.test(ADAPT_USER_SEARCH_RESPONSE),
        "must iterate every item in content[], not just the first"
      );
      assert.ok(
        /user\.userId\s*===\s*undefined\s*&&\s*user\.id\s*!==\s*undefined/.test(
          ADAPT_USER_SEARCH_RESPONSE
        ),
        "must only set userId when it is undefined and id is present - never overwrite a real value"
      );
      assert.ok(
        /user\.userId\s*=\s*user\.id/.test(ADAPT_USER_SEARCH_RESPONSE),
        "must assign userId from id"
      );
    });

    it("does NOT derive roles from organisations (unlike USER_READ - see file header comment)", function () {
      assert.ok(
        !/roles/.test(ADAPT_USER_SEARCH_RESPONSE),
        "adaptUserSearchResponse must not touch roles at all - the old contract already " +
          "returned [] here regardless of organisation roles, so deriving it would be a regression"
      );
    });

    it("returns the mutated response object", function () {
      assert.ok(
        /return response\s*\n\s*\}/.test(ADAPT_USER_SEARCH_RESPONSE),
        "must return response at the end of the function"
      );
    });
  });
});

describe("generic /kong/* proxy - endpoint-scoped adaptation", function () {
  it("imports all four adapter functions from ./adapters/userReadAdapter", function () {
    const importBlockStart = MOBILE_APP_SRC.indexOf("from './adapters/userReadAdapter'");
    assert.ok(importBlockStart !== -1, "must import from ./adapters/userReadAdapter");
    const importBlock = MOBILE_APP_SRC.slice(
      MOBILE_APP_SRC.lastIndexOf("import", importBlockStart),
      importBlockStart
    );
    ["adaptUserReadResponse", "adaptUserSearchResponse", "isUserReadRequest", "isUserSearchRequest"].forEach(
      (name) => {
        assert.ok(
          importBlock.includes(name),
          `must import ${name} from ./adapters/userReadAdapter`
        );
      }
    );
  });

  it("adapts USER_READ and user/v1/search independently, defaulting to the untouched response", function () {
    const catchAllStart = MOBILE_APP_SRC.indexOf("const response = await axios(axiosOptions)");
    assert.ok(catchAllStart !== -1, "generic kong proxy axios call not found");
    const dispatchBlock = MOBILE_APP_SRC.slice(catchAllStart, catchAllStart + 700);

    assert.ok(
      /let responseData = response\.data/.test(dispatchBlock),
      "must default responseData to the untouched response.data"
    );
    assert.ok(
      /if\s*\(\s*isUserReadRequest\(req\)\s*\)\s*\{\s*responseData = adaptUserReadResponse\(responseData\)/.test(
        dispatchBlock
      ),
      "must only call adaptUserReadResponse when isUserReadRequest(req) is true"
    );
    assert.ok(
      /else if\s*\(\s*isUserSearchRequest\(req\)\s*\)\s*\{\s*responseData = adaptUserSearchResponse\(responseData\)/.test(
        dispatchBlock
      ),
      "must only call adaptUserSearchResponse when isUserSearchRequest(req) is true, " +
        "and only when it is not also a USER_READ request"
    );
  });

  it("sends the (possibly adapted) response via a single res.status(...).send(...) call", function () {
    assert.ok(
      /res\.status\(response\.status\)\.send\(responseData\)/.test(MOBILE_APP_SRC),
      "must send responseData, not send response.data directly, so any adaptation actually reaches the client"
    );
  });
});
