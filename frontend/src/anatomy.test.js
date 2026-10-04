// Run with:  npm test      (uses Node's built-in test runner: no extra packages needed)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CHAMBERS, HEART_CENTRE, VESSELS, buildArteryCurve, insideHeart, snapToHull } from "./anatomy.js";
import { riskColor } from "./riskColor.js";

describe("riskColor", () => {
  it("runs from green (0) through yellow to red (1)", () => {
    assert.equal(riskColor(0), "hsl(120, 75%, 45%)");
    assert.equal(riskColor(0.5), "hsl(60, 75%, 45%)");
    assert.equal(riskColor(1), "hsl(0, 75%, 45%)");
  });
  it("clamps out-of-range and invalid values", () => {
    assert.equal(riskColor(-3), riskColor(0));
    assert.equal(riskColor(7), riskColor(1));
    assert.equal(riskColor(NaN), riskColor(0));
  });
});

describe("heart geometry", () => {
  it("has the heart centre and every chamber centre inside the heart", () => {
    assert.equal(insideHeart(HEART_CENTRE), true);
    for (const ch of Object.values(CHAMBERS)) {
      assert.equal(insideHeart(new THREE.Vector3(...ch.centre)), true);
    }
  });
  it("snapToHull lands exactly on the surface", () => {
    const p = snapToHull(new THREE.Vector3(0.5, 0.2, 0.5), 0);
    const dir = p.clone().sub(HEART_CENTRE).normalize();
    assert.equal(insideHeart(p.clone().addScaledVector(dir, -0.003)), true); // just below the surface: inside
    assert.equal(insideHeart(p.clone().addScaledVector(dir, 0.003)), false); // just above it: outside
  });
});

describe("coronary arteries", () => {
  for (const [id, v] of Object.entries(VESSELS)) {
    it(`${id.toUpperCase()} follows the heart surface along its whole length`, () => {
      const curve = buildArteryCurve(v.points);
      assert.ok(curve.getLength() > 0.5, "artery is too short");
      for (const p of curve.getPoints(200)) {
        const dir = p.clone().sub(HEART_CENTRE).normalize();
        assert.equal(insideHeart(p.clone().addScaledVector(dir, -0.03)), true, "artery is floating off the heart");
        assert.equal(insideHeart(p.clone().addScaledVector(dir, 0.03)), false, "artery is buried inside the heart");
      }
    });
  }
});