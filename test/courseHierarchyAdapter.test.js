// Unlike this repo's other adapter tests (userReadAdapter.test.js), which are static
// source-regex assertions, these are real executed tests. That's deliberate: this
// adapter's contract is defined by concrete input->output value pairs (e.g. "an object
// input must come out as a one-element JSON array string"), which a regex over the
// source text can't actually verify - only running the function can. ts-node/register
// is used here only, so the repo's shared `mocha 'test/*.js'` script and every other
// test file are untouched.
require("ts-node/register");
const assert = require("assert");
const {
  normalizeCompetenciesV1,
  adaptCourseHierarchyResponse,
} = require("../src/publicApi_v8/adapters/courseHierarchyAdapter.ts");

/**
 * Every mobile-app consumer of COURSE_HIERARCHY (mobile-course-view.component.ts,
 * card.service.ts, learning-card.component.ts, self-assessment.guard.ts, and others -
 * home-page.util's types.ts even types the field as `string`) calls
 * JSON.parse(node.competencies_v1) directly. None expect an array or object - calling
 * JSON.parse on an already-parsed array throws, since JSON.parse coerces a non-string
 * argument via .toString() first, which doesn't round-trip valid JSON. So this adapter's
 * contract is the opposite of "normalize to array": it guarantees competencies_v1 is
 * always a valid JSON *string* (or left absent), regardless of what shape the backend
 * actually sends.
 */
describe("courseHierarchyAdapter", function () {
  describe("normalizeCompetenciesV1", function () {
    it("Case A - stringified array JSON is preserved as-is", function () {
      const input = '[{"competencyName":"Test","competencyId":"100"}]';
      const result = normalizeCompetenciesV1(input);
      assert.strictEqual(typeof result, "string");
      assert.deepStrictEqual(JSON.parse(result), [
        { competencyName: "Test", competencyId: "100" },
      ]);
    });

    it("Case B - an already-parsed array is stringified, not double-encoded", function () {
      const input = [{ competencyName: "Test", competencyId: "100" }];
      const result = normalizeCompetenciesV1(input);
      assert.strictEqual(typeof result, "string");
      assert.deepStrictEqual(JSON.parse(result), input);
      // must be real JSON, not e.g. the array's default .toString() ("[object Object]")
      assert.doesNotThrow(() => JSON.parse(result));
    });

    it("Case C - a single object is wrapped into a one-element array string", function () {
      const input = { competencyName: "Test", competencyId: "100" };
      const result = normalizeCompetenciesV1(input);
      assert.strictEqual(typeof result, "string");
      assert.deepStrictEqual(JSON.parse(result), [input]);
    });

    it("Case D - null is left untouched, does not throw", function () {
      assert.doesNotThrow(() => normalizeCompetenciesV1(null));
      assert.strictEqual(normalizeCompetenciesV1(null), null);
    });

    it("Case D - undefined is left untouched, does not throw", function () {
      assert.doesNotThrow(() => normalizeCompetenciesV1(undefined));
      assert.strictEqual(normalizeCompetenciesV1(undefined), undefined);
    });

    it("Case E - invalid JSON string does not throw, falls back to an empty-array string", function () {
      assert.doesNotThrow(() => normalizeCompetenciesV1("not-valid-json"));
      const result = normalizeCompetenciesV1("not-valid-json");
      assert.strictEqual(typeof result, "string");
      assert.deepStrictEqual(JSON.parse(result), []);
    });

    it("a stringified single object (not array) is normalized to a one-element array string", function () {
      const input = '{"competencyName":"Test","competencyId":"100"}';
      const result = normalizeCompetenciesV1(input);
      assert.deepStrictEqual(JSON.parse(result), [
        { competencyName: "Test", competencyId: "100" },
      ]);
    });
  });

  describe("adaptCourseHierarchyResponse", function () {
    function buildResponse(rootCompetencies, childCompetencies) {
      return {
        id: "api.course.hierarchy",
        ver: "1.0",
        responseCode: "OK",
        result: {
          content: {
            identifier: "do_root",
            name: "Root Course",
            primaryCategory: "Course",
            competencies_v1: rootCompetencies,
            children: [
              {
                identifier: "do_child_1",
                name: "Level 1",
                isAssessment: true,
                index: 1,
                competencies_v1: childCompetencies,
              },
              {
                identifier: "do_child_2",
                name: "Level 2",
                isAssessment: true,
                index: 2,
                // no competencies_v1 on this child at all
              },
            ],
          },
        },
      };
    }

    it("normalizes the root content's competencies_v1", function () {
      const response = buildResponse(
        '[{"competencyName":"Root","competencyId":"1"}]',
        undefined
      );
      const adapted = adaptCourseHierarchyResponse(response);
      assert.deepStrictEqual(JSON.parse(adapted.result.content.competencies_v1), [
        { competencyName: "Root", competencyId: "1" },
      ]);
    });

    it("Case 7 - normalizes competencies_v1 on children too, when present", function () {
      const response = buildResponse(undefined, {
        competencyName: "Child",
        competencyId: "2",
      });
      const adapted = adaptCourseHierarchyResponse(response);
      const child1 = adapted.result.content.children[0];
      assert.deepStrictEqual(JSON.parse(child1.competencies_v1), [
        { competencyName: "Child", competencyId: "2" },
      ]);
    });

    it("leaves a child with no competencies_v1 field untouched (no field invented)", function () {
      const response = buildResponse(undefined, undefined);
      const adapted = adaptCourseHierarchyResponse(response);
      const child2 = adapted.result.content.children[1];
      assert.ok(!("competencies_v1" in child2), "must not invent a competencies_v1 field");
    });

    it("Case 8 - preserves unrelated fields (identifier, name, primaryCategory, children)", function () {
      const response = buildResponse(
        '[{"competencyName":"Root","competencyId":"1"}]',
        undefined
      );
      const adapted = adaptCourseHierarchyResponse(response);
      assert.strictEqual(adapted.result.content.identifier, "do_root");
      assert.strictEqual(adapted.result.content.name, "Root Course");
      assert.strictEqual(adapted.result.content.primaryCategory, "Course");
      assert.strictEqual(adapted.result.content.children.length, 2);
      assert.strictEqual(adapted.result.content.children[0].identifier, "do_child_1");
      assert.strictEqual(adapted.result.content.children[0].isAssessment, true);
      assert.strictEqual(adapted.result.content.children[0].index, 1);
      assert.strictEqual(adapted.id, "api.course.hierarchy");
      assert.strictEqual(adapted.responseCode, "OK");
    });

    it("does not mutate the original response object", function () {
      const response = buildResponse(
        [{ competencyName: "Root", competencyId: "1" }],
        undefined
      );
      const originalCompetencies = response.result.content.competencies_v1;
      const adapted = adaptCourseHierarchyResponse(response);
      // original reference must be untouched - still the real array, not stringified
      assert.strictEqual(response.result.content.competencies_v1, originalCompetencies);
      assert.ok(Array.isArray(response.result.content.competencies_v1));
      // the adapted copy must be different from the original
      assert.notStrictEqual(adapted, response);
      assert.notStrictEqual(adapted.result, response.result);
      assert.notStrictEqual(adapted.result.content, response.result.content);
      assert.strictEqual(typeof adapted.result.content.competencies_v1, "string");
    });

    it("returns the response unchanged when result.content is absent", function () {
      const response = { id: "x", result: {} };
      const adapted = adaptCourseHierarchyResponse(response);
      assert.deepStrictEqual(adapted, response);
    });

    it("recurses into nested grandchildren", function () {
      const response = {
        result: {
          content: {
            identifier: "do_root",
            children: [
              {
                identifier: "do_child",
                children: [
                  {
                    identifier: "do_grandchild",
                    competencies_v1: { competencyName: "Deep", competencyId: "3" },
                  },
                ],
              },
            ],
          },
        },
      };
      const adapted = adaptCourseHierarchyResponse(response);
      const grandchild = adapted.result.content.children[0].children[0];
      assert.deepStrictEqual(JSON.parse(grandchild.competencies_v1), [
        { competencyName: "Deep", competencyId: "3" },
      ]);
    });
  });
});
