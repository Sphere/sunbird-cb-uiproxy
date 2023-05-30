const request = require("supertest")("https://sphere.aastrika.org/apis/");
const chai = require("chai");
const expect = chai.expect;
describe("GET /getContents", function () {
  it("Get contents", async function () {
    // Use supertest to run assertions for our API
    const response = await request
      .get(
        "public/v8/mobileApp/getContents/content/html/do_113747723078148096122-latest/mobile/6FcNmAOA5cI.png"
      )
      .expect(200)
      .expect("Content-Type", "image/png");
  }).timeout(10000);
});
describe("GET /v1/assessment/*", function () {
  it("Get competency assessment", async function () {
    // Use supertest to run assertions for our API
    const response = await request
      .get(
        "public/v8/mobileApp/v1/assessment/content/do_11373908986661273612316/artifact/do_11373908986661273612316_1677137175846_quiz.json"
      )
      .expect(200);
    const questions = response._body.questions;
    expect(questions).to.be.an("array");
    expect(questions).length.to.be.greaterThan(0);
  }).timeout(10000);
});
describe("POST /submitAssessment 404", function () {
  it("Requires authentication", async function () {
    const response = await request
      .post("public/v8/mobileApp/v1/competencyAssessment/submit")
      .send({
        timeLimit: 420000,
        isAssessment: true,
        questions: [
          {
            questionId: "Q139",
            question:
              '<p>10.&nbsp;<meta charset="utf-8" /><b id="docs-internal-guid-6b74f106-7fff-1fdf-e182-4201b8926936">What is the WRONG statement regarding Toothbrushing? </b></p>\n',
            questionType: "mcq-sca",
            options: [
              {
                text: "Teeth should be brushed twice a day",
                optionId: "Q139-a",
                isCorrect: false,
                userSelected: true,
                hint: "",
              },
              {
                text: "Teeth should be brushed for 20 mins ",
                optionId: "Q139-b",
                isCorrect: false,
                userSelected: false,
                hint: "",
              },
              {
                text: " Toothbrush should be changed once in 3 months or when the bristles fray away ",
                isCorrect: false,
                optionId: "Q139-c",
                userSelected: false,
                hint: "",
              },
              {
                text: "Teeth should be brushed using the right technique",
                isCorrect: false,
                optionId: "Q139-d",
                userSelected: false,
                hint: "",
              },
            ],
            multiSelection: false,
          },
          {
            questionId: "Q117",
            question:
              '<p>8.&nbsp;<b id="docs-internal-guid-815fa85e-7fff-a238-324c-5a194e5edf3e">Which condition of the oral cavity is caused due to Tobacco usage by the person?</b></p>\n\n<p><meta charset="utf-8" /></p>\n',
            questionType: "mcq-sca",
            options: [
              {
                text: " Cleft lip/palate",
                optionId: "Q117-a",
                isCorrect: false,
                userSelected: true,
                hint: "",
              },
              {
                text: "Irregular arrangement of teeth",
                optionId: "Q117-b",
                isCorrect: false,
                userSelected: false,
                hint: "",
              },
              {
                text: " Oral Cancer",
                isCorrect: false,
                optionId: "Q117-c",
                userSelected: false,
                hint: "",
              },
              {
                text: "Tobacco is safe to use",
                isCorrect: false,
                optionId: "Q117-d",
                userSelected: false,
                hint: "",
              },
            ],
            multiSelection: false,
          },
        ],
        identifier: "do_113669596007481344123",
        title: "Proficinecy 1",
        artifactUrl:
          "https://sunbirdcontent-stage.s3-ap-south-1.amazonaws.com/content/do_113669596007481344123/artifact/do_113669596007481344123_1668651917401_quiz.json",
        contentId: "do_113669596007481344123",
        courseId: "do_113669595273363456121",
        batchId: "0136697466508410881",
        userId: null,
      })
      .expect(404);
    // const questions = response._body.questions;
    // expect(questions).to.be.an("array");
    // expect(questions).length.to.be.greaterThan(0);
  }).timeout(10000);
});
describe("POST /submitAssessment 200", function () {
  it("Requires an authentication", async function () {
    const response = await request
      .post("public/v8/mobileApp/v1/competencyAssessment/submit")
      .set("x-authenticated-user-token", "")
      .send({
        timeLimit: 420000,
        isAssessment: true,
        questions: [
          {
            questionId: "Q139",
            question:
              '<p>10.&nbsp;<meta charset="utf-8" /><b id="docs-internal-guid-6b74f106-7fff-1fdf-e182-4201b8926936">What is the WRONG statement regarding Toothbrushing? </b></p>\n',
            questionType: "mcq-sca",
            options: [
              {
                text: "Teeth should be brushed twice a day",
                optionId: "Q139-a",
                isCorrect: false,
                userSelected: true,
                hint: "",
              },
              {
                text: "Teeth should be brushed for 20 mins ",
                optionId: "Q139-b",
                isCorrect: false,
                userSelected: false,
                hint: "",
              },
              {
                text: " Toothbrush should be changed once in 3 months or when the bristles fray away ",
                isCorrect: false,
                optionId: "Q139-c",
                userSelected: false,
                hint: "",
              },
              {
                text: "Teeth should be brushed using the right technique",
                isCorrect: false,
                optionId: "Q139-d",
                userSelected: false,
                hint: "",
              },
            ],
            multiSelection: false,
          },
          {
            questionId: "Q117",
            question:
              '<p>8.&nbsp;<b id="docs-internal-guid-815fa85e-7fff-a238-324c-5a194e5edf3e">Which condition of the oral cavity is caused due to Tobacco usage by the person?</b></p>\n\n<p><meta charset="utf-8" /></p>\n',
            questionType: "mcq-sca",
            options: [
              {
                text: " Cleft lip/palate",
                optionId: "Q117-a",
                isCorrect: false,
                userSelected: true,
                hint: "",
              },
              {
                text: "Irregular arrangement of teeth",
                optionId: "Q117-b",
                isCorrect: false,
                userSelected: false,
                hint: "",
              },
              {
                text: " Oral Cancer",
                isCorrect: false,
                optionId: "Q117-c",
                userSelected: false,
                hint: "",
              },
              {
                text: "Tobacco is safe to use",
                isCorrect: false,
                optionId: "Q117-d",
                userSelected: false,
                hint: "",
              },
            ],
            multiSelection: false,
          },
        ],
        identifier: "do_113669596007481344123",
        title: "Proficinecy 1",
        artifactUrl:
          "https://sunbirdcontent-stage.s3-ap-south-1.amazonaws.com/content/do_113669596007481344123/artifact/do_113669596007481344123_1668651917401_quiz.json",
        contentId: "do_113669596007481344123",
        courseId: "do_113669595273363456121",
        batchId: "0136697466508410881",
        userId: null,
      })
      .expect(200);
    expect(response.body).to.be.an("object");
  }).timeout(10000);
});
