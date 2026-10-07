import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CHAMBERS, GREAT_VESSELS, VESSELS, buildVesselCurve } from "./anatomy.js";
import { NEUTRAL_COLOR, riskColor } from "./riskColor.js";
import { chamberWeights, shadeVertex } from "./territory.js";

const IDS = Object.keys(VESSELS); // ["lad", "lcx", "rca"]
const EASE = 0.12;                // each frame, move 12% of the way to the target (smooth fades)

// One large vessel (aorta, pulmonary trunk, vena cava): a tube along a smooth curve.
function GreatVessel({ points, radius, color }) {
  const curve = useMemo(() => buildVesselCurve(points), [points]); // build once, not on every render
  return (
    <mesh>
      <tubeGeometry args={[curve, 48, radius, 16, false]} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  );
}

// Everything the frame loop changes lives in ONE object kept in a ref (React never re-renders for it):
// what is on screen for each artery, plus two scratch colours.
function makeFrameState() {
  return {
    colors: Object.fromEntries(IDS.map((id) => [id, new THREE.Color(NEUTRAL_COLOR)])), // colour shown per artery
    amounts: Object.fromEntries(IDS.map((id) => [id, 0])),                              // how visible its tint is (0..1)
    goal: new THREE.Color(),         // scratch: the colour we are heading towards
    vertexColor: new THREE.Color(),  // scratch: the colour being computed for one vertex
    dirty: true,                     // forces one repaint on the first frame
  };
}

// One heart chamber: a stretched, tilted sphere whose surface colour (per vertex) is tinted by the
// risk of the arteries running over it.
function Chamber({ ch, probs, tint }) {
  const mesh = useRef();
  const state = useRef(null);

  // A sphere mesh that also carries a "color" value for every vertex (filled in by the frame loop).
  const geometry = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 56, 40);
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
    return g;
  }, []);

  // How close every vertex is to each artery. Fixed for this shape, so computed once (about 20 ms).
  const weights = useMemo(() => chamberWeights(geometry, ch), [geometry, ch]);
  const base = useMemo(() => new THREE.Color(ch.color), [ch]);

  useFrame(() => {
    state.current ??= makeFrameState(); // created on the first frame
    const s = state.current;

    let changed = s.dirty;
    for (const id of IDS) {
      const p = probs[id];
      // target visibility: 1 when we have a prediction and shading is on, otherwise fade out to 0
      const goalAmount = tint && p != null ? 1 : 0;
      if (Math.abs(goalAmount - s.amounts[id]) > 0.002) {
        s.amounts[id] += (goalAmount - s.amounts[id]) * EASE;
        changed = true;
      }
      if (p != null) {
        s.goal.set(riskColor(p));
        const c = s.colors[id];
        if (Math.abs(c.r - s.goal.r) + Math.abs(c.g - s.goal.g) + Math.abs(c.b - s.goal.b) > 0.004) {
          c.lerp(s.goal, EASE);
          changed = true;
        }
      }
    }
    if (!changed) return; // nothing moving: do no work this frame

    // Repaint every vertex, then tell the GPU the colours changed.
    const colorAttribute = mesh.current.geometry.attributes.color;
    for (let i = 0; i < colorAttribute.count; i++) {
      shadeVertex(s.vertexColor, base, weights, i, s.amounts, s.colors);
      colorAttribute.setXYZ(i, s.vertexColor.r, s.vertexColor.g, s.vertexColor.b);
    }
    colorAttribute.needsUpdate = true;
    s.dirty = false;
  });

  return (
    // The sphere is stretched to the chamber's radii and tilted about z. vertexColors makes the
    // material use the per-vertex colours above (the material's own colour stays white).
    <mesh ref={mesh} geometry={geometry} position={ch.centre} rotation={[0, 0, ch.tilt]} scale={ch.radii}>
      <meshStandardMaterial vertexColors roughness={0.55} />
    </mesh>
  );
}

// A stylised heart: four chambers plus the great vessels. `probs` = { lad, lcx, rca } (null = no prediction).
export default function Heart({ probs, tint }) {
  return (
    <group>
      {Object.entries(CHAMBERS).map(([key, ch]) => (
        <Chamber key={key} ch={ch} probs={probs} tint={tint} />
      ))}
      {Object.entries(GREAT_VESSELS).map(([key, v]) => (
        <GreatVessel key={key} {...v} />
      ))}
    </group>
  );
}