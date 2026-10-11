import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { VESSELS, buildArteryCurve, insideHeart } from "./anatomy.js";
import { VIEWS } from "./views.js";
import { buildLabelSamples, pickLabelAnchor, pickLabelSample } from "./arteryLabels.js";

describe("artery label placement", () => {
  it("selects near-best visible samples across supported views", () => {
    for (const vessel of Object.values(VESSELS)) {
      const samples = buildLabelSamples(buildArteryCurve(vessel.points));
      for (const view of Object.values(VIEWS)) {
        const camera = new THREE.Vector3(...view.position);
        const sample = pickLabelSample(samples, camera);
        const toCamera = camera.clone().sub(sample.point).normalize();
        const facing = sample.normal.dot(toCamera);
        const bestFacing = Math.max(...samples.map((candidate) => {
          const dir = camera.clone().sub(candidate.point).normalize();
          return candidate.normal.dot(dir);
        }));
        assert.ok(facing >= bestFacing - 0.15, `${vessel.name} label sample is poorly placed for ${view.label}`);
      }
    }
  });

  it("keeps label anchors outside heart geometry", () => {
    for (const vessel of Object.values(VESSELS)) {
      const samples = buildLabelSamples(buildArteryCurve(vessel.points));
      for (const view of Object.values(VIEWS)) {
        const anchor = pickLabelAnchor(samples, new THREE.Vector3(...view.position));
        assert.equal(insideHeart(anchor), false, `${vessel.name} label anchor is inside heart for ${view.label}`);
      }
    }
  });
});
