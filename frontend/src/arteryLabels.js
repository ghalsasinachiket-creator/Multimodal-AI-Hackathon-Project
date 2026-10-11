import * as THREE from "three";
import { HEART_CENTRE } from "./anatomy.js";

export const LABEL_T_VALUES = [0.14, 0.24, 0.34, 0.44, 0.54, 0.64, 0.74, 0.84];

const _toCamera = new THREE.Vector3();
const _viewDir = new THREE.Vector3();

export function buildLabelSamples(curve, tValues = LABEL_T_VALUES) {
  return tValues.map((t) => {
    const point = curve.getPoint(t);
    const normal = point.clone().sub(HEART_CENTRE);
    if (normal.lengthSq() < 1e-8) normal.set(0, 0, 1);
    else normal.normalize();
    return { point, normal };
  });
}

export function pickLabelSample(samples, cameraPosition, minFacing = -0.12) {
  let best = null;
  let bestScore = -Infinity;
  let fallback = null;
  let closest = Infinity;

  for (const sample of samples) {
    _toCamera.copy(cameraPosition).sub(sample.point);
    const distSq = _toCamera.lengthSq();
    if (distSq < closest) {
      closest = distSq;
      fallback = sample;
    }
    if (distSq === 0) continue;

    _viewDir.copy(_toCamera).normalize();
    const facing = sample.normal.dot(_viewDir);
    if (facing < minFacing) continue;

    const score = facing * 2 + 1 / (Math.sqrt(distSq) + 0.2);
    if (score > bestScore) {
      bestScore = score;
      best = sample;
    }
  }
  return best ?? fallback ?? samples[0] ?? null;
}

export function pickLabelAnchor(samples, cameraPosition, out = new THREE.Vector3()) {
  const sample = pickLabelSample(samples, cameraPosition);
  if (!sample) return out.set(0, 0, 0);

  _toCamera.copy(cameraPosition).sub(sample.point);
  if (_toCamera.lengthSq() < 1e-8) _toCamera.copy(sample.normal);
  else _toCamera.normalize();

  return out.copy(sample.point).addScaledVector(sample.normal, 0.03).addScaledVector(_toCamera, 0.03);
}
