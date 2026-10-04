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
      <Shell centre={[0, -0.1, -0.05]} radii={[1.25, 1.7, 0.78]} color="#9db4c8" opacity={0.1} />
      <Shell centre={[-0.85, 0.1, -0.05]} radii={[0.5, 0.85, 0.42]} color="#d9a0a8" opacity={0.14} />
      <Shell centre={[0.85, 0.1, -0.05]} radii={[0.46, 0.82, 0.4]} color="#d9a0a8" opacity={0.14} />
    </group>
  );
}