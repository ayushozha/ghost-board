import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function latLngToVec3(lat, lng, radius = 1.02) {
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
    if (stance > 0.15) return '#22c55e'   // green
    if (stance < -0.15) return '#ef4444'  // red
    return '#eab308'                       // yellow / neutral
  }
  if (stance === 'positive' || stance === 'supporter') return '#22c55e'
  if (stance === 'negative' || stance === 'opponent') return '#ef4444'
  return '#eab308'
}

const ARCHETYPE_COLORS = {
  vc: '#eab308',
  early_adopter: '#3b82f6',
  skeptic: '#ef4444',
  journalist: '#a855f7',
  competitor: '#f97316',
  regulator: '#ef4444',
}

function colorForPersona(persona) {
  if (persona.archetype && ARCHETYPE_COLORS[persona.archetype]) {
    return ARCHETYPE_COLORS[persona.archetype]
  }
  return stanceColor(persona.stance ?? persona.sentiment ?? 0)
}

// ---------------------------------------------------------------------------
// Star field background
// ---------------------------------------------------------------------------

function Stars({ count = 1500 }) {
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count * 3; i++) {
      arr[i] = (Math.random() - 0.5) * 60
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
      <pointsMaterial color="#ffffff" size={0.04} sizeAttenuation />
    </points>
  )
}

// ---------------------------------------------------------------------------
// Earth sphere + wireframe + glow
// ---------------------------------------------------------------------------

function Earth() {
  const earthRef = useRef()

  useFrame((_, delta) => {
    if (earthRef.current) {
      earthRef.current.rotation.y += delta * 0.03
    }
  })

  return (
    <group ref={earthRef}>
      {/* Solid dark sphere */}
      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <meshPhongMaterial
          color="#1a1a2e"
          emissive="#0a0a1a"
          specular="#333366"
          shininess={5}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Wireframe overlay */}
      <mesh>
        <sphereGeometry args={[1.002, 32, 32]} />
        <meshBasicMaterial
          color="#2a2a4a"
          wireframe
          transparent
          opacity={0.15}
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
      <sphereGeometry args={[1.05, 32, 32]} />
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
// Persona dot with pulsing animation
// ---------------------------------------------------------------------------

function PersonaDot({ position, color, active }) {
  const meshRef = useRef()
  const ringRef = useRef()
  const pulsePhase = useRef(Math.random() * Math.PI * 2)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + pulsePhase.current
    if (meshRef.current) {
      // Subtle breathing animation; stronger when active
      const base = active ? 1.6 : 1.0
      const amp = active ? 0.5 : 0.15
      const s = base + Math.sin(t * (active ? 4 : 2)) * amp
      meshRef.current.scale.set(s, s, s)
    }
    if (ringRef.current) {
      const opacity = active ? 0.6 + Math.sin(t * 3) * 0.3 : 0.25
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

  return (
    <group position={vec}>
      {/* Dot */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Glow ring */}
      <mesh ref={ringRef} quaternion={ringQuaternion}>
        <ringGeometry args={[0.02, 0.04, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Connection arcs between referencing personas
// ---------------------------------------------------------------------------

function ArcLine({ from, to, color = '#6366f1' }) {
  const curve = useMemo(() => {
    const start = latLngToVec3(from[0], from[1], 1.03)
    const end = latLngToVec3(to[0], to[1], 1.03)
    const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(1.4)
    return new THREE.QuadraticBezierCurve3(start, mid, end)
  }, [from, to])

  const points = useMemo(() => curve.getPoints(32), [curve])
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points])

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={0.3} />
    </line>
  )
}

// ---------------------------------------------------------------------------
// Scene (everything inside <Canvas>)
// ---------------------------------------------------------------------------

function GlobeScene({ personas = [], activePersona = null, arcs = [] }) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} color="#404060" />
      <directionalLight position={[5, 3, 5]} intensity={0.8} color="#6366f1" />

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
        <ArcLine key={i} from={arc.from} to={arc.to} color={arc.color} />
      ))}

      {/* Camera controls */}
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        autoRotate
        autoRotateSpeed={0.3}
        minDistance={2}
        maxDistance={8}
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
        camera={{ position: [0, 1, 3.5], fov: 45 }}
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
