// Executed tests (ts-node), like courseHierarchyAdapter.test.js: the helper's
// contract is input -> output, which only running it can verify.
require("ts-node/register");
const assert = require("assert");
const { toSvgMarkup, svgSize } = require("../src/publicApi_v8/adapters/certificateSvg.ts");

/**
 * cert-registry returns printUri as a data URI for certificates issued before
 * Spark and as raw "<svg ..." markup for the ones sunbird-rc renders. The
 * download routes used to decodeURIComponent() it and cut at the first ",":
 * raw SVG with a "%" threw "URI malformed" (HTTP 500), and raw SVG without one
 * lost everything up to its first comma, rendering the rest as text.
 */
describe("certificateSvg", function () {
  const rawSvg =
    '<svg width="1398" height="856" viewBox="0 0 1398 856" xmlns="http://www.w3.org/2000/svg">' +
    '<stop offset="50%"/><text>Karnataka, India</text></svg>';

  describe("toSvgMarkup", function () {
    it("new certificate: raw SVG with % and commas comes back unchanged", function () {
      assert.strictEqual(toSvgMarkup(rawSvg), rawSvg);
    });

    it("old certificate: URL-encoded data URI is decoded", function () {
      const dataUri = "data:image/svg+xml," + encodeURIComponent(rawSvg);
      assert.strictEqual(toSvgMarkup(dataUri), rawSvg);
    });

    it("old certificate: base64 data URI is decoded", function () {
      const dataUri = "data:image/svg+xml;base64," + Buffer.from(rawSvg).toString("base64");
      assert.strictEqual(toSvgMarkup(dataUri), rawSvg);
    });

    it("a data URI whose payload is not valid URI encoding is returned as-is, not thrown", function () {
      assert.strictEqual(toSvgMarkup("data:image/svg+xml,<svg>100%</svg>"), "<svg>100%</svg>");
    });

    it("empty or missing printUri gives an empty string", function () {
      assert.strictEqual(toSvgMarkup(""), "");
      assert.strictEqual(toSvgMarkup(undefined), "");
    });
  });

  describe("svgSize", function () {
    it("reads double-quoted width and height (sunbird-rc output)", function () {
      assert.deepStrictEqual(svgSize(rawSvg), { width: "1398", height: "856" });
    });

    it("reads single-quoted width and height (older templates)", function () {
      assert.deepStrictEqual(svgSize("<svg width='1200px' height='800'></svg>"), { width: "1200", height: "800" });
    });

    it("falls back to 1400x950 when the root has no size", function () {
      assert.deepStrictEqual(svgSize('<svg viewBox="0 0 10 10"></svg>'), { width: "1400", height: "950" });
    });
  });
});
