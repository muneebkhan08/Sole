"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Edges, RoundedBox, Text } from "@react-three/drei";
import * as THREE from "three";
import { PLATFORMS } from "@/lib/agents";

const PAPER = "#fffdf8";
const INK = "#36332e";
const WOOD = "#9a7258";
const METAL = "#77746d";

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.18, 0.14, 0.32, 16]} />
        <meshStandardMaterial color="#b66d50" roughness={0.72} />
      </mesh>
      {[-0.28, 0, 0.28].map((rotation, index) => (
        <mesh key={rotation} position={[0, 0.48 + index * 0.035, 0]} rotation={[0.35, rotation, -0.15 + index * 0.15]}>
          <sphereGeometry args={[0.12, 12, 10]} />
          <meshStandardMaterial color={index === 1 ? "#5c8066" : "#6e9278"} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function Monitor({ color, position = [0, 0.78, 0] }: { color: string; position?: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[1.18, 0.72, 0.07]} />
        <meshStandardMaterial color="#484842" metalness={0.28} roughness={0.38} />
      </mesh>
      <mesh position={[0, 0, 0.041]}>
        <planeGeometry args={[1.06, 0.6]} />
        <meshStandardMaterial color="#e9f0eb" emissive={color} emissiveIntensity={0.04} roughness={0.42} />
      </mesh>
      {[0.17, -0.06, -0.23].map((y, index) => (
        <mesh key={y} position={[-0.12, y, 0.049]}>
          <planeGeometry args={[index === 0 ? 0.72 : 0.84, 0.026]} />
          <meshBasicMaterial color={color} transparent opacity={index === 0 ? 0.65 : 0.27} />
        </mesh>
      ))}
      <mesh position={[0, -0.49, 0]}>
        <boxGeometry args={[0.07, 0.28, 0.07]} />
        <meshStandardMaterial color={METAL} metalness={0.55} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.64, 0.04]}>
        <boxGeometry args={[0.42, 0.05, 0.25]} />
        <meshStandardMaterial color={METAL} metalness={0.55} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Desk({ position, rotation, color, title, detail }: { position: [number, number, number]; rotation?: [number, number, number]; color: string; title: string; detail: string }) {
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox castShadow args={[3.8, 0.14, 1.7]} radius={0.06} position={[0, 0.72, 0]}>
        <meshStandardMaterial color={WOOD} roughness={0.62} />
      </RoundedBox>
      {[-1.55, 1.55].flatMap((x) => [-0.6, 0.6].map((z) => [x, z] as const)).map(([x, z]) => (
        <mesh key={`${x}-${z}`} castShadow position={[x, 0.35, z]}>
          <boxGeometry args={[0.09, 0.72, 0.09]} />
          <meshStandardMaterial color={METAL} metalness={0.45} roughness={0.36} />
        </mesh>
      ))}
      <RoundedBox args={[4.35, 0.06, 2.25]} radius={0.12} position={[0, 0.04, 0]}>
        <meshStandardMaterial color="#e4ded3" roughness={0.88} />
      </RoundedBox>
      <Monitor color={color} />
      <mesh position={[-1.24, 0.82, 0.3]} rotation={[-0.02, 0.3, 0.04]}>
        <boxGeometry args={[0.44, 0.02, 0.62]} />
        <meshStandardMaterial color={PAPER} roughness={0.92} />
      </mesh>
      <mesh position={[1.2, 0.82, 0.36]}>
        <cylinderGeometry args={[0.1, 0.1, 0.17, 16]} />
        <meshStandardMaterial color="#d8cdc0" roughness={0.76} />
      </mesh>
      <Text position={[0, 1.56, -0.04]} fontSize={0.2} color={INK} anchorX="center">{title}</Text>
      <Text position={[0, 1.27, -0.04]} fontSize={0.12} color="#79756d" anchorX="center">{detail}</Text>
    </group>
  );
}

function SourceTable({ position, color, label, sub }: { position: [number, number, number]; color: string; label: string; sub: string }) {
  const indicator = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (indicator.current) indicator.current.rotation.y = clock.getElapsedTime() * 0.35;
  });

  return (
    <group position={position}>
      <RoundedBox receiveShadow args={[3.7, 0.1, 2.65]} radius={0.16} position={[0, 0.04, 0]}>
        <meshStandardMaterial color="#e4ded4" roughness={0.88} />
      </RoundedBox>
      <RoundedBox castShadow args={[3.28, 0.14, 2.22]} radius={0.08} position={[0, 0.7, 0]}>
        <meshStandardMaterial color={WOOD} roughness={0.62} />
      </RoundedBox>
      {[-1.32, 1.32].flatMap((x) => [-.82, .82].map((z) => [x, z] as const)).map(([x, z]) => (
        <mesh key={`${x}-${z}`} castShadow position={[x, 0.35, z]}>
          <boxGeometry args={[0.08, .7, .08]} />
          <meshStandardMaterial color={METAL} metalness={.45} roughness={.36} />
        </mesh>
      ))}
      {[-0.9, 0, 0.9].map((x, index) => (
        <RoundedBox key={x} args={[0.7, 0.5, 0.05]} radius={0.04} position={[x, 1.15, -0.36 + index * .05]} rotation={[-0.18, 0, index === 1 ? .05 : -.04]}>
          <meshStandardMaterial color={PAPER} roughness={.94} />
          <Edges color="#c9c0b4" threshold={18} />
        </RoundedBox>
      ))}
      <mesh ref={indicator} position={[0, 1.08, 0.58]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[.28, .03, 8, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={.08} roughness={.45} />
      </mesh>
      <Text position={[0, 1.72, 0]} fontSize={.23} color={INK} anchorX="center">{label}</Text>
      <Text position={[0, 1.42, 0]} fontSize={.12} color="#79756d" anchorX="center">{sub}</Text>
    </group>
  );
}

function StudioTable() {
  return (
    <group>
      <mesh castShadow position={[0, .76, 0]}>
        <cylinderGeometry args={[3.55, 3.55, .18, 64]} />
        <meshStandardMaterial color="#a97c5e" roughness={.62} />
        <Edges color="#76513d" threshold={18} />
      </mesh>
      <mesh castShadow position={[0, .37, 0]}>
        <cylinderGeometry args={[1.12, 1.38, .72, 48]} />
        <meshStandardMaterial color="#77746d" metalness={.45} roughness={.35} />
      </mesh>
      <mesh receiveShadow position={[0, .04, 0]}>
        <cylinderGeometry args={[4.22, 4.22, .08, 64]} />
        <meshStandardMaterial color="#e1dbd0" roughness={.9} />
      </mesh>
      {[[0, .87, 0], [-1.3, .87, -.3], [1.2, .87, .4], [.35, .87, -1.35]].map(([x,y,z], index) => (
        <mesh key={index} position={[x, y, z]} rotation={[0, index * .7, .08]}>
          <boxGeometry args={[.6, .02, .42]} />
          <meshStandardMaterial color={index === 0 ? "#e8c7a5" : PAPER} roughness={.9} />
        </mesh>
      ))}
      <Text position={[0, 1.25, 0]} fontSize={.3} color={INK} anchorX="center">Team table</Text>
      <Text position={[0, 1.0, 0]} fontSize={.12} color="#79756d" anchorX="center">Where the work comes together</Text>
    </group>
  );
}

export function Stations() {
  return (
    <group>
      <StudioTable />
      <SourceTable position={[0, 0, 8.2]} color={PLATFORMS.reddit.color} label="Reddit" sub="threads and comments" />
      <SourceTable position={[-8.6, 0, -1.6]} color={PLATFORMS.facebook.color} label="Facebook" sub="pages and posts" />
      <SourceTable position={[8.6, 0, -1.6]} color={PLATFORMS.instagram.color} label="Instagram" sub="reels and carousels" />
      <Desk position={[0, 0, -8.4]} color="#3d877d" title="Analysis" detail="Find the signal" />
      <Desk position={[-8.4, 0, 6.2]} rotation={[0, Math.PI / 3.4, 0]} color="#766ba8" title="Planning" detail="Shape the response" />
      <Desk position={[8.4, 0, 6.2]} rotation={[0, -Math.PI / 3.4, 0]} color="#b45f79" title="Drafting" detail="Make it ready" />
      <Plant position={[-5.6, 0, 4.2]} />
      <Plant position={[5.8, 0, 4.2]} />
      <Plant position={[-5.9, 0, -5.4]} />
      <Plant position={[5.9, 0, -5.4]} />
    </group>
  );
}
