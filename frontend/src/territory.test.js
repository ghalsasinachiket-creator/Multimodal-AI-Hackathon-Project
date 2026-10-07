// Run with:  npm test
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CHAMBERS } from "./anatomy.js";
import { ARTERY_SAMPLES, chamberWeights, nearestDistance, shadeVertex, territoryWeight } from "./territory.js";

const IDS = ["lad", "lcx", "rca"];
const colors = { lad: new THREE.Color("red"), lcx: new THREE.Color("yellow"), rca: new THREE.Color("lime") };

describe("territory weights", () => {
  it("is 1 on an artery and fades with distance", () => {
    const onArtery = ARTERY_SAMPLES.lad[60].clone();
    const nearby = onArtery.clone().add(new THREE.Vector3(0.1, 0, 0));
    assert.ok(territoryWeight(onArtery, ARTERY_SAMPLES.lad) > 0.999);
    assert.ok(territoryWeight(nearby, ARTERY_SAMPLES.lad) < territoryWeight(onArtery, ARTERY_SAMPLES.lad));
  });
  it("is close to 0 far away from every artery", () => {
    const far = new THREE.Vector3(5, 5, 5);
    for (const id of IDS) assert.ok(territoryWeight(far, ARTERY_SAMPLES[id]) < 1e-6);
  });
  it("gives each artery the highest weight to points on its own path (spot check)", () => {
    for (const id of IDS) {
      const p = ARTERY_SAMPLES[id][100];
      const own = territoryWeight(p, ARTERY_SAMPLES[id]);
      for (const other of IDS.filter((x) => x !== id)) {
        assert.ok(own >= territoryWeight(p, ARTERY_SAMPLES[other]), `${id} vs ${other}`);
      }
    }
  });
  it("nearestDistance returns 0 for a point on the curve", () => {
    assert.equal(nearestDistance(ARTERY_SAMPLES.rca[10], ARTERY_SAMPLES.rca), 0);
  });
});

describe("chamberWeights and shading", () => {
  const geometry = new THREE.SphereGeometry(1, 24, 16);
  const weights = chamberWeights(geometry, CHAMBERS.lv);

  it("returns one weight per vertex per artery, all between 0 and 1", () => {
    for (const id of IDS) {
      assert.equal(weights[id].length, geometry.attributes.position.count);
      assert.ok(weights[id].every((w) => w >= 0 && w <= 1));
    }
  });
  it("the left ventricle is strongly influenced by the LAD somewhere (it runs over it)", () => {
    assert.ok(Math.max(...weights.lad) > 0.5);
  });
  it("leaves the heart's own colour alone when no tint is visible", () => {
    const base = new THREE.Color(CHAMBERS.lv.color);
    const out = new THREE.Color();
    const amounts = { lad: 0, lcx: 0, rca: 0 };
    for (let i = 0; i < geometry.attributes.position.count; i += 17) {
      shadeVertex(out, base, weights, i, amounts, colors);
      assert.ok(out.equals(base));
    }
  });
  it("moves a vertex on the LAD towards the LAD's colour when the tint is visible", () => {
    const base = new THREE.Color(CHAMBERS.lv.color);
    let best = 0;
    for (let i = 0; i < weights.lad.length; i++) if (weights.lad[i] > weights.lad[best]) best = i;
    const out = new THREE.Color();
    shadeVertex(out, base, weights, best, { lad: 1, lcx: 0, rca: 0 }, colors);
    const distance = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
    assert.ok(distance(out, colors.lad) < distance(base, colors.lad));
  });
});