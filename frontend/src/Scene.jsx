import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import Torso from "./Torso.jsx";
import Heart from "./Heart.jsx";
import Arteries from "./Arteries.jsx";
import { VIEWS, arrived, stepToward } from "./views.js";

// Moves the camera when a view button is pressed. `view` = { name, nonce }: the nonce changes on
// every click, so pressing the same button twice still triggers the move.
function CameraRig({ view }) {
  const { camera, controls } = useThree();   // `controls` exists because OrbitControls has makeDefault
  const goal = useRef(null);                 // where we are heading; null = nothing in progress

  useEffect(() => {
    if (view) goal.current = new THREE.Vector3(...VIEWS[view.name].position);
  }, [view]);

  // If the user grabs the scene while we are moving, stop and let them take over.
  useEffect(() => {
    if (!controls) return;
    const cancel = () => { goal.current = null; };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame(() => {                           // runs every frame
    if (!goal.current) return;
    camera.position.copy(stepToward(camera.position, goal.current));
    controls?.update();                      // makes the camera keep looking at the heart
    if (arrived(camera.position, goal.current)) goal.current = null;
  });
  return null;
}

export default function Scene({ probs, selected, onSelect, view, layers }) {
  return (
    <Canvas
      camera={{ position: VIEWS.reset.position, fov: 40 }}
      dpr={[1, 1.5]}                          // cap the pixel ratio: keeps it smooth without a dedicated GPU
      onPointerMissed={() => onSelect(null)}  // clicking empty space clears the selection
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 3, 4]} intensity={1.3} />
      <directionalLight position={[-3, -1, -2]} intensity={0.4} /> {/* soft back light so the rear isn't black */}
      {layers.body && <Torso />}
      <Heart probs={probs} tint={layers.territory} />
      <Arteries probs={probs} selected={selected} onSelect={onSelect} showLabels={layers.labels} />
      {/* drag = rotate, wheel/pinch = zoom; panning off so the heart stays centred */}
      <OrbitControls makeDefault enableDamping enablePan={false} minDistance={1.2} maxDistance={4.5} />
      <CameraRig view={view} />
    </Canvas>
  );
}