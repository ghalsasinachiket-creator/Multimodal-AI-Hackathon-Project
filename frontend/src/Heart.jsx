import { useMemo } from "react";
import { CHAMBERS, GREAT_VESSELS, buildVesselCurve } from "./anatomy.js";

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

// A stylised heart: four chambers (ellipsoids) plus the great vessels.
// This is a placeholder shape; a real .glb mesh can replace it later without touching the arteries code.
export default function Heart() {
  return (
    <group>
      {Object.entries(CHAMBERS).map(([key, ch]) => (
        // A unit sphere, stretched to the chamber's radii and tilted about z.
        <mesh key={key} position={ch.centre} rotation={[0, 0, ch.tilt]} scale={ch.radii}>
          <sphereGeometry args={[1, 40, 28]} />
          <meshStandardMaterial color={ch.color} roughness={0.55} />
        </mesh>
      ))}
      {Object.entries(GREAT_VESSELS).map(([key, v]) => (
        <GreatVessel key={key} {...v} />
      ))}
    </group>
  );
}