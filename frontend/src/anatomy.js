import * as THREE from "three";

// Scene units: the heart is about 1 unit tall.
// Axes (viewer facing the patient): +x = patient's LEFT (viewer's right), +y = up, +z = front (towards viewer).
export const HEART_CENTRE = new THREE.Vector3(0, 0, 0.02);

// Heart chambers as tilted ellipsoids: centre, radii (x, y, z before tilting) and tilt about the z axis.
// A positive tilt swings the lower end (the apex) towards +x, i.e. down and to the patient's left.
export const CHAMBERS = {
  lv: { centre: [0.1, -0.1, 0.0], radii: [0.34, 0.5, 0.3], tilt: 0.5, color: "#b5403a" }, // left ventricle
  rv: { centre: [-0.13, -0.04, 0.17], radii: [0.27, 0.36, 0.23], tilt: 0.35, color: "#c4524b" }, // right ventricle
  ra: { centre: [-0.36, 0.14, 0.02], radii: [0.19, 0.27, 0.19], tilt: 0.0, color: "#c85a52" }, // right atrium
  la: { centre: [0.16, 0.26, -0.2], radii: [0.2, 0.16, 0.18], tilt: 0.0, color: "#b24a44" }, // left atrium
};

// Large vessels, drawn as tubes through control points (decoration only, no risk attached).
export const GREAT_VESSELS = {
  aorta: {
    points: [[0.02, 0.28, 0.05], [0.02, 0.5, 0.04], [0.08, 0.64, 0.0], [0.22, 0.66, -0.08], [0.32, 0.52, -0.16], [0.33, 0.3, -0.2]],
    radius: 0.07, color: "#d96a5f",
  },
  pulmonaryTrunk: {
    points: [[-0.04, 0.26, 0.2], [0.0, 0.42, 0.18], [0.12, 0.52, 0.08]],
    radius: 0.06, color: "#6f93c9",
  },
  superiorVenaCava: {
    points: [[-0.36, 0.36, 0.02], [-0.36, 0.72, 0.0]],
    radius: 0.055, color: "#6f93c9",
  },
};

// The three coronary arteries. `points` are ROUGH guide points; buildArteryCurve() snaps them onto the heart surface.
export const VESSELS = {
  lad: {
    name: "LAD", full: "Left Anterior Descending", supplies: "front of the heart",
    radius: 0.02,
    points: [[0.03, 0.3, 0.3], [0.08, 0.12, 0.4], [0.14, -0.1, 0.4], [0.22, -0.32, 0.3], [0.3, -0.5, 0.12]],
  },
  lcx: {
    name: "LCX", full: "Left Circumflex", supplies: "side and back of the heart",
    radius: 0.018,
    points: [[0.14, 0.2, 0.25], [0.3, 0.16, 0.12], [0.38, 0.08, -0.05], [0.34, 0.04, -0.22], [0.2, 0.02, -0.34], [0.05, 0.0, -0.32]],
  },
  rca: {
    name: "RCA", full: "Right Coronary Artery", supplies: "right side and bottom of the heart",
    radius: 0.02,
    points: [[-0.04, 0.26, 0.26], [-0.2, 0.14, 0.34], [-0.3, -0.02, 0.3], [-0.38, -0.16, 0.14], [-0.26, -0.3, -0.04], [-0.1, -0.3, -0.22], [0.02, -0.12, -0.3]],
  },
};

// --- geometry helpers --------------------------------------------------------------------------

const _v = new THREE.Vector3(); // reused scratch vector (avoids creating thousands of temporary objects)

// Is point p inside this chamber? Undo the chamber's tilt, then use the ellipsoid equation
// (x/rx)^2 + (y/ry)^2 + (z/rz)^2 < 1.
export function insideChamber(p, ch) {
  _v.set(p.x - ch.centre[0], p.y - ch.centre[1], p.z - ch.centre[2]);
  const c = Math.cos(ch.tilt), s = Math.sin(ch.tilt);
  const x = c * _v.x + s * _v.y; // rotate by -tilt about z
  const y = -s * _v.x + c * _v.y;
  const [rx, ry, rz] = ch.radii;
  return (x / rx) ** 2 + (y / ry) ** 2 + (_v.z / rz) ** 2 < 1;
}

export function insideHeart(p) {
  return Object.values(CHAMBERS).some((ch) => insideChamber(p, ch));
}

// Push a point onto the outer surface of the heart. We walk inwards along the ray from the heart
// centre until we first enter a chamber, then refine by bisection. `offset` lifts the point slightly
// outwards so the artery tube sits ON the surface instead of being buried in it.
export function snapToHull(p, offset = 0) {
  const dir = p.clone().sub(HEART_CENTRE).normalize();
  const at = (t) => HEART_CENTRE.clone().addScaledVector(dir, t);
  const step = 0.004;
  let t = 1.2;                                   // start well outside the heart
  while (t > 0 && !insideHeart(at(t))) t -= step; // walk inwards until we are inside
  let lo = t, hi = t + step;                     // lo is inside, hi is outside: the surface is between
  for (let i = 0; i < 20; i++) {                 // bisection: halve the gap 20 times
    const mid = (lo + hi) / 2;
    if (insideHeart(at(mid))) lo = mid; else hi = mid;
  }
  return at(lo + offset);
}

// Smooth path for one coronary artery, lying on the heart surface.
// 1) smooth curve through the rough guide points  2) sample it  3) snap every sample to the surface
// 4) join the snapped samples into the final curve.
export function buildArteryCurve(controlPoints, samples = 48, offset = 0.012) {
  const rough = new THREE.CatmullRomCurve3(
    controlPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, "centripetal");
  const snapped = rough.getSpacedPoints(samples).map((p) => snapToHull(p, offset));
  return new THREE.CatmullRomCurve3(snapped, false, "centripetal");
}

// Smooth path for a great vessel (no snapping needed).
export function buildVesselCurve(points) {
  return new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, "centripetal");
}