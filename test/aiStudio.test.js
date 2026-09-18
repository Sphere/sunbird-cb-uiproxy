const assert = require("assert");
const express = require("express");
const fileUpload = require("express-fileupload");
const http = require("http");
const request = require("supertest");

/**
 * AI Studio proxy (src/protectedApi_v8/aiStudio/).
 *
 * The routers only forward, so what is worth asserting is what they forward: the right
 * upstream path and method, the identity headers, a creator that cannot be spoofed, status
 * codes that survive the round trip, and a wildcard that carries an endpoint this proxy has
 * never heard of.
 *
 * A mock AI service stands in for the real one and records what arrived, so the suite runs
 * offline and does not spend money on a service whose whole purpose is to bill for renders.
 */
describe("AI Studio proxy", function () {
  let app;
  let server;
  let upstream;
  let hits;

  /**
   * supertest spins up a fresh server on an ephemeral port for every `api()` call.
   * Across ~55 requests a run, the OS recycles those ports, and a pooled keep-alive socket
   * left over from a dead server can be handed out for a live one — which surfaces as
   * `Parse Error: Expected HTTP/` or a response landing on the wrong request. Binding once
   * and addressing that one server removes the churn entirely.
   */
  const api = () => request(server);

  /** What the mock upstream received on the most recent call. */
  const lastHit = () => hits[hits.length - 1];

  before(function (done) {
    hits = [];

    upstream = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk.toString()));
      req.on("end", () => {
        hits.push({ body, headers: req.headers, method: req.method, url: req.url });
        const path = req.url.split("?")[0];

        // A route that hands back a signed storage URL rather than bytes.
        if (path === "/v1/studio/download-video/job-1" || path === "/v1/quiz/export/quiz-1"
          || path === "/v1/studio/future-download") {
          res.writeHead(302, { location: "https://storage.example/signed/abc?exp=1" });
          return res.end();
        }
        // A route that hands back the bytes themselves, as local storage does.
        if (path === "/v1/artifacts/do_123/notes.txt" && req.method === "GET") {
          res.writeHead(200, {
            "content-disposition": 'attachment; filename="notes.txt"',
            "content-type": "text/plain",
          });
          return res.end("the actual bytes");
        }
        // The AI service's own required-field rules. The proxy does not restate them, so these
        // are what a caller actually gets back when a field is missing.
        if (path === "/v1/studio/generate-plan" && !JSON.parse(body || "{}").docText) {
          res.writeHead(400, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: { code: "DOC_TEXT_REQUIRED" } }));
        }
        if (path === "/v1/quiz/generate") {
          const sent = JSON.parse(body || "{}");
          const hasMaterial = (sent.sourceIds || []).length || sent.docText || sent.sourceJobId;
          if (!hasMaterial) {
            res.writeHead(400, { "content-type": "application/json" });
            return res.end(JSON.stringify({ error: { code: "NO_MATERIAL" }, debugBody: body }));
          }
        }
        // The deliberate 422 the quiz builder answers when the material is too thin.
        if (path === "/v1/quiz/generate" && JSON.parse(body || "{}").numQuestions === 999) {
          res.writeHead(422, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: { code: "THIN_MATERIAL", message: "supports 6" } }));
        }
        // A body the upstream compressed: axios decompresses it before we see it.
        if (path === "/v1/artifacts/do_123/big.txt") {
          const zlib = require("zlib");
          const payload = zlib.gzipSync(Buffer.from("compressed body contents"));
          res.writeHead(200, {
            "content-encoding": "gzip",
            "content-length": String(payload.length),
            "content-type": "text/plain",
          });
          return res.end(payload);
        }
        // A partial-content answer, as a video player asks for while seeking.
        if (path === "/v1/artifacts/do_123/clip.mp4") {
          res.writeHead(206, {
            "accept-ranges": "bytes",
            "content-range": "bytes 0-3/100",
            "content-type": "video/mp4",
          });
          return res.end("abcd");
        }
        // Headers and a first chunk land, then the connection dies before the body is
        // complete. The delay matters: destroying the socket in the same tick would fail the
        // request before any response existed, which is a different case entirely.
        if (path === "/v1/artifacts/do_123/truncated.bin") {
          // Connection: close matters. Without it the client keeps this socket alive and
          // returns it to its pool, and since we are about to destroy it, a LATER test that
          // reuses the pooled socket fails with ECONNRESET — a flake in an unrelated test
          // caused entirely by this one. Telling the client not to pool it keeps the damage
          // where it belongs.
          res.writeHead(200, {
            "connection": "close",
            "content-type": "application/octet-stream",
          });
          res.write("partial");
          return setTimeout(() => res.socket.destroy(), 20);
        }
        if (path === "/v1/quiz/deep/missing/path") {
          res.writeHead(404, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: { code: "NOT_FOUND" } }));
        }

        const status = path === "/v1/studio/generate-plan" || path === "/v1/quiz/generate" ? 201
          : path.indexOf("/v1/studio/generate-video/") === 0 ? 202
          : path === "/v1/artifacts/upload" ? 201
          : 200;
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify({ jobId: "job-1", ok: true, queuePosition: 2 }));
      });
    });

    upstream.listen(0, "127.0.0.1", () => {
      // Must be set before the router is loaded: constants.ts reads it at module scope.
      process.env.AI_STUDIO_API_BASE = "http://127.0.0.1:" + upstream.address().port;
      process.env.SB_API_KEY = "test-gateway-key";

      require("ts-node").register({
        compilerOptions: {
          esModuleInterop: true,
          module: "commonjs",
          strict: false,
          target: "ES2019",
        },
        transpileOnly: true,
      });
      const { aiStudioApi } = require("../src/protectedApi_v8/aiStudio/aiStudio");

      app = express();
      app.use(express.json());
      app.use(express.urlencoded({ extended: false }));
      app.use(fileUpload());
      // Stands in for Keycloak, which populates both of these on a real request.
      app.use((req, _res, next) => {
        req.session = { userId: "uuid-42", userName: "asha.kumari" };
        req.kauth = { grant: { access_token: {
          content: { family_name: "Kumari", given_name: "Asha", name: "Asha Kumari" },
          token: "kc-token",
        } } };
        next();
      });
      app.use("/protected/v8/aiStudio", aiStudioApi);
      server = app.listen(0, "127.0.0.1", done);
    });
  });

  after(function (done) {
    server.close(() => upstream.close(done));
  });

  const BASE = "/protected/v8/aiStudio";

  describe("AI Studio — document to video", function () {
    it("forwards an upload as multipart, with the file and the kind intact", async function () {
      const res = await api()
        .post(BASE + "/studio/upload")
        .field("kind", "document")
        .attach("file", Buffer.from("hello pdf"), "ppc.pdf");

      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastHit().url, "/v1/studio/upload");
      assert.ok(/ppc\.pdf/.test(lastHit().body), "filename must survive the rebuild");
      assert.ok(/document/.test(lastHit().body), "kind must be forwarded");
    });

    it("carries the gateway key and the user token, as every Kong caller here does", async function () {
      await api().get(BASE + "/studio/list-voices");

      const headers = lastHit().headers;
      assert.strictEqual(lastHit().url, "/v1/studio/list-voices");
      assert.strictEqual(headers.authorization, "test-gateway-key");
      assert.strictEqual(headers["x-authenticated-user-token"], "kc-token");
    });

    it("never sends x-consumer-username, which is Kong's to write", async function () {
      await api().get(BASE + "/studio/list-voices");

      assert.strictEqual(
        lastHit().headers["x-consumer-username"],
        undefined,
        "that header is the verified consumer identity; a claim must not be put into it"
      );
    });

    it("names the creator on read endpoints too, not only the creating ones", async function () {
      await api().get(BASE + "/studio/list-videos");
      assert.strictEqual(lastHit().headers["x-aastrika-creator"], "Asha Kumari");

      await api().get(BASE + "/usage/get-report");
      assert.strictEqual(lastHit().headers["x-aastrika-creator"], "Asha Kumari");
    });

    it("names the creator in x-aastrika-creator, taken from the Keycloak display name", async function () {
      const res = await api()
        .post(BASE + "/studio/generate-plan")
        .send({ docText: "PPH is a leading cause", userPrompt: "a training video" });

      assert.strictEqual(res.status, 201, "the upstream 201 must survive");
      assert.strictEqual(lastHit().headers["x-aastrika-creator"], "Asha Kumari");
    });

    it("overwrites an x-aastrika-creator the caller tried to set", async function () {
      await api()
        .post(BASE + "/studio/generate-plan")
        .set("x-aastrika-creator", "somebody-else")
        .send({ docText: "PPH is a leading cause", userPrompt: "a training video" });

      assert.strictEqual(lastHit().headers["x-aastrika-creator"], "Asha Kumari",
        "spend must not be recordable against another user");
    });

    it("leaves the request body exactly as the caller sent it", async function () {
      await api()
        .post(BASE + "/studio/generate-plan")
        .send({ docText: "PPH is a leading cause", language: "hi", userPrompt: "a training video" });

      const forwarded = JSON.parse(lastHit().body);
      assert.deepStrictEqual(forwarded, {
        docText: "PPH is a leading cause",
        language: "hi",
        userPrompt: "a training video",
      }, "the proxy must not add, drop or rewrite any field");
    });

    it("lets the AI service decide about a plan with no source text", async function () {
      const before = hits.length;
      const res = await api().post(BASE + "/studio/generate-plan").send({ userPrompt: "x" });

      assert.strictEqual(hits.length, before + 1, "the request must reach upstream, not be refused here");
      assert.strictEqual(res.status, 400, "and upstream's rejection must be relayed");
      assert.strictEqual(res.body.error.code, "DOC_TEXT_REQUIRED",
        "the caller sees the service's own message, not one invented by the proxy");
    });

    it("forwards a videoedit plan, which carries segments instead of docText", async function () {
      const res = await api()
        .post(BASE + "/studio/generate-plan")
        .send({ docText: "x", userPrompt: "trim the intro", videoType: "videoedit" });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(lastHit().url, "/v1/studio/generate-plan");
    });

    it("forwards a revision with no feedback rather than refusing it locally", async function () {
      const before = hits.length;
      await api().patch(BASE + "/studio/revise-plan/job-1").send({});
      assert.strictEqual(hits.length, before + 1);
      assert.strictEqual(lastHit().url, "/v1/studio/revise-plan/job-1");

      const res = await api()
        .patch(BASE + "/studio/revise-plan/job-1")
        .send({ feedback: "split scene 3" });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastHit().url, "/v1/studio/revise-plan/job-1");
      assert.strictEqual(lastHit().method, "PATCH");
    });

    it("relays the 202 and queue position from a queued render", async function () {
      const res = await api()
        .post(BASE + "/studio/generate-video/job-1")
        .send({ contentName: "PPC" });

      assert.strictEqual(res.status, 202);
      assert.strictEqual(res.body.queuePosition, 2);
      assert.strictEqual(lastHit().url, "/v1/studio/generate-video/job-1");
    });

    it("polls, lists and deletes against the right upstream paths", async function () {
      await api().get(BASE + "/studio/get-video/job-1");
      assert.strictEqual(lastHit().url, "/v1/studio/get-video/job-1");

      await api().get(BASE + "/studio/list-videos");
      assert.strictEqual(lastHit().url, "/v1/studio/list-videos");

      await api().delete(BASE + "/studio/delete-video/job-1");
      assert.strictEqual(lastHit().url, "/v1/studio/delete-video/job-1");
      assert.strictEqual(lastHit().method, "DELETE");
    });

    it("passes the storage redirect through instead of following it", async function () {
      const res = await api().get(BASE + "/studio/download-video/job-1");

      assert.strictEqual(res.status, 302);
      assert.strictEqual(res.headers.location, "https://storage.example/signed/abc?exp=1");
      assert.strictEqual(lastHit().url, "/v1/studio/download-video/job-1");
    });
  });

  describe("Quiz — sources to MCQs", function () {
    it("forwards several source files under one field", async function () {
      const res = await api()
        .post(BASE + "/quiz/upload")
        .field("language", "hi")
        .attach("files", Buffer.from("aaa"), "a.pdf")
        .attach("files", Buffer.from("bbb"), "b.pdf");

      assert.strictEqual(res.status, 200);
      assert.ok(/a\.pdf/.test(lastHit().body) && /b\.pdf/.test(lastHit().body));
    });

    it("forwards an upload carrying neither a file nor a link", async function () {
      const before = hits.length;
      await api().post(BASE + "/quiz/upload").field("language", "hi");

      assert.strictEqual(hits.length, before + 1, "the service decides, not the proxy");
      assert.strictEqual(lastHit().url, "/v1/quiz/upload");
    });

    it("accepts links with no files at all", async function () {
      const res = await api()
        .post(BASE + "/quiz/upload")
        .field("links", "https://drive.example/doc");

      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastHit().url, "/v1/quiz/upload");
    });

    it("lets the AI service decide about a generate request with no material", async function () {
      const before = hits.length;
      const res = await api().post(BASE + "/quiz/generate").send({ sourceIds: [] });

      assert.strictEqual(hits.length, before + 1, "the request must reach upstream");
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, "NO_MATERIAL");
    });

    it("accepts material as docText or as a source job id, not only source ids", async function () {
      await api().post(BASE + "/quiz/generate").send({ docText: "some pasted text" });
      assert.strictEqual(lastHit().url, "/v1/quiz/generate");

      await api().post(BASE + "/quiz/generate").send({ sourceJobId: "job-1" });
      assert.strictEqual(lastHit().url, "/v1/quiz/generate");
    });

    it("relays the 422 for thin material with its body intact", async function () {
      const res = await api()
        .post(BASE + "/quiz/generate")
        .send({ numQuestions: 999, sourceIds: ["s1"] });

      assert.strictEqual(res.status, 422,
        "a 422 must not be flattened into a 500 — upstream saw body: " + JSON.stringify(res.body));
      assert.strictEqual(res.body.error.code, "THIN_MATERIAL");
      assert.strictEqual(res.body.error.message, "supports 6");
    });

    it("forwards an update whether or not it carries a whole assessment", async function () {
      const before = hits.length;
      await api().patch(BASE + "/quiz/update/quiz-1").send({ title: "t" });
      assert.strictEqual(hits.length, before + 1, "not refused locally");

      await api()
        .patch(BASE + "/quiz/update/quiz-1")
        .send({ assessment: { questions: [], title: "t" } });
      assert.strictEqual(lastHit().url, "/v1/quiz/update/quiz-1");
      assert.ok(JSON.parse(lastHit().body).assessment, "the assessment must arrive intact");
    });

    it("does not break the next request after a redirect is relayed", async function () {
      const redirected = await api().get(BASE + "/quiz/export/quiz-1?format=xlsx");
      assert.strictEqual(redirected.status, 302);

      // Draining vs destroying the redirect body decides whether the keep-alive socket goes
      // back into the pool healthy or dead. If it is dead, this next call gets ECONNRESET and
      // the proxy answers 500 without ever reaching upstream.
      const next = await api().get(BASE + "/quiz/list");
      assert.strictEqual(next.status, 200, "a download must not poison the connection pool");
      assert.strictEqual(lastHit().url, "/v1/quiz/list");
    });

    it("carries the export format through as a query parameter", async function () {
      const res = await api().get(BASE + "/quiz/export/quiz-1?format=xlsx");

      assert.strictEqual(res.status, 302);
      assert.strictEqual(lastHit().url, "/v1/quiz/export/quiz-1?format=xlsx");
    });

    it("keeps /languages and /list from being read as quiz ids", async function () {
      // The status assertions are not decoration. Without them a request that never reached
      // upstream still "passes" the url check, because lastHit() would return the previous
      // test's hit — which is how a real connection-reuse bug hid here for a while.
      const languages = await api().get(BASE + "/quiz/languages");
      assert.strictEqual(languages.status, 200);
      assert.strictEqual(lastHit().url, "/v1/quiz/languages");

      const list = await api().get(BASE + "/quiz/list");
      assert.strictEqual(list.status, 200);
      assert.strictEqual(lastHit().url, "/v1/quiz/list");

      const one = await api().get(BASE + "/quiz/quiz-1");
      assert.strictEqual(one.status, 200);
      assert.strictEqual(lastHit().url, "/v1/quiz/quiz-1");
    });

    it("deletes against the right path", async function () {
      await api().delete(BASE + "/quiz/delete/quiz-1");
      assert.strictEqual(lastHit().url, "/v1/quiz/delete/quiz-1");
      assert.strictEqual(lastHit().method, "DELETE");
    });
  });

  describe("Artifacts", function () {
    it("forwards an upload with no file rather than refusing it locally", async function () {
      const before = hits.length;
      await api().post(BASE + "/artifacts/upload").field("contentId", "do_123");

      assert.strictEqual(hits.length, before + 1);
      assert.strictEqual(lastHit().url, "/v1/artifacts/upload");
    });

    it("stores a file and relays the 201", async function () {
      const res = await api()
        .post(BASE + "/artifacts/upload")
        .field("contentId", "do_123")
        .attach("file", Buffer.from("the actual bytes"), "notes.txt");

      assert.strictEqual(res.status, 201);
      assert.strictEqual(lastHit().url, "/v1/artifacts/upload");
    });

    it("streams bytes back with the filename when storage is local", async function () {
      const res = await api().get(BASE + "/artifacts/do_123/notes.txt");

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.text, "the actual bytes");
      assert.ok(/notes\.txt/.test(res.headers["content-disposition"]));
    });

    it("deletes against the right path", async function () {
      await api().delete(BASE + "/artifacts/do_123/notes.txt");
      assert.strictEqual(lastHit().url, "/v1/artifacts/do_123/notes.txt");
      assert.strictEqual(lastHit().method, "DELETE");
    });
  });

  describe("Usage & spend", function () {
    it("forwards body filters on the POST form", async function () {
      await api().post(BASE + "/usage/get-report").send({ limit: 500, type: "video" });

      assert.strictEqual(lastHit().url, "/v1/usage/get-report");
      assert.strictEqual(JSON.parse(lastHit().body).type, "video");
    });

    it("forwards query filters on the GET form", async function () {
      await api().get(BASE + "/usage/get-report?type=video&limit=5");
      assert.strictEqual(lastHit().url, "/v1/usage/get-report?type=video&limit=5");
    });
  });

  describe("Wildcard passthrough", function () {
    it("carries an endpoint this proxy has never heard of, query string and all", async function () {
      const res = await api().get(BASE + "/studio/brand-new-endpoint?depth=2");

      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastHit().url, "/v1/studio/brand-new-endpoint?depth=2");
      assert.strictEqual(lastHit().method, "GET");
      assert.strictEqual(lastHit().headers.authorization, "test-gateway-key");
    });

    it("carries a nested path and the method it was sent with", async function () {
      await api().put(BASE + "/artifacts/future/move").send({ to: "x" });

      assert.strictEqual(lastHit().url, "/v1/artifacts/future/move");
      assert.strictEqual(lastHit().method, "PUT");
      assert.strictEqual(JSON.parse(lastHit().body).to, "x");
    });

    it("does not add a creator field to a body that never had one", async function () {
      await api().post(BASE + "/studio/future/nested/thing").send({ a: 1 });

      assert.deepStrictEqual(JSON.parse(lastHit().body), { a: 1 });
    });

    it("names the creator on an endpoint it has never heard of", async function () {
      await api()
        .post(BASE + "/quiz/future-generate")
        .set("x-aastrika-creator", "spoofed")
        .send({ n: 3 });

      assert.strictEqual(lastHit().headers["x-aastrika-creator"], "Asha Kumari");
      assert.deepStrictEqual(JSON.parse(lastHit().body), { n: 3 }, "body untouched");
    });

    it("rebuilds a multipart body for an unknown endpoint", async function () {
      const res = await api()
        .post(BASE + "/studio/future-upload")
        .field("kind", "diagram")
        .attach("file", Buffer.from("PNGDATA"), "x.png");

      assert.strictEqual(res.status, 200);
      assert.ok(/x\.png/.test(lastHit().body) && /diagram/.test(lastHit().body));
    });

    it("reaches a feature area that does not exist here at all", async function () {
      await api().get(BASE + "/v1/translate/run?q=hi");
      assert.strictEqual(lastHit().url, "/v1/translate/run?q=hi");
    });

    it("relays a redirect and an error body from an unknown endpoint", async function () {
      const redirected = await api().get(BASE + "/studio/future-download");
      assert.strictEqual(redirected.status, 302);
      assert.strictEqual(redirected.headers.location, "https://storage.example/signed/abc?exp=1");

      const missing = await api().get(BASE + "/quiz/deep/missing/path");
      assert.strictEqual(missing.status, 404);
      assert.strictEqual(JSON.parse(missing.text).error.code, "NOT_FOUND");
    });

    it("never wins over a route that is named explicitly", async function () {
      await api().get(BASE + "/studio/list-videos");
      assert.strictEqual(lastHit().url, "/v1/studio/list-videos");
    });
  });

  describe("Responses that are not plain JSON", function () {
    it("does not claim a compressed length for a body axios already decompressed", async function () {
      const res = await api().get(BASE + "/artifacts/do_123/big.txt");

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.text, "compressed body contents");
      assert.strictEqual(
        res.headers["content-length"],
        undefined,
        "the upstream length describes bytes the caller never receives"
      );
    });

    it("forwards a Range request and relays the partial-content answer", async function () {
      const res = await api()
        .get(BASE + "/artifacts/do_123/clip.mp4")
        .set("Range", "bytes=0-3");

      assert.strictEqual(lastHit().headers.range, "bytes=0-3");
      assert.strictEqual(res.status, 206);
      assert.strictEqual(res.headers["content-range"], "bytes 0-3/100");
      assert.strictEqual(res.headers["accept-ranges"], "bytes");
    });

    it("drops the connection when a stream dies mid-body, rather than serving a short body as complete", async function () {
      let clientError = null;
      let response = null;
      try {
        response = await api().get(BASE + "/artifacts/do_123/truncated.bin");
      } catch (err) {
        clientError = err;
      }

      // The body was never completed upstream, so the caller must be able to tell. Either the
      // connection is dropped (an aborted read) or the failure happened before any response
      // existed and became a 500 — what must not happen is a clean 200 with a short body.
      const servedAsComplete = response !== null && response.status === 200;
      assert.ok(
        !servedAsComplete,
        "a truncated body must not reach the caller as a successful response"
      );
      assert.ok(clientError !== null || response.status >= 500, "the failure must be visible");

      // And the proxy is still up: an unhandled 'error' on the stream would have thrown.
      const after = await api().get(BASE + "/studio/list-videos");
      assert.strictEqual(after.status, 200);
    });
  });

  describe("Requests that arrive with no readable session", function () {
    it("omits the creator and token headers rather than sending them empty", async function () {
      const bare = express();
      bare.use(express.json());
      bare.use((req, _res, next) => {
        req.session = {}; // past keycloak.protect, but nothing to name the person with
        next();            // and no req.kauth, so extractUserToken returns undefined
      });
      const { aiStudioApi } = require("../src/protectedApi_v8/aiStudio/aiStudio");
      bare.use("/protected/v8/aiStudio", aiStudioApi);

      const res = await request(bare).get(BASE + "/studio/list-videos");

      assert.strictEqual(res.status, 200, "must reach upstream, not fail on a bad header");
      assert.strictEqual(lastHit().headers["x-aastrika-creator"], undefined,
        "an empty name would be recorded as a creator; absent means admin");
      assert.strictEqual(lastHit().headers["x-authenticated-user-token"], undefined,
        "undefined would be ERR_HTTP_INVALID_HEADER_VALUE, an opaque 500 from inside the proxy");
    });
  });

  describe("Creator identity — the fallback ladder", function () {
    // display name -> Sunbird userName -> user id -> nothing at all.
    const appWith = (session, kauth) => {
      const a = express();
      a.use(express.json());
      a.use((req, _res, next) => { req.session = session; req.kauth = kauth; next(); });
      const { aiStudioApi } = require("../src/protectedApi_v8/aiStudio/aiStudio");
      a.use("/protected/v8/aiStudio", aiStudioApi);
      return a;
    };
    const creatorFor = async (session, kauth) => {
      await request(appWith(session, kauth)).get(BASE + "/studio/list-videos");
      return lastHit().headers["x-aastrika-creator"];
    };

    it("prefers the Keycloak display name", async function () {
      const creator = await creatorFor(
        { userId: "uuid-42", userName: "asha.kumari" },
        { grant: { access_token: { content: { name: "Asha Kumari" } } } }
      );
      assert.strictEqual(creator, "Asha Kumari");
    });

    it("builds the name from given and family name when there is no display name", async function () {
      const creator = await creatorFor(
        { userId: "uuid-42", userName: "asha.kumari" },
        { grant: { access_token: { content: { family_name: "Kumari", given_name: "Asha" } } } }
      );
      assert.strictEqual(creator, "Asha Kumari");
    });

    it("falls back to the Sunbird userName when the token carries no name", async function () {
      const creator = await creatorFor(
        { userId: "uuid-42", userName: "asha.kumari" },
        { grant: { access_token: { content: {} } } }
      );
      assert.strictEqual(creator, "asha.kumari");
    });

    it("falls back to the user id when the profile has not been read yet", async function () {
      const creator = await creatorFor({ userId: "uuid-42" }, undefined);
      assert.strictEqual(creator, "uuid-42");
    });

    it("sends no header at all when nothing identifies the user", async function () {
      const creator = await creatorFor({}, undefined);
      assert.strictEqual(creator, undefined, "absent means admin; empty would be a blank name");
    });
  });

  describe("Both path shapes reach the same named routes", function () {
    // Clients written against the AI service's own API keep its /v1 and change only the host,
    // so /aiStudio/v1/quiz/languages has to behave exactly like /aiStudio/quiz/languages —
    // not fall through to the wildcard, which is what happened before the aliases existed.
    const pairs = [
      ["/quiz/languages", "/v1/quiz/languages", "/v1/quiz/languages"],
      ["/studio/list-videos", "/v1/studio/list-videos", "/v1/studio/list-videos"],
      ["/usage/get-report", "/v1/usage/get-report", "/v1/usage/get-report"],
      ["/artifacts/do_123/notes.txt", "/v1/artifacts/do_123/notes.txt", "/v1/artifacts/do_123/notes.txt"],
    ];

    pairs.forEach(([portal, upstream, expected]) => {
      it(`${upstream} reaches the same upstream path as ${portal}`, async function () {
        await api().get(BASE + portal);
        const viaPortal = lastHit().url;
        await api().get(BASE + upstream);
        const viaUpstream = lastHit().url;

        assert.strictEqual(viaPortal, expected);
        assert.strictEqual(viaUpstream, expected, "the /v1 alias must not change the target");
      });
    });

    it("keeps the query string on the aliased shape", async function () {
      await api().get(BASE + "/v1/quiz/export/quiz-1?format=csv&as=url");
      assert.strictEqual(lastHit().url, "/v1/quiz/export/quiz-1?format=csv&as=url",
        "every parameter must survive, not just the ones this proxy knows by name");
    });

    it("still falls through to the wildcard for a feature area that has no router", async function () {
      await api().get(BASE + "/v1/translate/run?q=hi");
      assert.strictEqual(lastHit().url, "/v1/translate/run?q=hi");
    });
  });

  describe("Path segments supplied by the caller", function () {
    it("encodes a job id rather than letting it address another endpoint", async function () {
      await api().get(BASE + "/quiz/" + encodeURIComponent("../../usage/get-report"));

      assert.strictEqual(lastHit().url, "/v1/quiz/..%2F..%2Fusage%2Fget-report");
    });
  });
});
