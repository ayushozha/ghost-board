import { useRef, useMemo, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Sphere, Stars, Html } from '@react-three/drei'
import * as THREE from 'three'

// ── Helpers ──────────────────────────────────────────────────────────

/** Convert latitude / longitude (degrees) to a 3D position on a sphere. */
function latLngToXYZ(lat, lng, radius) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return [
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ]
}

/** Pick a dot colour based on stance value. */
function stanceColor(stance) {
  if (stance > 0.2) return '#10b981'  // green
  if (stance < -0.2) return '#ef4444' // red
  return '#f59e0b'                     // yellow / neutral
}

// ── Earth sphere with grid lines ─────────────────────────────────────

function EarthSphere() {
  const meshRef = useRef()

  // Grid-line material (latitude / longitude wireframe)
  const gridTexture = useMemo(() => {
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')

    // Dark ocean fill
    ctx.fillStyle = '#0c1222'
    ctx.fillRect(0, 0, size, size)

    // Grid lines
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.18)'
    ctx.lineWidth = 1

    // Latitude lines (every 15 degrees -> 12 lines across 180 degrees)
    const latLines = 12
    for (let i = 0; i <= latLines; i++) {
      const y = (i / latLines) * size
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(size, y)
      ctx.stroke()
    }

    // Longitude lines (every 15 degrees -> 24 lines across 360 degrees)
    const lngLines = 24
    for (let i = 0; i <= lngLines; i++) {
      const x = (i / lngLines) * size
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, size)
      ctx.stroke()
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
  }, [])

  return (
    <Sphere ref={meshRef} args={[2, 64, 64]}>
      <meshStandardMaterial
        map={gridTexture}
        transparent
        opacity={0.9}
        roughness={0.8}
        metalness={0.1}
      />
    </Sphere>
  )
}

// ── Atmosphere glow ring ─────────────────────────────────────────────

function Atmosphere() {
  return (
    <Sphere args={[2.06, 64, 64]}>
      <meshBasicMaterial
        color="#3b82f6"
        transparent
        opacity={0.06}
        side={THREE.BackSide}
      />
    </Sphere>
  )
}

// ── Single persona dot (instanced for perf, but we use individual
//    meshes here since count is typically < 200 and we want hover) ────

function PersonaDot({ position, color, name, text, stance, isPulsing }) {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)

  useFrame((state) => {
    if (!meshRef.current) return
    if (isPulsing) {
      // Pulse scale between 1.0 and 1.6
      const t = Math.sin(state.clock.elapsedTime * 3) * 0.3 + 1.3
      meshRef.current.scale.setScalar(t)
    } else {
      meshRef.current.scale.setScalar(hovered ? 1.5 : 1)
    }
  })

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Outer glow */}
      <mesh>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} />
      </mesh>
      {/* Tooltip on hover */}
      {hovered && (
        <Html distanceFactor={6} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              background: 'rgba(10,10,15,0.92)',
              border: '1px solid #2a2a3a',
              borderRadius: 6,
              padding: '6px 10px',
              color: '#e5e7eb',
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              maxWidth: 200,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.4,
            }}
          >
            <div style={{ color, fontWeight: 700, marginBottom: 2 }}>{name}</div>
            <div style={{ color: '#9ca3af', fontSize: 10 }}>
              Stance: {stance >= 0 ? '+' : ''}{stance?.toFixed(2)}
            </div>
            {text && (
              <div style={{ marginTop: 4, color: '#e5e7eb', fontSize: 10 }}>
                {text.length > 120 ? text.slice(0, 120) + '...' : text}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  )
}

// ── Persona dots layer ───────────────────────────────────────────────

function PersonaDots({ personas }) {
  if (!personas || personas.length === 0) return null

  return (
    <group>
      {personas.map((p, i) => {
        if (p.lat == null || p.lng == null) return null
        const pos = latLngToXYZ(p.lat, p.lng, 2.08)
        const color = stanceColor(p.stance || 0)
        // Consider "pulsing" if persona has recent posts (heuristic: has content)
        const isPulsing = Boolean(p.posts?.length > 0 || p.content)
        return (
          <PersonaDot
            key={`${p.name}-${i}`}
            position={pos}
            color={color}
            name={p.name || `Persona ${i}`}
            text={p.content || p.posts?.[0] || ''}
            stance={p.stance || 0}
            isPulsing={isPulsing}
          />
        )
      })}
    </group>
  )
}

// ── Auto-rotating group ──────────────────────────────────────────────

function RotatingGroup({ children }) {
  const groupRef = useRef()

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.08
    }
  })

  return <group ref={groupRef}>{children}</group>
}

// ── Main Globe component (exported) ──────────────────────────────────

/**
 * 3D Globe visualisation for the Market Arena.
 *
 * Props:
 *   personas – array of { name, archetype, lat, lng, stance, posts, content }
 *   style    – optional style object for the container div
 *   className – optional extra classes for the container div
 */
export default function Globe({ personas = [], style, className }) {
  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 400,
        background: 'radial-gradient(ellipse at center, #0c1222 0%, #060610 100%)',
        borderRadius: 12,
        overflow: 'hidden',
        ...style,
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 5.5], fov: 45 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: 'transparent' }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 3, 5]} intensity={0.8} color="#e0e7ff" />
        <pointLight position={[-5, -3, -5]} intensity={0.3} color="#3b82f6" />

        {/* Stars background */}
        <Stars radius={80} depth={60} count={2500} factor={4} saturation={0} fade speed={0.5} />

        {/* Rotating globe + dots */}
        <RotatingGroup>
          <EarthSphere />
          <Atmosphere />
          <PersonaDots personas={personas} />
        </RotatingGroup>

        {/* User orbit controls */}
        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={3.5}
          maxDistance={10}
          rotateSpeed={0.5}
          zoomSpeed={0.6}
          autoRotate={false}
        />
      </Canvas>

      {/* Legend overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 16,
          display: 'flex',
          gap: 14,
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          pointerEvents: 'none',
        }}
      >
        <span style={{ color: '#10b981' }}>&#9679; Positive</span>
        <span style={{ color: '#f59e0b' }}>&#9679; Neutral</span>
        <span style={{ color: '#ef4444' }}>&#9679; Negative</span>
      </div>

      {/* Persona count badge */}
      {personas.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 16,
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            color: '#9ca3af',
            background: 'rgba(10,10,15,0.7)',
            padding: '3px 8px',
            borderRadius: 4,
            border: '1px solid #2a2a3a',
            pointerEvents: 'none',
          }}
        >
          {personas.filter(p => p.lat != null && p.lng != null).length} plotted
        </div>
      )}
    </div>
  )
}
