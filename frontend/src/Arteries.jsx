import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { VESSELS, buildArteryCurve } from "./anatomy.js";
import { riskColor } from "./riskColor.js";

function Artery({ id, vessel, prob, selected, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const material = useRef();

  // The path on the heart surface is expensive to compute, so do it once.
  const curve = useMemo(() => buildArteryCurve(vessel.points), [vessel]);
  const labelPosition = useMemo(() => curve.getPoint(0.3), [curve]);

  // The colour we want right now, recomputed only when the probability changes.
  const target = useMemo(() => new THREE.Color(riskColor(prob)), [prob]);

  // Every frame, move the current colour 12% of the way towards the target: a smooth fade, not a jump.
  useFrame(() => {
    const m = material.current;
    if (!m) return;
    m.color.lerp(target, 0.12);
    m.emissive.copy(m.color); // let the artery glow in its own colour
  });

  // Show a pointer cursor while hovering; always restore it when we stop or unmount.
  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "auto";
    return () => { document.body.style.cursor = "auto"; };
  }, [hovered]);

  // Selected arteries are drawn thicker, hovered ones slightly thicker.
  const radius = vessel.radius * (selected ? 1.35 : hovered ? 1.15 : 1);

  return (
    <group>
      <mesh
        onClick={(e) => { e.stopPropagation(); onSelect(selected ? null : id); }} // stopPropagation: don't count as a click on the background
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}
      >
        <tubeGeometry args={[curve, 120, radius, 12, false]} />
        {/* A constant starting colour: the useFrame fade above then animates it to the risk colour. */}
        <meshStandardMaterial ref={material} color="#888888" emissiveIntensity={selected ? 0.6 : 0.12} roughness={0.35} />
      </mesh>
      <Html position={labelPosition} center distanceFactor={4} style={{ pointerEvents: "none" }}>
        <div className={`vessel-label${selected ? " selected" : ""}`}>{vessel.name}</div>
      </Html>
    </group>
  );
}

export default function Arteries({ probs, selected, onSelect }) {
  return (
    <group>
      {Object.entries(VESSELS).map(([id, vessel]) => (
        <Artery key={id} id={id} vessel={vessel} prob={probs[id]} selected={selected === id} onSelect={onSelect} />
      ))}
    </group>
  );
}