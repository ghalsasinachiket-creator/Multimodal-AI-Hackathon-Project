import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Torso from "./Torso.jsx";
import Heart from "./Heart.jsx";
import Arteries from "./Arteries.jsx";

export default function Scene({ probs, selected, onSelect }) {
  return (
    <Canvas
      camera={{ position: [0.6, 0.2, 2.6], fov: 40 }}
      dpr={[1, 1.5]}                          // cap the pixel ratio: keeps it smooth without a dedicated GPU
      onPointerMissed={() => onSelect(null)}  // clicking empty space clears the selection
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 3, 4]} intensity={1.3} />
      <directionalLight position={[-3, -1, -2]} intensity={0.4} /> {/* soft back light so the rear isn't black */}
      <Torso />
      <Heart />
      <Arteries probs={probs} selected={selected} onSelect={onSelect} />
      {/* drag = rotate, wheel/pinch = zoom; panning off so the heart stays centred */}
      <OrbitControls makeDefault enableDamping enablePan={false} minDistance={1.2} maxDistance={4.5} />
    </Canvas>
  );
}