import { useRef, useMemo, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

// Deterministic pseudo-random number generator (mulberry32)
function createRng(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function latLngToVec3(lat, lng, radius = 2.04) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  )
}

function stanceColor(stance) {
  if (typeof stance === 'number') {
    if (stance > 0.2) return '#00ff88'    // green
    if (stance < -0.2) return '#ff4444'   // red
    return '#ffaa00'                       // yellow / neutral
  }
  if (stance === 'positive' || stance === 'supporter') return '#00ff88'
  if (stance === 'negative' || stance === 'opponent') return '#ff4444'
  return '#ffaa00'
}

const ARCHETYPE_COLORS = {
  vc: '#ffaa00',
  early_adopter: '#00ff88',
  skeptic: '#ff4444',
  journalist: '#a855f7',
  competitor: '#f97316',
  regulator: '#ff4444',
}

function colorForPersona(persona) {
  if (persona.archetype && ARCHETYPE_COLORS[persona.archetype]) {
    return ARCHETYPE_COLORS[persona.archetype]
  }
  return stanceColor(persona.stance ?? persona.sentiment ?? 0)
}

// ---------------------------------------------------------------------------
// Star field background -- 500 white dots in a large sphere shell
// ---------------------------------------------------------------------------

function Stars({ count = 500 }) {
  const positions = useMemo(() => {
    const rng = createRng(42)
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      // Distribute on a spherical shell at radius ~30-50
      const r = 30 + rng() * 20
      const theta = rng() * Math.PI * 2
      const phi = Math.acos(2 * rng() - 1)
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      arr[i * 3 + 2] = r * Math.cos(phi)
    }
    return arr
  }, [count])

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={count}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.08} sizeAttenuation />
    </points>
  )
}

// ---------------------------------------------------------------------------
// Earth sphere (radius 2) + wireframe overlay + glow
// ---------------------------------------------------------------------------

function Earth() {
  const earthRef = useRef()

  useFrame(() => {
    if (earthRef.current) {
      // 0.002 rad/frame auto-rotation
      earthRef.current.rotation.y += 0.002
    }
  })

  return (
    <group ref={earthRef}>
      {/* Solid dark sphere */}
      <mesh>
        <sphereGeometry args={[2, 64, 64]} />
        <meshPhongMaterial
          color="#1a1a3e"
          emissive="#0a0a1e"
          specular="#333366"
          shininess={5}
          transparent
          opacity={0.92}
        />
      </mesh>

      {/* Wireframe overlay */}
      <mesh>
        <sphereGeometry args={[2.004, 36, 36]} />
        <meshBasicMaterial
          color="#2a2a5e"
          wireframe
          transparent
          opacity={0.18}
        />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Atmosphere glow (additive blending shader)
// ---------------------------------------------------------------------------

const glowVertexShader = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const glowFragmentShader = `
  uniform float c;
  uniform float p;
  uniform vec3 glowColor;
  varying vec3 vNormal;
  void main() {
    float intensity = pow(c - dot(vNormal, vec3(0.0, 0.0, 1.0)), p);
    gl_FragColor = vec4(glowColor, intensity * 0.5);
  }
`

function Atmosphere() {
  const uniforms = useMemo(
    () => ({
      c: { value: 0.4 },
      p: { value: 4.0 },
      glowColor: { value: new THREE.Color(0x4f46e5) },
    }),
    []
  )

  return (
    <mesh>
      <sphereGeometry args={[2.1, 32, 32]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={glowVertexShader}
        fragmentShader={glowFragmentShader}
        side={THREE.BackSide}
        transparent
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Persona dot -- pointLight-like emissive sphere with pulse on activity
// ---------------------------------------------------------------------------

let _dotSeed = 0
function PersonaDot({ position, color, active }) {
  const meshRef = useRef()
  const ringRef = useRef()
  // Use a stable seed per instance instead of Math.random() during render
  const [initialPhase] = useState(() => {
    _dotSeed += 1
    return createRng(_dotSeed * 7919)() * Math.PI * 2
  })
  const pulsePhase = useRef(initialPhase)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + pulsePhase.current
    if (meshRef.current) {
      if (active) {
        // New post pulse: scale up to 2x over 500ms then back down
        // Using a sharp sine pulse: period ~1s (up 0.5s, down 0.5s)
        const pulse = Math.abs(Math.sin(t * Math.PI)) // 0..1 at ~1Hz
        const s = 1.0 + pulse * 1.0 // ranges 1x to 2x
        meshRef.current.scale.set(s, s, s)
      } else {
        // Subtle breathing
        const s = 1.0 + Math.sin(t * 1.5) * 0.12
        meshRef.current.scale.set(s, s, s)
      }
    }
    if (ringRef.current) {
      const opacity = active ? 0.7 + Math.sin(t * 4) * 0.3 : 0.2
      ringRef.current.material.opacity = Math.max(0, opacity)
    }
  })

  const vec = useMemo(() => latLngToVec3(position[0], position[1]), [position])

  // Ring orientation: look at center
  const ringQuaternion = useMemo(() => {
    const m = new THREE.Matrix4()
    m.lookAt(vec, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0))
    const q = new THREE.Quaternion()
    q.setFromRotationMatrix(m)
    return q
  }, [vec])

  const threeColor = useMemo(() => new THREE.Color(color), [color])

  return (
    <group position={vec}>
      {/* Emissive dot -- size 0.05 radius, glows like a point light */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={threeColor}
          emissiveIntensity={2.0}
          toneMapped={false}
        />
      </mesh>

      {/* Glow ring */}
      <mesh ref={ringRef} quaternion={ringQuaternion}>
        <ringGeometry args={[0.06, 0.1, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Tiny point light to cast glow onto globe surface */}
      <pointLight color={color} intensity={0.3} distance={0.8} decay={2} />
    </group>
  )
}

// ---------------------------------------------------------------------------
// Connection arcs between referencing personas
// ---------------------------------------------------------------------------

function ArcLine({ from, to, color = '#6366f1', active = false }) {
  const pulseARef = useRef()
  const pulseBRef = useRef()
  const [phaseOffset] = useState(() => {
    _dotSeed += 1
    return createRng(_dotSeed * 1543)()
  })

  const curve = useMemo(() => {
    const start = latLngToVec3(from[0], from[1], 2.06)
    const end = latLngToVec3(to[0], to[1], 2.06)
    const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(2.8)
    return new THREE.QuadraticBezierCurve3(start, mid, end)
  }, [from, to])

  const points = useMemo(() => curve.getPoints(32), [curve])
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points])

  useFrame(({ clock }) => {
    const speed = active ? 0.18 : 0.1
    const baseT = (clock.getElapsedTime() * speed + phaseOffset) % 1
    const secondaryT = (baseT + 0.45) % 1

    if (pulseARef.current) {
      pulseARef.current.position.copy(curve.getPointAt(baseT))
      pulseARef.current.scale.setScalar(active ? 1.1 : 0.8)
    }
    if (pulseBRef.current) {
      pulseBRef.current.position.copy(curve.getPointAt(secondaryT))
      pulseBRef.current.scale.setScalar(active ? 0.95 : 0.65)
    }
  })

  return (
    <group>
      <line geometry={geometry}>
        <lineBasicMaterial color={color} transparent opacity={active ? 0.85 : 0.3} />
      </line>

      <mesh ref={pulseARef}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.95 : 0.65} />
      </mesh>

      <mesh ref={pulseBRef}>
        <sphereGeometry args={[0.022, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.85 : 0.45} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Scene (everything inside <Canvas>)
// ---------------------------------------------------------------------------

function GlobeScene({ personas = [], activePersona = null, arcs = [] }) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} color="#404060" />
      <directionalLight position={[5, 3, 5]} intensity={0.8} color="#6366f1" />
      <directionalLight position={[-3, -2, -4]} intensity={0.3} color="#a855f7" />

      {/* Stars */}
      <Stars />

      {/* Earth */}
      <Earth />
      <Atmosphere />

      {/* Persona dots */}
      {personas.map((p, i) => (
        <PersonaDot
          key={p.name || i}
          position={[p.lat ?? 0, p.lng ?? 0]}
          color={colorForPersona(p)}
          active={activePersona === (p.name || i)}
        />
      ))}

      {/* Arcs */}
      {arcs.map((arc, i) => (
        <ArcLine
          key={arc.id || i}
          from={arc.from}
          to={arc.to}
          color={arc.color}
          active={Boolean(arc.active)}
        />
      ))}

      {/* Camera controls -- drag to rotate, damping enabled */}
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        autoRotate
        autoRotateSpeed={0.3}
        minDistance={3.5}
        maxDistance={12}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Exported Globe component
// ---------------------------------------------------------------------------

export default function Globe({ personas = [], activePersona = null, arcs = [] }) {
  return (
    <div style={{ width: '100%', height: '100%', background: '#000' }}>
      <Canvas
        camera={{ position: [0, 1.5, 6], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <GlobeScene
          personas={personas}
          activePersona={activePersona}
          arcs={arcs}
        />
      </Canvas>
    </div>
  )
}
