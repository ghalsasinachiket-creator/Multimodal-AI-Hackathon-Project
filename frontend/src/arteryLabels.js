import * as THREE from "three";
import { HEART_CENTRE } from "./anatomy.js";

const DEFAULT_CAMERA = new THREE.Vector3(0, 0.1, 2.7);

const LABEL_CONFIG = {
  lad: { minT: 0.24, maxT: 0.68, preferredT: 0.42, offset: 0.09 },
  lcx: { minT: 0.16, maxT: 0.74, preferredT: 0.34, offset: 0.08 },
  rca: { minT: 0.14, maxT: 0.66, preferredT: 0.32, offset: 0.08 },
};

const clamp01 = (value) => Math.min(1, Math.max(0, value));

function finiteVector(v) {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

export function arteryLabelAnchor(id, curve, cameraPosition = DEFAULT_CAMERA) {
  const config = LABEL_CONFIG[id] ?? { minT: 0.2, maxT: 0.7, preferredT: 0.4, offset: 0.08 };
  const camera = cameraPosition instanceof THREE.Vector3
    ? cameraPosition
    : new THREE.Vector3(...cameraPosition);

  let best = null;
  for (let i = 0; i <= 24; i += 1) {
    const t = config.minT + (config.maxT - config.minT) * (i / 24);
    const point = curve.getPoint(clamp01(t));
    const outward = point.clone().sub(HEART_CENTRE).normalize();
    const toCamera = camera.clone().sub(point).normalize();
    const facingCamera = outward.dot(toCamera);
    const preferred = 1 - Math.abs(t - config.preferredT) / Math.max(config.maxT - config.minT, 0.001);
    const score = facingCamera * 0.8 + preferred * 0.2;

    if (!best || score > best.score) {
      best = { point, outward, score, t };
    }
  }

  if (!best || !finiteVector(best.point) || !finiteVector(best.outward)) {
    const fallback = curve.getPoint(config.preferredT);
    const outward = fallback.clone().sub(HEART_CENTRE).normalize();
    return fallback.addScaledVector(outward, config.offset);
  }

  return best.point.clone().addScaledVector(best.outward, config.offset);
}

