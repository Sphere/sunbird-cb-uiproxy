const assert = require("assert");
const express = require("express");
const http = require("http");
const request = require("supertest");
const { pathToRegexp } = require("path-to-regexp");

/**
 * AI course review proxy (src/protectedApi_v8/courseReview/).
 *
 * The router only forwards, so the suite asserts what it forwards: the upstream path and verb,
 * an identity the caller cannot spoof, no roles header, status codes and error bodies that
 * survive the round trip, and no path beyond the named ones. A mock service records each call,
 * so nothing here reaches a paid model.
 */
describe("Course review proxy", function () {
  let server;
  let upstream;
  let hits;
  let session;

  const api = () => request(server);
  const lastHit = () => hits[hits.length - 1];
  const BASE = "/protected/v8/courseReview";

  before(function (done) {
    hits = [];

    upstream = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk.toString()));
      req.on("end", () => {
        hits.push({ body, headers: req.headers, method: req.method, url: req.url });
        const path = req.url.split("?")[0];
        const json = (status, payload) => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify(payload));
        };

        if (path === "/course-review/v1/reviews" && req.method === "POST") {
          const sent = JSON.parse(body || "{}");
          if (sent.courseId === "do_limit") {
            return json(429, { error: { code: "USER_LIMIT", message: "You already have 2 reviews running" } });
          }
          if (sent.courseId === "do_running") {
            return json(200, { created: false, reviewId: "11111111-1111-4111-8111-111111111111" });
          }
          return json(202, { created: true, reviewId: "22222222-2222-4222-8222-222222222222" });
        }
        if (path === "/course-review/v1/courses/do_forbidden/preview") {
          return json(403, { error: { code: "FORBIDDEN", message: "You cannot review this course" } });
        }
        if (path.endsWith("/report.md")) {
          if (path.indexOf("/missing/") !== -1) {
            return json(404, { error: { code: "NOT_FOUND", message: "Review not found" } });
          }
          res.writeHead(200, {
            "content-disposition": 'attachment; filename="ai-review-course.md"',
            "content-type": "text/markdown; charset=utf-8",
          });
          return res.end("# AI review\n\nसमीक्षा");
        }
        return json(200, { ok: true });
      });
    });

    upstream.listen(0, "127.0.0.1", () => {
      // Must be set before the router is loaded: constants.ts reads it at module scope.
      process.env.COURSE_REVIEW_API_BASE = "http://127.0.0.1:" + upstream.address().port + "/course-review";
      process.env.SB_API_KEY = "test-gateway-key";

      require("ts-node").register({
        compilerOptions: { esModuleInterop: true, module: "commonjs", strict: false, target: "ES2019" },
        transpileOnly: true,
      });
      const { courseReviewApi } = require("../src/protectedApi_v8/courseReview/courseReview");

      const app = express();
      app.use(express.json());
      // Stands in for Keycloak. `userRoles` mirrors permissionHelper, which gives everyone the
      // same fixed list, including admin roles.
      app.use((req, _res, next) => {
        req.session = session;
        req.kauth = { grant: { access_token: {
          content: { name: "Asha Kumari", sub: "f:fed-1:uuid-42" },
          token: "kc-token",
        } } };
        next();
      });
      app.use(BASE, courseReviewApi);
      server = app.listen(0, "127.0.0.1", done);
    });
  });

  beforeEach(function () {
    session = { userId: "uuid-42", userRoles: ["CONTENT_CREATOR", "MDO_ADMIN", "SPV_ADMIN", "PUBLIC"] };
  });

  after(function (done) {
    server.close(() => upstream.close(done));
  });

  describe("identity", function () {
    it("sends the gateway key, the user token, the user id and the name", async function () {
      await api().get(BASE + "/checklist");

      const headers = lastHit().headers;
      assert.strictEqual(lastHit().url, "/course-review/v1/checklist");
      assert.strictEqual(headers.authorization, "test-gateway-key");
      assert.strictEqual(headers["x-authenticated-user-token"], "kc-token");
      assert.strictEqual(headers["x-aastrika-user-id"], "uuid-42");
      assert.strictEqual(headers["x-aastrika-user-name"], "Asha Kumari");
    });

    it("overwrites identity headers the caller tried to set", async function () {
      await api()
        .post(BASE + "/reviews")
        .set("x-aastrika-user-id", "somebody-else")
        .set("x-aastrika-user-roles", "admin")
        .send({ courseId: "do_1" });

      assert.strictEqual(lastHit().headers["x-aastrika-user-id"], "uuid-42",
        "the user id decides course access, so it must come from the session");
      assert.strictEqual(lastHit().headers["x-aastrika-user-roles"], undefined,
        "a caller must not be able to claim a role");
    });

    it("never forwards session.userRoles, which every user gets in full", async function () {
      await api().get(BASE + "/checklist");
      assert.strictEqual(lastHit().headers["x-aastrika-user-roles"], undefined);
    });

    it("falls back to the token subject's last part when the session has no user id", async function () {
      session = {};
      await api().get(BASE + "/checklist");
      assert.strictEqual(lastHit().headers["x-aastrika-user-id"], "uuid-42");
    });

    it("omits the user id rather than sending an empty one", async function () {
      session = {};
      const app = express();
      const { courseReviewApi } = require("../src/protectedApi_v8/courseReview/courseReview");
      app.use((req, _res, next) => { req.session = {}; next(); });
      app.use(BASE, courseReviewApi);

      await request(app).get(BASE + "/checklist");
      assert.strictEqual(lastHit().headers["x-aastrika-user-id"], undefined,
        "the service then answers 401 itself");
    });
  });

  describe("routes", function () {
    it("starts a review and keeps the 202", async function () {
      const res = await api()
        .post(BASE + "/reviews")
        .send({ courseId: "do_1", options: { addie: true, domain: true } });

      assert.strictEqual(res.status, 202);
      assert.strictEqual(res.body.reviewId, "22222222-2222-4222-8222-222222222222");
      assert.strictEqual(lastHit().method, "POST");
      assert.strictEqual(lastHit().url, "/course-review/v1/reviews");
      assert.deepStrictEqual(JSON.parse(lastHit().body), { courseId: "do_1", options: { addie: true, domain: true } });
      assert.strictEqual(lastHit().headers["content-type"], "application/json");
    });

    it("reads the FRAC role context, forwarding the settings", async function () {
      await api()
        .post(BASE + "/courses/do_1/frac")
        .send({ options: { domainStyle: "frac", positionCode: "ANM" } });
      assert.strictEqual(lastHit().method, "POST");
      assert.strictEqual(lastHit().url, "/course-review/v1/courses/do_1/frac");
      assert.deepStrictEqual(JSON.parse(lastHit().body), { options: { domainStyle: "frac", positionCode: "ANM" } });
    });

    it("measures a course's resources", async function () {
      await api().get(BASE + "/courses/do_1/measure");
      assert.strictEqual(lastHit().method, "GET");
      assert.strictEqual(lastHit().url, "/course-review/v1/courses/do_1/measure");
    });

    it("asks which unchanged resources would be reused, forwarding the settings", async function () {
      await api()
        .post(BASE + "/courses/do_1/reuse")
        .send({ options: { addie: true, domain: false } });

      assert.strictEqual(lastHit().method, "POST");
      assert.strictEqual(lastHit().url, "/course-review/v1/courses/do_1/reuse");
      assert.deepStrictEqual(JSON.parse(lastHit().body), { options: { addie: true, domain: false } });
    });

    it("keeps the 200 for joining a review that is already running", async function () {
      const res = await api().post(BASE + "/reviews").send({ courseId: "do_running" });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.created, false);
    });

    it("relays the service's 429 and message", async function () {
      const res = await api().post(BASE + "/reviews").send({ courseId: "do_limit" });
      assert.strictEqual(res.status, 429);
      assert.strictEqual(res.body.error.code, "USER_LIMIT");
    });

    it("relays a 403 on a course the user cannot review", async function () {
      const res = await api().get(BASE + "/courses/do_forbidden/preview");
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error.code, "FORBIDDEN");
    });

    it("reads the preview, the status and the history", async function () {
      await api().get(BASE + "/courses/do_1/preview");
      assert.strictEqual(lastHit().url, "/course-review/v1/courses/do_1/preview");

      const status = await api().get(BASE + "/reviews/22222222-2222-4222-8222-222222222222");
      assert.strictEqual(lastHit().url, "/course-review/v1/reviews/22222222-2222-4222-8222-222222222222");
      assert.strictEqual(status.headers["cache-control"], "no-store", "a poll must not be cached");

      await api().get(BASE + "/reviews?courseId=do_1&userId=someone");
      assert.strictEqual(lastHit().url, "/course-review/v1/reviews?courseId=do_1",
        "only courseId is forwarded");
    });

    it("cancels with DELETE", async function () {
      await api().delete(BASE + "/reviews/22222222-2222-4222-8222-222222222222");
      assert.strictEqual(lastHit().method, "DELETE");
      assert.strictEqual(lastHit().url, "/course-review/v1/reviews/22222222-2222-4222-8222-222222222222");
    });

    it("downloads the report with its name and type, in any script", async function () {
      const res = await api().get(BASE + "/reviews/22222222-2222-4222-8222-222222222222/report.md");

      assert.strictEqual(res.status, 200);
      assert.ok(/attachment; filename="ai-review-course\.md"/.test(res.headers["content-disposition"]));
      assert.ok(/text\/markdown/.test(res.headers["content-type"]));
      assert.ok(res.text.indexOf("समीक्षा") !== -1, "the body must survive byte for byte");
    });

    it("relays a report error as JSON", async function () {
      const res = await api().get(BASE + "/reviews/missing/report.md");
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.error.code, "NOT_FOUND");
    });

    it("accepts the service's own /v1 shape", async function () {
      await api().get(BASE + "/v1/courses/do_1/preview");
      assert.strictEqual(lastHit().url, "/course-review/v1/courses/do_1/preview");
    });

    it("percent-encodes ids so they cannot address another resource", async function () {
      await api().get(BASE + "/courses/" + encodeURIComponent("do_1?x=1") + "/preview");
      assert.strictEqual(lastHit().url, "/course-review/v1/courses/do_1%3Fx%3D1/preview");
    });

    it("signs uploads, forwarding only the file list, and never lets the answer be cached", async function () {
      const files = [{ name: "BP.mp4", size: 1000, kind: "video" }];
      const res = await api().post(BASE + "/uploads").send({ files: files });
      assert.strictEqual(lastHit().method, "POST");
      assert.strictEqual(lastHit().url, "/course-review/v1/uploads");
      assert.deepStrictEqual(JSON.parse(lastHit().body), { files: files });
      assert.strictEqual(lastHit().headers["x-aastrika-user-id"], session.userId);
      assert.strictEqual(res.headers["cache-control"], "no-store", "a signed upload is a credential");
    });

    it("reads the file review setup, checks files, runs the role check, starts and lists file reviews", async function () {
      await api().get(BASE + "/uploads/context");
      assert.strictEqual(lastHit().url, "/course-review/v1/uploads/context");

      await api().post(BASE + "/uploads/measure").send({ uploadIds: ["0c1b2a3d-1111-4222-8333-444455556666"] });
      assert.strictEqual(lastHit().url, "/course-review/v1/uploads/measure");
      assert.deepStrictEqual(JSON.parse(lastHit().body), { uploadIds: ["0c1b2a3d-1111-4222-8333-444455556666"] });

      await api().post(BASE + "/uploads/frac").send({ options: { domainStyle: "frac" } });
      assert.strictEqual(lastHit().url, "/course-review/v1/uploads/frac");

      await api().post(BASE + "/uploads/reviews").send({ title: "BP", uploadIds: ["0c1b2a3d-1111-4222-8333-444455556666"], options: {} });
      assert.strictEqual(lastHit().method, "POST");
      assert.strictEqual(lastHit().url, "/course-review/v1/uploads/reviews");

      const list = await api().get(BASE + "/uploads/reviews?userId=someone-else");
      assert.strictEqual(lastHit().method, "GET");
      assert.strictEqual(lastHit().url, "/course-review/v1/uploads/reviews", "no query is forwarded: the service lists the caller's own");
      assert.strictEqual(list.headers["cache-control"], "no-store");
    });

    it("switches an uploaded sheet between quiz and assessment, without the file", async function () {
      await api().patch(BASE + "/uploads/0c1b2a3d-1111-4222-8333-444455556666").send({ kind: "assessment" });
      assert.strictEqual(lastHit().method, "PATCH");
      assert.strictEqual(lastHit().url, "/course-review/v1/uploads/0c1b2a3d-1111-4222-8333-444455556666");
      assert.deepStrictEqual(JSON.parse(lastHit().body), { kind: "assessment" });

      await api().patch(BASE + "/uploads/" + encodeURIComponent("../reviews/x")).send({ kind: "quiz" });
      assert.strictEqual(lastHit().url, "/course-review/v1/uploads/..%2Freviews%2Fx", "the id cannot address another resource");
    });

    it("forwards nothing outside the named routes", async function () {
      const before = hits.length;
      const res = await api().post(BASE + "/admin/reset").send({});
      assert.strictEqual(res.status, 404);
      assert.strictEqual(hits.length, before, "an unknown path must not reach the service");
    });

    it("answers 500 when the service cannot be reached", async function () {
      // A closed port: the request fails before any response exists.
      const closed = http.createServer();
      await new Promise((resolve) => closed.listen(0, "127.0.0.1", resolve));
      const port = closed.address().port;
      await new Promise((resolve) => closed.close(resolve));

      const axios = require("axios");
      const original = axios.get;
      axios.get = (url, config) => original.call(axios, url.replace(/^http:\/\/127\.0\.0\.1:\d+/, "http://127.0.0.1:" + port), config);
      try {
        const res = await api().get(BASE + "/checklist");
        assert.strictEqual(res.status, 500);
        assert.strictEqual(res.body.status, "error");
      } finally {
        axios.get = original;
      }
    });
  });

  describe("whitelist", function () {
    let API_LIST;

    // Loaded in a hook, not while mocha collects tests: ts-node is registered by the outer
    // before() hook, and a .ts file required any earlier cannot be found.
    before(function () {
      ({ API_LIST } = require("../src/utils/whitelistApis"));
    });

    /** The same resolution apiWhiteList.ts does: first matching pattern, then its rule. */
    const ruleFor = (path) => {
      const pattern = API_LIST.URL_PATTERN.find((url) => pathToRegexp(url).test(path)) || path;
      return API_LIST.URL[pattern];
    };

    [
      "/checklist",
      "/courses/do_1/preview",
      "/courses/do_1/reuse",
      "/courses/do_1/measure",
      "/courses/do_1/frac",
      "/reviews",
      "/reviews/22222222-2222-4222-8222-222222222222",
      "/reviews/22222222-2222-4222-8222-222222222222/report.md",
      "/uploads",
      "/uploads/context",
      "/uploads/measure",
      "/uploads/frac",
      "/uploads/reviews",
      "/uploads/0c1b2a3d-1111-4222-8333-444455556666",
    ].forEach((tail) => {
      it("allows " + tail + " in both shapes", function () {
        assert.ok(ruleFor(BASE + tail), BASE + tail);
        assert.ok(ruleFor(BASE + "/v1" + tail), BASE + "/v1" + tail);
      });
    });

    it("does not allow an unknown course review path", function () {
      assert.strictEqual(ruleFor(BASE + "/admin/reset"), undefined);
      assert.strictEqual(ruleFor(BASE + "/uploads/local/token"), undefined, "the service's laptop-only upload path is never proxied");
    });
  });
});
