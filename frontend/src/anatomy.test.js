// Run with:  npm test      (uses Node's built-in test runner: no extra packages needed)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CHAMBERS, HEART_CENTRE, VESSELS, buildArteryCurve, insideHeart, snapToHull } from "./anatomy.js";
import { arteryLabelAnchor } from "./arteryLabels.js";
import { riskColor } from "./riskColor.js";
import { VIEWS } from "./views.js";

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

describe("coronary artery labels", () => {
  for (const [id, v] of Object.entries(VESSELS)) {
    it(`${id.toUpperCase()} has a valid label anchor for every camera view`, () => {
      const curve = buildArteryCurve(v.points);
      for (const view of Object.values(VIEWS)) {
        const anchor = arteryLabelAnchor(id, curve, new THREE.Vector3(...view.position));
        assert.equal(Number.isFinite(anchor.x), true);
        assert.equal(Number.isFinite(anchor.y), true);
        assert.equal(Number.isFinite(anchor.z), true);
        assert.equal(insideHeart(anchor), false, "label anchor should sit outside the heart");
        assert.ok(anchor.distanceTo(HEART_CENTRE) > 0.2, "label anchor is too close to the heart centre");
      }
    });
  }

  it("places the LAD label on a front-visible outside anchor", () => {
    const curve = buildArteryCurve(VESSELS.lad.points);
    const anchor = arteryLabelAnchor("lad", curve, new THREE.Vector3(...VIEWS.front.position));
    const outward = anchor.clone().sub(HEART_CENTRE).normalize();
    const toCamera = new THREE.Vector3(...VIEWS.front.position).sub(anchor).normalize();

    assert.equal(insideHeart(anchor), false);
    assert.ok(outward.dot(toCamera) > 0.6, "LAD anchor should face the front camera");
    assert.ok(anchor.z > 0.32, "LAD anchor should be lifted in front of the heart surface");
  });
});
