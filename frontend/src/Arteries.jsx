import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { VESSELS, buildArteryCurve } from "./anatomy.js";
import { NEUTRAL_COLOR, riskColor } from "./riskColor.js";

const HEART_ORIGIN = new THREE.Vector3(0, 0, 0);

function makeLabelCandidates(curve, id) {
  // Use several points rather than one fixed point. This prevents labels from
  // being placed behind a chamber or large vessel for a particular camera view.
  const tValues =
    id === "lad"
      ? [0.42, 0.5, 0.58, 0.66, 0.74]
      : [0.24, 0.3, 0.38, 0.46, 0.54];

  return tValues.map((t) => {
    const point = curve.getPoint(t);
    const outward = point.clone().sub(HEART_ORIGIN).normalize();

    // Keep the HTML anchor slightly outside the artery/heart surface.
    const anchor = point.clone().addScaledVector(outward, 0.065);

    return {
      point: anchor,
      outward,
    };
  });
}

function chooseLabelCandidate(candidates, camera) {
  let best = candidates[0];
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const toCamera = camera.position
      .clone()
      .sub(candidate.point)
      .normalize();

    // Prefer anchors whose outward-facing side points toward the camera.
    // A small distance term avoids unnecessary jumps between candidates.
    const facing = candidate.outward.dot(toCamera);
    const distance = camera.position.distanceTo(candidate.point);
    const score = facing - distance * 0.001;

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function Artery({ id, vessel, prob, selected, onSelect, showLabels }) {
  const [hovered, setHovered] = useState(false);
  const material = useRef();
  const labelGroup = useRef();
  const { camera } = useThree();

  // The path on the heart surface is expensive to compute, so build it once.
  const curve = useMemo(() => buildArteryCurve(vessel.points), [vessel]);

  // Multiple candidate anchors make label placement robust across camera angles.
  const labelCandidates = useMemo(
    () => makeLabelCandidates(curve, id),
    [curve, id],
  );

  // Move the label group without causing React re-renders every frame.
  useFrame(() => {
    const meshMaterial = material.current;

    if (meshMaterial) {
      meshMaterial.color.lerp(target, 0.12);
      meshMaterial.emissive.copy(meshMaterial.color);
    }

    if (labelGroup.current && showLabels) {
      const candidate = chooseLabelCandidate(labelCandidates, camera);
      labelGroup.current.position.copy(candidate.point);
    }
  });

  // The colour we want right now.
  const target = useMemo(
    () => new THREE.Color(prob == null ? NEUTRAL_COLOR : riskColor(prob)),
    [prob],
  );

  // Show a pointer cursor while hovering; always restore it when stopping/unmounting.
  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "auto";

    return () => {
      document.body.style.cursor = "auto";
    };
  }, [hovered]);

  // Selected arteries are drawn thicker; hovered ones are slightly thicker.
  const radius = vessel.radius * (selected ? 1.35 : hovered ? 1.15 : 1);

  return (
    <group>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onSelect(selected ? null : id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <tubeGeometry args={[curve, 120, radius, 12, false]} />
        <meshStandardMaterial
          ref={material}
          color="#888888"
          emissiveIntensity={selected ? 0.6 : 0.12}
          roughness={0.35}
        />
      </mesh>

      {showLabels && (
        <group ref={labelGroup}>
          <Html
            center
            distanceFactor={4}
            occlude={false}
            zIndexRange={[1000, 0]}
            style={{
              pointerEvents: "none",
              zIndex: 1000,
            }}
          >
            <div className={`vessel-label${selected ? " selected" : ""}`}>
              {vessel.name}
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

export default function Arteries({
  probs,
  selected,
  onSelect,
  showLabels = true,
}) {
  return (
    <group>
      {Object.entries(VESSELS).map(([id, vessel]) => (
        <Artery
          key={id}
          id={id}
          vessel={vessel}
          prob={probs[id]}
          selected={selected === id}
          onSelect={onSelect}
          showLabels={showLabels}
        />
      ))}
    </group>
  );
}