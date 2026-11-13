// Bihar Staff Nurse registration: "Others" facility (facilityNameOthers), the same field the MP
// form sends. Executes the real request schema (ts-node) and guards the profile write.
require("ts-node/register");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { serviceSchemaJoi } = require("../src/publicApi_v8/bnrcUser.ts");

const staffNurse = (extra) => ({
  block: "Danapur",
  district: "Patna",
  firstName: "Asha",
  lastName: "Kumari",
  nin: "",
  phone: 9876543210,
  role: "In Service",
  roleForInService: "Staff Nurses",
  serviceType: "Regular",
  ...extra,
});

describe("BNRC Staff Nurse facility Others", () => {
  it("accepts a typed facility with facilityNameOthers=Others and no NIN", () => {
    const { error } = serviceSchemaJoi.validate(
      staffNurse({ facilityName: "PHC Danapur", facilityNameOthers: "Others" }),
      { abortEarly: false }
    );
    assert.strictEqual(error, undefined);
  });

  it("accepts a listed facility without facilityNameOthers", () => {
    const { error } = serviceSchemaJoi.validate(
      staffNurse({ facilityName: "Ajamnagar", nin: "7267278724" }),
      { abortEarly: false }
    );
    assert.strictEqual(error, undefined);
  });

  it("accepts an empty facilityNameOthers", () => {
    const { error } = serviceSchemaJoi.validate(staffNurse({ facilityName: "Ajamnagar", facilityNameOthers: "" }));
    assert.strictEqual(error, undefined);
  });

  it("rejects any facilityNameOthers value other than Others", () => {
    const { error } = serviceSchemaJoi.validate(staffNurse({ facilityName: "X", facilityNameOthers: "PHC Danapur" }));
    assert.ok(error);
    assert.match(error.message, /facilityNameOthers/);
  });

  it("still rejects unknown fields", () => {
    const { error } = serviceSchemaJoi.validate(staffNurse({ facilityName: "X", customFacilityName: "X" }));
    assert.ok(error);
    assert.match(error.message, /customFacilityName/);
  });

  it("still requires facilityName and NIN to be present for a CHO", () => {
    const cho = staffNurse({ roleForInService: "CHO" });
    delete cho.nin;
    const { error } = serviceSchemaJoi.validate(cho, { abortEarly: false });
    assert.ok(error);
    assert.match(error.message, /facilityName/);
    assert.match(error.message, /nin/);
  });

  it("saves facilityNameOthers on the In Service profile", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/publicApi_v8/bnrcUser.ts"), "utf8");
    const inService = src.slice(src.indexOf('if (user.role == "In Service")'));
    assert.match(inService, /facilityNameOthers: user\.facilityNameOthers \|\| ''/);
  });
});
