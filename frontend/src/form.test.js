// Run with:  npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { binaryOptions, buildPayload, computeBmi, formatValue, groupFeatures } from "./featureGroups.js";

// A tiny feature list in the same shape the API's GET /features returns.
const FEATURES = [
  { name: "age", label: "Age", kind: "numeric", min: 30, max: 90, median: 58, default: 58 },
  { name: "weight", label: "Weight", kind: "numeric", min: 40, max: 120, median: 73, default: 73 },
  { name: "length", label: "Length", kind: "numeric", min: 140, max: 190, median: 164, default: 164 },
  { name: "bmi", label: "BMI", kind: "numeric", min: 15, max: 45, median: 27, default: 27 },
  { name: "sex", label: "Sex", kind: "binary", mapping: { Fmale: 0, Male: 1 }, default: 1 },
  { name: "dm", label: "DM", kind: "binary", mapping: { 0: 0, 1: 1 }, default: 0 },
  { name: "bbb", label: "BBB", kind: "categorical", categories: ["LBBB", "N", "RBBB"], default: "N" },
  { name: "brand_new_marker", label: "New marker", kind: "numeric", min: 0, max: 1, median: 0.5, default: 0.5 },
];

describe("groupFeatures", () => {
  const sections = groupFeatures(FEATURES);
  it("puts known features in their sections and drops empty sections", () => {
    const titles = sections.map((s) => s.title);
    assert.deepEqual(titles, ["Demographics & body", "History & risk factors", "ECG", "Other"]);
  });
  it("keeps the section order of names, not the API order", () => {
    assert.deepEqual(sections[0].items.map((f) => f.name), ["age", "sex", "weight", "length", "bmi"]);
  });
  it("sends unknown features to 'Other' so new model features show up automatically", () => {
    assert.deepEqual(sections.at(-1).items.map((f) => f.name), ["brand_new_marker"]);
  });
});

describe("option labels", () => {
  it("turns dataset codes into words, ordered 0 then 1", () => {
    assert.deepEqual(binaryOptions(FEATURES[4]), [{ value: 0, label: "Female" }, { value: 1, label: "Male" }]);
    assert.deepEqual(binaryOptions(FEATURES[5]), [{ value: 0, label: "No" }, { value: 1, label: "Yes" }]);
  });
  it("formats entered values for display", () => {
    assert.equal(formatValue(FEATURES[5], 1), "Yes");
    assert.equal(formatValue(FEATURES[6], "N"), "None / normal");
    assert.equal(formatValue(FEATURES[0], 63), "63");
    assert.equal(formatValue(FEATURES[0], null), "");
  });
});

describe("BMI and payload", () => {
  it("is not computed unless weight or height was entered", () => {
    assert.equal(computeBmi(FEATURES, { age: 60 }), undefined);
  });
  it("matches the dataset formula weight / (height in m)^2", () => {
    assert.equal(computeBmi(FEATURES, { weight: 90, length: 175 }), 29.4);
  });
  it("uses the typical value of whichever of weight/height is missing", () => {
    assert.equal(computeBmi(FEATURES, { weight: 80 }), 29.7); // 80 / 1.64^2
  });
  it("sends only touched fields, plus the derived BMI", () => {
    assert.deepEqual(buildPayload(FEATURES, { age: 63, dm: 1 }), { age: 63, dm: 1 });
    assert.deepEqual(buildPayload(FEATURES, { weight: 90, length: 175 }), { weight: 90, length: 175, bmi: 29.4 });
  });
  it("never lets a typed BMI through", () => {
    assert.deepEqual(buildPayload(FEATURES, { bmi: 99 }), {});
  });
});