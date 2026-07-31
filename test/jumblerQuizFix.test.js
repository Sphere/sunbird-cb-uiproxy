const assert = require("assert");
const fs = require("fs");
const path = require("path");

/**
 * jumbler serves both practice quizzes and graded assessments.
 * `falseCreator` zeroes every option's isCorrect so the correct answer can't be
 * read on the client. That is right for GRADED ASSESSMENTS (scored server-side),
 * but a QUIZ is scored client-side (quiz.service.checkAnswer reads isCorrect), so
 * stripping the flags breaks it. Guard: apply falseCreator ONLY when isAssessment.
 */
describe("jumbler falseCreator scope", function () {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "src", "utils", "jumbler.ts"),
    "utf8"
  );

  it("applies falseCreator only for graded assessments (isAssessment)", function () {
    assert.ok(
      /isAssessment[\s\S]{0,80}\.map\(falseCreator\)/.test(src),
      "falseCreator must be gated behind an isAssessment check"
    );
  });

  it("does NOT strip isCorrect unconditionally", function () {
    // the old code did `_.sampleSize(...).map(falseCreator)` with no condition
    assert.ok(
      !/sampleSize\([\s\S]*?\)\s*\.map\(falseCreator\)/.test(src),
      "sampled questions must not be piped straight through falseCreator without the isAssessment guard"
    );
  });

  it("still defines falseCreator (kept for the assessment path)", function () {
    assert.ok(/const falseCreator\s*=/.test(src), "falseCreator must remain for graded assessments");
  });
});
