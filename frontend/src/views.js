import * as THREE from "three";

// Camera positions for the view buttons. The heart sits at the origin and the patient faces +z.
export const VIEWS = {
  front: { label: "Front", position: [0, 0.1, 2.7] },
  left: { label: "Left side", position: [2.7, 0.1, 0] },   // the patient's left is +x
  back: { label: "Back", position: [0, 0.1, -2.7] },
  right: { label: "Right side", position: [-2.7, 0.1, 0] },
  reset: { label: "Reset", position: [0.6, 0.2, 2.6] },     // same as the starting camera
};

// One animation step of the camera towards `goal`. We move round the heart (angles) instead of in a
// straight line, so going from front to back swings AROUND the heart instead of through it.
export function stepToward(position, goal, rate = 0.12) {
  const cur = new THREE.Spherical().setFromVector3(position);
  const tgt = new THREE.Spherical().setFromVector3(goal);
  // shortest way round the circle (so 350 degrees -> 10 degrees goes +20, not -340)
  const dTheta = Math.atan2(Math.sin(tgt.theta - cur.theta), Math.cos(tgt.theta - cur.theta));
  cur.theta += dTheta * rate;
  cur.phi += (tgt.phi - cur.phi) * rate;
  cur.radius += (tgt.radius - cur.radius) * rate;
  return new THREE.Vector3().setFromSpherical(cur);
}

export const arrived = (position, goal) => position.distanceTo(goal) < 0.01;