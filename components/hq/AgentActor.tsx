"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, RoundedBox, Text } from "@react-three/drei";
import * as THREE from "three";
import { AGENTS, HOME, STATIONS } from "@/lib/agents";
import type { AgentId, AgentState } from "@/lib/types";

const DEFAULT_STATION: Record<AgentId, string> = {
  scrapper: "reddit",
  analyzer: "analyze",
  planner: "plan",
  poster: "post",
};

const SPREAD: Record<AgentId, [number, number]> = {
  scrapper: [1.15, 1.15],
  analyzer: [-1.15, 1.15],
  planner: [-1.15, -1.15],
  poster: [1.15, -1.15],
};

const WALK_PHASE: Record<AgentId, number> = {
  scrapper: 0.8,
  analyzer: 2.3,
  planner: 4.1,
  poster: 5.7,
};

function setTarget(state: AgentState, now: number, out: THREE.Vector3) {
  const home = HOME[state.id];
  // Benched by the router: stand on the home pad instead of roaming, so the
  // floor shows at a glance who this brief actually woke up.
  if (!state.assigned) {
    out.set(home[0], 0, home[1]);
    return;
  }
  if (state.status === "listening") {
    const [x, z] = SPREAD[state.id];
    out.set(x, 0, z);
    return;
  }
  if (state.status === "working") {
    const key = state.platform ?? DEFAULT_STATION[state.id];
    const [x, z] = STATIONS[key] ?? home;
    out.set(x + 1.35, 0, z + 0.15);
    return;
  }
  if (state.status === "done") {
    out.set(home[0], 0, home[1]);
    return;
  }
  const t = now * 0.18 + SPREAD[state.id][0];
  out.set(home[0] + Math.cos(t) * 1.15, 0, home[1] + Math.sin(t * 0.9) * 1.15);
}

export function AgentActor({ state }: { state: AgentState }) {
  const group = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Mesh>(null);
  const rightLeg = useRef<THREE.Mesh>(null);
  const leftArm = useRef<THREE.Mesh>(null);
  const rightArm = useRef<THREE.Mesh>(null);
  const shard = useRef<THREE.Mesh>(null);
  const pos = useRef(new THREE.Vector3(HOME[state.id][0], 0, HOME[state.id][1]));
  const target = useRef(new THREE.Vector3());
  const walk = useRef(WALK_PHASE[state.id]);
  const color = AGENTS[state.id].color;
  const name = useMemo(() => AGENTS[state.id].name, [state.id]);
  const showSpeech =
    state.assigned && (state.status === "working" || state.status === "listening");

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    setTarget(state, performance.now() / 1000, target.current);
    const dx = target.current.x - pos.current.x;
    const dz = target.current.z - pos.current.z;
    const dist = Math.hypot(dx, dz);
    const moving = dist > 0.12;
    if (moving) {
      const step = Math.min(2.6 * dt, dist);
      pos.current.x += (dx / dist) * step;
      pos.current.z += (dz / dist) * step;
      const yaw = Math.atan2(dx, dz);
      g.rotation.y = THREE.MathUtils.damp(g.rotation.y, yaw, 8, dt);
    }
    const bob =
      state.status === "done"
        ? Math.abs(Math.sin(performance.now() / 260)) * 0.045
        : moving
          ? Math.abs(Math.sin(walk.current)) * 0.06
          : Math.sin(performance.now() / 520 + walk.current) * 0.03;
    g.position.set(pos.current.x, bob, pos.current.z);
    walk.current += dt * (moving ? 9.5 : 1.6);
    const swing = Math.sin(walk.current) * (moving ? 0.72 : 0.08);
    if (leftLeg.current) leftLeg.current.rotation.x = swing;
    if (rightLeg.current) rightLeg.current.rotation.x = -swing;
    if (leftArm.current) leftArm.current.rotation.x = -swing * 0.7;
    if (rightArm.current) rightArm.current.rotation.x = swing * 0.7;
    if (shard.current) shard.current.rotation.y = walk.current;
  });

  return (
    <group ref={group}>
      <mesh castShadow position={[-0.14, 0.28, 0]} ref={leftLeg}>
        <capsuleGeometry args={[0.09, 0.34, 4, 8]} />
        <meshStandardMaterial color="#504d48" roughness={0.72} />
      </mesh>
      <mesh castShadow position={[0.14, 0.28, 0]} ref={rightLeg}>
        <capsuleGeometry args={[0.09, 0.34, 4, 8]} />
        <meshStandardMaterial color="#504d48" roughness={0.72} />
      </mesh>
      <mesh castShadow position={[-0.14, 0.09, 0.07]}>
        <boxGeometry args={[0.19, 0.09, 0.28]} />
        <meshStandardMaterial color="#36332e" roughness={0.68} />
      </mesh>
      <mesh castShadow position={[0.14, 0.09, 0.07]}>
        <boxGeometry args={[0.19, 0.09, 0.28]} />
        <meshStandardMaterial color="#36332e" roughness={0.68} />
      </mesh>
      <RoundedBox castShadow args={[0.62, 0.78, 0.42]} radius={0.12} position={[0, 0.95, 0]}>
        <meshStandardMaterial color={color} metalness={0.08} roughness={0.55} />
      </RoundedBox>
      <mesh castShadow position={[-0.4, 1.02, 0]} ref={leftArm}>
        <capsuleGeometry args={[0.07, 0.34, 4, 8]} />
        <meshStandardMaterial color="#655e58" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0.4, 1.02, 0]} ref={rightArm}>
        <capsuleGeometry args={[0.07, 0.34, 4, 8]} />
        <meshStandardMaterial color="#655e58" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 1.52, 0]}>
        <sphereGeometry args={[0.29, 24, 24]} />
        <meshStandardMaterial color="#e3c2aa" roughness={0.72} />
      </mesh>
      <mesh position={[0, 1.68, 0.01]} scale={[1.01, 0.62, 1]}>
        <sphereGeometry args={[0.29, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#423d39" roughness={0.82} />
      </mesh>
      {[-0.09, 0.09].map((x) => (
        <mesh key={x} position={[x, 1.53, 0.267]}>
          <sphereGeometry args={[0.025, 12, 12]} />
          <meshStandardMaterial color="#37322e" roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 0.99, 0.225]}>
        <boxGeometry args={[0.19, 0.28, 0.012]} />
        <meshStandardMaterial color="#f8f5ee" roughness={0.64} />
      </mesh>
      <mesh position={[0, 0.95, 0.225]}>
        <planeGeometry args={[0.32, 0.01]} />
        <meshStandardMaterial color={color} roughness={0.42} />
      </mesh>
      <pointLight position={[0, 1.7, 0.4]} color={color} intensity={0.32} distance={2.8} />

      {state.id === "scrapper" ? (
        <>
          <mesh position={[-0.46, 1.08, 0.14]} rotation={[0.2, 0, 0.15]}>
            <boxGeometry args={[0.26, 0.38, 0.04]} />
            <meshStandardMaterial color="#45423c" roughness={0.54} />
          </mesh>
          <mesh ref={shard} position={[0.55, 1.15, 0]}>
            <octahedronGeometry args={[0.12, 0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.16} />
          </mesh>
        </>
      ) : null}
      {state.id === "analyzer" ? (
        <group position={[0, 1.53, 0.275]}>
          {[-0.09, 0.09].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <torusGeometry args={[0.075, 0.008, 8, 16]} />
              <meshStandardMaterial color="#33312d" metalness={0.35} roughness={0.42} />
            </mesh>
          ))}
          <mesh position={[0, 0, 0]}><boxGeometry args={[0.04, 0.008, 0.008]} /><meshStandardMaterial color="#33312d" /></mesh>
        </group>
      ) : null}
      {state.id === "planner" ? (
        <mesh position={[0.42, 0.85, 0.18]} rotation={[0.15, -0.4, 0.2]}>
          <boxGeometry args={[0.28, 0.38, 0.04]} />
          <meshStandardMaterial color="#faf8f2" emissive={color} emissiveIntensity={0.04} />
        </mesh>
      ) : null}
      {state.id === "poster" ? (
        <mesh position={[0.43, 1.05, 0.12]} rotation={[0.1, 0, -0.2]}>
          <boxGeometry args={[0.12, 0.25, 0.035]} />
          <meshStandardMaterial color="#35322e" roughness={0.48} />
        </mesh>
      ) : null}

      <Billboard position={[0, 2.12, 0]} follow>
        <Text
          fontSize={0.14}
          color="#3f3c37"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.006}
          outlineColor="#f8f7f3"
          letterSpacing={0.04}
        >
          {name}
        </Text>
      </Billboard>
      {showSpeech && state.line ? (
        <Billboard position={[0, 2.42, 0]} follow>
          <Text
            fontSize={0.11}
            color="#6d6b65"
            anchorX="center"
            anchorY="middle"
            maxWidth={1.8}
            outlineWidth={0.004}
            outlineColor="#f8f7f3"
          >
            {state.line}
          </Text>
        </Billboard>
      ) : null}
    </group>
  );
}
