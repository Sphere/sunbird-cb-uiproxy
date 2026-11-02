const assert = require("assert");
const express = require("express");
const fileUpload = require("express-fileupload");
const http = require("http");
const request = require("supertest");

/**
 * FRAC Studio proxy (src/protectedApi_v8/fracStudio/).
 *
 * The router only forwards, so the suite asserts what it forwards: the path mapped onto the
 * service's /v1 API, the owner header taken from the session (and never from the caller), an
 * upload rebuilt as multipart, a download streamed back with its headers, and the service's
 * own status codes relayed untouched. A mock service records what arrived.
 */
describe("FRAC Studio proxy", function () {
  let server;
  let upstream;
  let hits;

  const api = () => request(server);
  const lastHit = () => hits[hits.length - 1];
  const BASE = "/protected/v8/fracStudio";

  before(function (done) {
    hits = [];

    upstream = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk.toString("latin1")));
      req.on("end", () => {
        hits.push({ body, headers: req.headers, method: req.method, url: req.url });
        const path = req.url.split("?")[0];

        if (path === "/v1/fracs/f1/export.xlsx") {
          res.writeHead(200, {
            "content-disposition": "attachment; filename*=UTF-8''ANM%20competencies%20-%20Bihar.xlsx",
            "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
          return res.end("xlsx-bytes");
        }
        if (path === "/v1/fracs/missing") {
          res.writeHead(404, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: "FRAC not found" }));
        }
        if (path === "/v1/frac-reviews" && req.method === "POST") {
          res.writeHead(202, { "content-type": "application/json" });
          return res.end(JSON.stringify({ jobId: "job-1", reviewId: "rev-1", warnings: [] }));
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    upstream.listen(0, "127.0.0.1", () => {
      // ts-node may already be registered by another suite in the same mocha run
      if (!require.extensions[".ts"]) {
        require("ts-node").register({
          compilerOptions: { esModuleInterop: true, module: "commonjs", strict: false, target: "ES2019" },
          transpileOnly: true,
        });
      }
      const { CONSTANTS } = require("../src/utils/env");
      const { fracStudioApi } = require("../src/protectedApi_v8/fracStudio/fracStudio");
      // The router reads the base per request, so this works even if env.ts loaded earlier
      CONSTANTS.FRAC_STUDIO_API_BASE = "http://127.0.0.1:" + upstream.address().port;

      const app = express();
      app.use(express.json());
      app.use(express.urlencoded({ extended: false }));
      app.use(fileUpload());
      // Stands in for Keycloak, which populates both of these on a real request.
      app.use((req, _res, next) => {
        req.session = { userId: "uuid-42" };
        req.kauth = { grant: { access_token: { content: { name: "Asha Kumari", sub: "f:abc:uuid-42" }, token: "kc-token" } } };
        next();
      });
      app.use(BASE, fracStudioApi);
      server = app.listen(0, "127.0.0.1", done);
    });
  });

  after(function (done) {
    server.close(() => upstream.close(done));
  });

  it("maps the portal path onto the service's /v1 API, query string included", async function () {
    const res = await api().get(BASE + "/fracs?limit=5");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(lastHit().method, "GET");
    assert.strictEqual(lastHit().url, "/v1/fracs?limit=5");
  });

  it("sends the owner from the session and overwrites one the caller sent", async function () {
    await api().get(BASE + "/jobs/job-1").set("x-aastrika-creator", "someone-else").set("wid", "someone-else");
    assert.strictEqual(lastHit().headers["x-aastrika-creator"], "uuid-42");
    assert.strictEqual(lastHit().headers["x-authenticated-user-token"], "kc-token");
  });

  it("forwards a JSON body for PATCH", async function () {
    await api().patch(BASE + "/fracs/f1").send({ roles: [{ code: "R1", title: "Conduct VHSND sessions" }] });
    assert.strictEqual(lastHit().method, "PATCH");
    assert.strictEqual(lastHit().url, "/v1/fracs/f1");
    assert.deepStrictEqual(JSON.parse(lastHit().body), { roles: [{ code: "R1", title: "Conduct VHSND sessions" }] });
  });

  it("rebuilds a workbook upload as multipart with the file and context fields", async function () {
    const res = await api()
      .post(BASE + "/frac-reviews")
      .field("cadre", "GNM")
      .field("notes", "to be adapted for Bihar")
      .attach("file", Buffer.from("PK-fake-xlsx"), "GNM dictionary.xlsx");

    assert.strictEqual(res.status, 202);
    assert.strictEqual(res.body.reviewId, "rev-1");
    assert.strictEqual(lastHit().url, "/v1/frac-reviews");
    assert.ok(/^multipart\/form-data; boundary=/.test(lastHit().headers["content-type"]));
    assert.ok(/name="file"; filename="GNM dictionary.xlsx"/.test(lastHit().body), "file must keep its field and name");
    assert.ok(/PK-fake-xlsx/.test(lastHit().body), "file bytes must survive the rebuild");
    assert.ok(/name="cadre"[\s\S]*GNM/.test(lastHit().body), "context fields must be forwarded");
    assert.strictEqual(lastHit().headers["x-aastrika-creator"], "uuid-42");
  });

  it("streams a download back with its filename and type", async function () {
    const res = await api().get(BASE + "/fracs/f1/export.xlsx").buffer(true);
    assert.strictEqual(res.status, 200);
    assert.ok(/spreadsheetml/.test(res.headers["content-type"]));
    assert.ok(/ANM%20competencies/.test(res.headers["content-disposition"]));
  });

  it("relays the service's own error status and body", async function () {
    const res = await api().get(BASE + "/fracs/missing");
    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(res.body, { error: "FRAC not found" });
  });
});
