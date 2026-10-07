// Run with:  npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { plainSummary } from "./summary.js";

// A tiny feature list in the same shape the API's GET /features returns.
const features = [
  { name: "typical_chest_pain", label: "Typical Chest Pain", kind: "binary", mapping: { 0: 0, 1: 1 } },
  { name: "ef_tte", label: "EF-TTE", kind: "numeric" },
  { name: "age", label: "Age", kind: "numeric" },
];
// One entry of the explanation list the API returns (only the fields the summary reads).
const feat = (feature, label, value, direction, share = 10) => ({ feature, label, value, direction, share_pct: share });
const pred = { probability: 0.9651, threshold: 0.5692, above_threshold: true };

describe("plainSummary", () => {
  const exp = {
    assumed_share_pct: 20,
    top_features: [feat("typical_chest_pain", "Typical Chest Pain", 1, "raises"), feat("ef_tte", "EF-TTE", 45, "raises"),
      feat("age", "Age", 63, "lowers")],
  };
  const text = plainSummary({ title: "LAD", pred, exp, features });

  it("states the probability and where it sits relative to the cut-off", () => {
    assert.match(text, /LAD: 97%, above its cut-off of 57%\./);
  });
  it("names raising and lowering factors with the entered values", () => {
    assert.match(text, /Main factors raising it: Typical chest pain \(Yes\) and Ejection fraction \(45\)\./);
    assert.match(text, /Factors lowering it: Age \(63\)\./);
  });
  it("says it is an association, not a diagnosis", () => {
    assert.match(text, /not a diagnosis/);
  });
  it("adds no caution when most of the estimate rests on entered values", () => {
    assert.doesNotMatch(text, /not entered/);
  });
  it("warns when more than half rests on values that were not entered", () => {
    const t = plainSummary({ title: "LCX", pred, exp: { ...exp, assumed_share_pct: 67.5 }, features });
    assert.match(t, /67\.5% of this estimate rests on values that were not entered/);
  });
  it("uses 'below' wording and handles an explanation with no drivers", () => {
    const t = plainSummary({ title: "RCA", pred: { ...pred, above_threshold: false }, exp: { assumed_share_pct: 0, top_features: [] }, features });
    assert.match(t, /below its cut-off/);
    assert.match(t, /None of the entered values moved this estimate noticeably/);
  });
  it("leads with the factors keeping it low when the estimate is below its cut-off", () => {
    const low = { assumed_share_pct: 10, top_features: [feat("age", "Age", 50, "lowers", 20), feat("ef_tte", "EF-TTE", 45, "raises", 8)] };
    const t = plainSummary({ title: "LAD", pred: { ...pred, probability: 0.13, above_threshold: false }, exp: low, features });
    assert.ok(t.indexOf("Main factors keeping it low: Age (50)") < t.indexOf("Factors pushing it up: Ejection fraction (45)"));
  });
  it("does not call tiny contributions 'main factors'", () => {
    const tiny = { assumed_share_pct: 10, top_features: [feat("age", "Age", 50, "raises", 3), feat("ef_tte", "EF-TTE", 45, "raises", 1.6)] };
    const t = plainSummary({ title: "LAD", pred: { ...pred, above_threshold: false }, exp: tiny, features });
    assert.doesNotMatch(t, /Factors pushing it up|Main factors/);
    assert.match(t, /None of the entered values moved this estimate noticeably/);
  });
});