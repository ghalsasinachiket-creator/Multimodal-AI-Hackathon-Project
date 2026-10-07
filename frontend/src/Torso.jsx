// Faint, see-through body context: a torso shell and two lungs, so the heart has somewhere to sit.
// depthWrite={false} + renderOrder keep the transparent shapes from hiding the opaque heart behind them.
function Shell({ centre, radii, color, opacity }) {
  return (
    <mesh position={centre} scale={radii} renderOrder={-1}>
      <sphereGeometry args={[1, 32, 24]} />
      <meshStandardMaterial color={color} transparent opacity={opacity} depthWrite={false} roughness={0.9} />
    </mesh>
  );
}

export default function Torso() {
  return (
    <group>
      {/* wider torso so the lungs fit inside it */}
      <Shell centre={[0, -0.1, -0.05]} radii={[1.45, 1.7, 0.8]} color="#9db4c8" opacity={0.08} />
      {/* lungs pushed outwards: inner edges at x = ±0.62, clear of the heart (which reaches ±0.55) */}
      <Shell centre={[-1.0, 0.1, -0.05]} radii={[0.38, 0.8, 0.36]} color="#d9a0a8" opacity={0.1} />
      <Shell centre={[1.0, 0.1, -0.05]} radii={[0.38, 0.78, 0.34]} color="#d9a0a8" opacity={0.1} />
    </group>
  );
}