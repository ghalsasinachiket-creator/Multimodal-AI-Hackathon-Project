// Run with:  npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { VIEWS, arrived, stepToward } from "./views.js";

const at = (name) => new THREE.Vector3(...VIEWS[name].position);

describe("camera animation", () => {
  it("swings AROUND the heart when going from front to back, never through it", () => {
    let pos = at("front");
    const goal = at("back");
    let closest = Infinity;
    for (let i = 0; i < 300 && !arrived(pos, goal); i++) {
      pos = stepToward(pos, goal);
      closest = Math.min(closest, pos.length());       // distance from the heart (the origin)
    }
    assert.ok(arrived(pos, goal), "should reach the goal");
    assert.ok(closest > 2.0, `came too close to the heart: ${closest}`);
  });
  it("takes the short way round (350 degrees to 10 degrees goes +20, not -340)", () => {
    const from = new THREE.Vector3().setFromSphericalCoords(2.7, Math.PI / 2, (350 * Math.PI) / 180);
    const to = new THREE.Vector3().setFromSphericalCoords(2.7, Math.PI / 2, (10 * Math.PI) / 180);
    const next = stepToward(from, to, 0.5);
    const theta = new THREE.Spherical().setFromVector3(next).theta;
    assert.ok(Math.abs(theta) < 0.5, "moved the long way round");
  });
  it("does nothing when already there", () => {
    const g = at("left");
    assert.ok(arrived(stepToward(g.clone(), g), g));
  });
});