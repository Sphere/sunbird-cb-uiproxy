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
  // Package files are served outside the session (see courseReviewPublicApi).
  const PUB = "/public/v8/courseReview";

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
        if (path.indexOf("/course-review/v1/package/") === 0) {
          if (path.endsWith("/clip.mp4")) {
            if (req.headers.range === "bytes=999-") {
              res.writeHead(416, { "content-range": "bytes */10", "accept-ranges": "bytes" });
              return res.end();
            }
            res.writeHead(206, { "content-type": "video/mp4", "content-range": "bytes 2-4/10", "content-length": "3", "accept-ranges": "bytes" });
            return res.end("abc");
          }
          if (path.endsWith("/missing.js")) {
            return json(404, { error: { code: "NOT_FOUND", message: "This file is not in the package." } });
          }
          // A weaker policy than the proxy's own: the proxy must replace it.
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src *", "x-content-type-options": "nosniff" });
          return res.end("<h1>पैकेज</h1>");
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
      process.env.COURSE_REVIEW_SECRET = "test-caller-secret-0123456789abcdef";

      require("ts-node").register({
        compilerOptions: { esModuleInterop: true, module: "commonjs", strict: false, target: "ES2019" },
        transpileOnly: true,
      });
      const { courseReviewApi, courseReviewPublicApi } = require("../src/protectedApi_v8/courseReview/courseReview");

      const app = express();
      app.use(express.json());
      // Mounted before the Keycloak stand-in, as in server.ts: no session reaches it.
      app.use(PUB, courseReviewPublicApi);
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

    it("proves the call comes from this proxy with the caller secret, whatever the browser sent", async function () {
      await api().get(BASE + "/checklist").set("x-course-review-secret", "forged");
      assert.strictEqual(lastHit().headers["x-course-review-secret"], "test-caller-secret-0123456789abcdef");
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

    it("streams a package file for the preview, always in the sandbox", async function () {
      const res = await api().get(PUB + "/package/22222222-2222-4222-8222-222222222222/do_html1/1790000000.sig/pages/one%20two.html");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastHit().url, "/course-review/v1/package/22222222-2222-4222-8222-222222222222/do_html1/1790000000.sig/pages/one%20two.html");
      // The signed token authorises it; no user is passed on, the service's caller secret is.
      assert.strictEqual(lastHit().headers["x-aastrika-user-id"], undefined);
      assert.strictEqual(lastHit().headers["x-authenticated-user-token"], undefined);
      assert.ok(/no-transform/.test(res.headers["cache-control"]), "never re-compressed, so ranges stay intact");
      assert.ok(/text\/html/.test(res.headers["content-type"]));
      assert.ok(/^sandbox allow-scripts/.test(res.headers["content-security-policy"]), "the package never gets the portal's origin");
      assert.ok(res.headers["content-security-policy"].indexOf("allow-same-origin") === -1);
      assert.strictEqual(res.headers["x-content-type-options"], "nosniff");
      assert.ok(res.text.indexOf("पैकेज") !== -1, "the body must survive byte for byte");
    });

    it("passes a video's byte range through, so the report can open it at a moment", async function () {
      const res = await api().get(PUB + "/package/r/c/t/assets/clip.mp4").set("Range", "bytes=2-4");
      assert.strictEqual(res.status, 206);
      assert.strictEqual(lastHit().headers.range, "bytes=2-4");
      assert.strictEqual(res.headers["content-range"], "bytes 2-4/10");
      assert.strictEqual(res.headers["accept-ranges"], "bytes");
      const past = await api().get(PUB + "/package/r/c/t/assets/clip.mp4").set("Range", "bytes=999-");
      assert.strictEqual(past.status, 416);
      assert.strictEqual(past.headers["content-range"], "bytes */10");
      await api().get(PUB + "/package/r/c/t/assets/clip.mp4").set("Range", "items=1-2");
      assert.strictEqual(lastHit().headers.range, undefined, "only a plain byte range is passed on");
    });

    it("passes only the admin report's own filters on, with the user, and never caches the answer", async function () {
      const res = await api()
        .get(BASE + "/v1/admin/reviews")
        .query({ from: "2026-11-01", to: "2026-11-13", userId: "", source: "upload", q: "BP", limit: "50", offset: "0", evil: "1" });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers["cache-control"], "no-store");
      const hit = lastHit();
      assert.ok(hit.url.indexOf("/course-review/v1/admin/reviews?") === 0);
      const sent = new URLSearchParams(hit.url.split("?")[1]);
      assert.deepStrictEqual(Object.fromEntries(sent), { from: "2026-11-01", to: "2026-11-13", source: "upload", q: "BP", limit: "50", offset: "0" });
      assert.strictEqual(hit.headers["x-aastrika-user-id"], "uuid-42");
      const summary = await api().get(BASE + "/admin/summary").query({ from: "2026-11-01", limit: "9" });
      assert.strictEqual(summary.status, 200);
      assert.strictEqual(lastHit().url, "/course-review/v1/admin/summary?from=2026-11-01");
    });

    it("refuses package paths that would step out of the package", async function () {
      const before = hits.length;
      const res = await api().get(PUB + "/package/r/c/t/a/%2E%2E/%2E%2E/reviews/x");
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, "BAD_PATH");
      assert.strictEqual(hits.length, before, "nothing may reach the service");
    });

    it("relays a missing package file as JSON", async function () {
      const res = await api().get(PUB + "/package/r/c/t/missing.js");
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.error.code, "NOT_FOUND");
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

    it("answers 502, in the service's error shape, when the service cannot be reached", async function () {
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
        assert.strictEqual(res.status, 502);
        assert.strictEqual(res.body.error.code, "UPSTREAM_UNAVAILABLE");
        assert.match(res.body.error.message, /could not be reached/);
      } finally {
        axios.get = original;
      }
    });
  });

  describe("failures with no answer from the service", function () {
    let handleUpstreamError;
    before(function () {
      ({ handleUpstreamError } = require("../src/protectedApi_v8/courseReview/helpers"));
    });
    const fakeRes = () => {
      const out = { statusCode: 0, body: null };
      out.status = (code) => { out.statusCode = code; return out; };
      out.json = (body) => { out.body = body; return out; };
      return out;
    };

    it("says the service took too long (504) when the call timed out", function () {
      const res = fakeRes();
      handleUpstreamError(res, { code: "ECONNABORTED", message: "timeout of 30000ms exceeded" }, "reviews/read");
      assert.strictEqual(res.statusCode, 504);
      assert.deepStrictEqual(res.body.error.code, "UPSTREAM_TIMEOUT");
    });

    it("keeps any other failure a 500, in the same shape", function () {
      const res = fakeRes();
      handleUpstreamError(res, new Error("boom"), "reviews/read");
      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(res.body.error.code, "INTERNAL");
    });

    it("passes the service's own answer through unchanged", function () {
      const res = fakeRes();
      handleUpstreamError(res, { response: { status: 429, data: { error: { code: "DAILY_LIMIT", message: "limit" } } } }, "reviews/create");
      assert.strictEqual(res.statusCode, 429);
      assert.deepStrictEqual(res.body, { error: { code: "DAILY_LIMIT", message: "limit" } });
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
      "/admin/reviews",
      "/admin/summary",
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
