import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { VESSELS, buildArteryCurve } from "./anatomy.js";
import { arteryLabelAnchor } from "./arteryLabels.js";
import { NEUTRAL_COLOR,riskColor } from "./riskColor.js";

function ArteryLabel({ id, curve, vessel, selected }) {
  const anchor = useRef();
  const { camera } = useThree();

  useFrame(() => {
    anchor.current?.position.copy(arteryLabelAnchor(id, curve, camera.position));
  });

  const initialPosition = useMemo(() => arteryLabelAnchor(id, curve), [id, curve]);

  return (
    <group ref={anchor} position={initialPosition}>
      <Html
        center
        distanceFactor={4}
        occlude={false}
        zIndexRange={[100000, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div className={`vessel-label${selected ? " selected" : ""}`}>{vessel.name}</div>
      </Html>
    </group>
  );
}

function Artery({ id, vessel, prob, selected, onSelect,showLabels }) {
  const [hovered, setHovered] = useState(false);
  const material = useRef();

  // The path on the heart surface is expensive to compute, so do it once.
  const curve = useMemo(() => buildArteryCurve(vessel.points), [vessel]);

  // The colour we want right now, recomputed only when the probability changes.
  //const target = useMemo(() => new THREE.Color(riskColor(prob)), [prob]);
  const target = useMemo(() => new THREE.Color(prob == null ? NEUTRAL_COLOR : riskColor(prob)), [prob]);

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
      {showLabels && <ArteryLabel id={id} curve={curve} vessel={vessel} selected={selected} />}
    </group>
  );
}

export default function Arteries({ probs, selected, onSelect, showLabels = true }) {
  return (
    <group>
      {Object.entries(VESSELS).map(([id, vessel]) => (
        <Artery key={id} id={id} vessel={vessel} prob={probs[id]} selected={selected === id}
                onSelect={onSelect} showLabels={showLabels} />
      ))}
    </group>
  );
}
