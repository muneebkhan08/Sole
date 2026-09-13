"use client";

import { memo } from "react";

import { Canvas } from "@react-three/fiber";
import {
  ContactShadows,
  Grid,
  OrbitControls,
  Sparkles,
} from "@react-three/drei";
import * as THREE from "three";
import { AGENT_IDS, type AgentId, type AgentState } from "@/lib/types";
import { useHqAgents } from "@/components/providers/HqProvider";
import { AgentActor } from "./AgentActor";
import { Stations } from "./Stations";

const Scene = memo(function Scene({
  agents,
}: {
  agents: Record<AgentId, AgentState>;
}) {
  return (
    <>
      <color attach="background" args={["#ebe7df"]} />
      <hemisphereLight intensity={0.9} color="#fffdf8" groundColor="#cbc5b9" />
      <ambientLight intensity={0.32} color="#fff7eb" />
      <directionalLight
        castShadow
        position={[8, 16, 8]}
        intensity={1.35}
        color="#fff5e5"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.00015}
      />
      <pointLight position={[0, 6, 8.2]} color="#e4a174" intensity={0.75} distance={17} />
      <pointLight position={[-8.6, 6, -1.6]} color="#769dcb" intensity={0.62} distance={17} />
      <pointLight position={[8.6, 6, -1.6]} color="#dfa1a7" intensity={0.6} distance={17} />
      <pointLight position={[0, 8, 0]} color="#f4dfb2" intensity={0.8} distance={20} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.26, 0]} receiveShadow>
        <circleGeometry args={[17.1, 96]} />
        <meshStandardMaterial color="#e4e0d6" metalness={0.12} roughness={0.78} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[16.4, 80]} />
        <meshStandardMaterial color="#f1eee6" metalness={0.1} roughness={0.68} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[15.55, 16.35, 80]} />
        <meshStandardMaterial
          color="#b87057"
          emissive="#b87057"
          emissiveIntensity={0.04}
          metalness={0.22}
          roughness={0.45}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[4.6, 4.85, 64]} />
        <meshStandardMaterial
          color="#b87057"
          emissive="#b87057"
          emissiveIntensity={0.03}
          transparent
          opacity={0.7}
        />
      </mesh>

      <Grid
        position={[0, 0.03, 0]}
        args={[32, 32]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#d9d4c9"
        sectionSize={4}
        sectionThickness={0.9}
        sectionColor="#c6beb1"
        fadeDistance={28}
        fadeStrength={1.4}
        infiniteGrid
      />

      <Stations />
      {AGENT_IDS.map((id) => (
        <AgentActor key={id} state={agents[id]} />
      ))}

      <Sparkles count={36} scale={[26, 6, 26]} size={1.4} speed={0.12} color="#c26043" opacity={0.2} />
      <ContactShadows opacity={0.28} scale={28} blur={2.3} far={11} color="#514a3e" />
      <OrbitControls
        enablePan={false}
        minPolarAngle={0.62}
        maxPolarAngle={1.12}
        minDistance={12}
        maxDistance={28}
        enableDamping
        dampingFactor={0.06}
        target={[0, 0.5, 0]}
      />
    </>
  );
});

export function World({ onReady }: { onReady?: () => void }) {
  const agents = useHqAgents();
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 1.75]}
      camera={{ position: [12, 16, 14], fov: 32, near: 0.1, far: 90 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance", stencil: false }}
      onCreated={({ gl }) => {
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFShadowMap;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.94;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        onReady?.();
      }}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
      }}
      resize={{ scroll: false, debounce: 0 }}
    >
      <Scene agents={agents} />
    </Canvas>
  );
}
