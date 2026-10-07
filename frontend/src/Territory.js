import * as THREE from "three";
import { VESSELS, buildArteryCurve } from "./anatomy.js";

// Risk shading of the heart wall. Each point of the wall is tinted by the arteries NEAR it, which is
// a simple stand-in for "the territory this artery supplies" (LAD: front, LCX: side/back, RCA: right/bottom).

export const SIGMA = 0.13;    // how far (scene units) an artery's shading reaches into the heart wall
export const MAX_TINT = 0.85; // 0..1: how strongly the risk colour replaces the heart's own colour

// Points along each artery, computed once when this file is first loaded.
export const ARTERY_SAMPLES = Object.fromEntries(
  Object.entries(VESSELS).map(([id, v]) => [id, buildArteryCurve(v.points).getPoints(150)]),
);

// Distance from a point to the closest sample of an artery.
export function nearestDistance(point, samples) {
  let best = Infinity;
  for (const s of samples) best = Math.min(best, point.distanceToSquared(s));
  return Math.sqrt(best);
}

// 1 right on the artery, falling smoothly towards 0 further away (a bell curve with width `sigma`).
export function territoryWeight(point, samples, sigma = SIGMA) {
  return Math.exp(-((nearestDistance(point, samples) / sigma) ** 2));
}

// For every vertex of a chamber's sphere mesh: one weight per artery. The sphere is stored in its own
// local coordinates, so we first move each vertex to where it really is in the scene (same position,
// tilt and size the <mesh> uses), because the arteries are defined in scene coordinates.
export function chamberWeights(geometry, chamber, samples = ARTERY_SAMPLES, sigma = SIGMA) {
  const toScene = new THREE.Matrix4().compose(
    new THREE.Vector3(...chamber.centre),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, chamber.tilt)),
    new THREE.Vector3(...chamber.radii),
  );
  const position = geometry.attributes.position;
  const ids = Object.keys(samples);
  const weights = Object.fromEntries(ids.map((id) => [id, new Float32Array(position.count)]));
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).applyMatrix4(toScene);
    for (const id of ids) weights[id][i] = territoryWeight(p, samples[id], sigma);
  }
  return weights;
}

const _mix = new THREE.Color();

// Colour of vertex `i`: the chamber's own colour, tinted by nearby arteries.
//   weights[id][i]  how close the vertex is to artery `id` (0..1)
//   amounts[id]     how visible that artery's tint is right now (0 = no prediction, 1 = full)
//   colors[id]      the risk colour currently shown for that artery
// Several arteries blend by weight; the strongest influence decides how much tint is applied.
export function shadeVertex(out, base, weights, i, amounts, colors, maxTint = MAX_TINT) {
  let total = 0;
  let strongest = 0;
  _mix.setRGB(0, 0, 0);
  for (const id of Object.keys(colors)) {
    const k = weights[id][i] * amounts[id];
    if (k <= 0) continue;
    _mix.r += colors[id].r * k;
    _mix.g += colors[id].g * k;
    _mix.b += colors[id].b * k;
    total += k;
    strongest = Math.max(strongest, k);
  }
  out.copy(base);
  if (total > 0) out.lerp(_mix.multiplyScalar(1 / total), maxTint * strongest);
  return out;
}