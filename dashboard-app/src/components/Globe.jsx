import { useRef, useMemo, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
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
// Supports hover and click for tooltip + detail panel
// ---------------------------------------------------------------------------

let _dotSeed = 0
function PersonaDot({ position, color, active, persona, onHover, onClick, isSelected }) {
  const meshRef = useRef()
  const ringRef = useRef()
  const hitRef = useRef()
  // Use a stable seed per instance instead of Math.random() during render
  const [initialPhase] = useState(() => {
    _dotSeed += 1
    return createRng(_dotSeed * 7919)() * Math.PI * 2
  })
  const pulsePhase = useRef(initialPhase)
  const { gl, camera } = useThree()

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + pulsePhase.current
    if (meshRef.current) {
      if (active || isSelected) {
        const pulse = Math.abs(Math.sin(t * Math.PI))
        const s = 1.0 + pulse * 1.0
        meshRef.current.scale.set(s, s, s)
      } else {
        const s = 1.0 + Math.sin(t * 1.5) * 0.12
        meshRef.current.scale.set(s, s, s)
      }
    }
    if (ringRef.current) {
      const opacity = (active || isSelected) ? 0.7 + Math.sin(t * 4) * 0.3 : 0.2
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

  // Project 3D position to 2D screen for tooltip placement
  const getScreenPos = useCallback(() => {
    const projected = vec.clone().project(camera)
    const canvas = gl.domElement
    const rect = canvas.getBoundingClientRect()
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((-projected.y + 1) / 2) * rect.height,
    }
  }, [vec, camera, gl])

  const handlePointerEnter = useCallback((e) => {
    e.stopPropagation()
    gl.domElement.style.cursor = 'pointer'
    if (onHover) {
      onHover({ persona, screenPos: getScreenPos() })
    }
  }, [persona, onHover, getScreenPos, gl])

  const handlePointerLeave = useCallback((e) => {
    e.stopPropagation()
    gl.domElement.style.cursor = 'auto'
    if (onHover) {
      onHover(null)
    }
  }, [onHover, gl])

  const handleClick = useCallback((e) => {
    e.stopPropagation()
    if (onClick) {
      onClick(persona)
    }
  }, [persona, onClick])

  return (
    <group position={vec}>
      {/* Invisible larger hit sphere for easier interaction */}
      <mesh
        ref={hitRef}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
      >
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Emissive dot -- size 0.05 radius, glows like a point light */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[isSelected ? 0.08 : 0.05, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={threeColor}
          emissiveIntensity={isSelected ? 3.5 : 2.0}
          toneMapped={false}
        />
      </mesh>

      {/* Selected ring (larger, brighter) */}
      {isSelected && (
        <mesh quaternion={ringQuaternion}>
          <ringGeometry args={[0.11, 0.18, 20]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

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
      <pointLight color={color} intensity={isSelected ? 0.7 : 0.3} distance={0.8} decay={2} />
    </group>
  )
}

// ---------------------------------------------------------------------------
// Connection arcs between referencing personas -- animated dashes
// ---------------------------------------------------------------------------

function ArcLine({ from, to, color = '#6366f1', active = false }) {
  const pulseARef = useRef()
  const pulseBRef = useRef()
  const pulseCRef = useRef()
  const lineMaterialRef = useRef()
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

  const points = useMemo(() => curve.getPoints(48), [curve])
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const speed = active ? 0.22 : 0.12
    const baseT = ((t * speed + phaseOffset) % 1 + 1) % 1
    const secondaryT = (baseT + 0.38) % 1
    const tertiaryT = (baseT + 0.7) % 1

    if (pulseARef.current) {
      pulseARef.current.position.copy(curve.getPointAt(baseT))
      pulseARef.current.scale.setScalar(active ? 1.15 : 0.85)
    }
    if (pulseBRef.current) {
      pulseBRef.current.position.copy(curve.getPointAt(secondaryT))
      pulseBRef.current.scale.setScalar(active ? 0.95 : 0.65)
    }
    if (pulseCRef.current) {
      pulseCRef.current.position.copy(curve.getPointAt(tertiaryT))
      pulseCRef.current.scale.setScalar(active ? 0.75 : 0.5)
    }
    // Pulse the line opacity for active arcs
    if (lineMaterialRef.current) {
      const pulse = 0.5 + Math.sin(t * 3 + phaseOffset * Math.PI * 2) * 0.2
      lineMaterialRef.current.opacity = active ? pulse : 0.25
    }
  })

  return (
    <group>
      {/* Base arc line */}
      <line geometry={geometry}>
        <lineBasicMaterial
          ref={lineMaterialRef}
          color={color}
          transparent
          opacity={active ? 0.7 : 0.25}
        />
      </line>

      {/* Three animated pulse dots traveling along arc */}
      <mesh ref={pulseARef}>
        <sphereGeometry args={[0.033, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.95 : 0.65} />
      </mesh>

      <mesh ref={pulseBRef}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.85 : 0.5} />
      </mesh>

      <mesh ref={pulseCRef}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.7 : 0.35} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Scene (everything inside <Canvas>)
// ---------------------------------------------------------------------------

function GlobeScene({ personas = [], activePersona = null, arcs = [], onHover, onClick, selectedPersona }) {
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
          isSelected={selectedPersona === (p.name || i)}
          persona={p}
          onHover={onHover}
          onClick={onClick}
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
// Tooltip overlay (HTML, positioned over canvas)
// ---------------------------------------------------------------------------

function TooltipOverlay({ tooltip }) {
  if (!tooltip) return null
  const { persona, screenPos } = tooltip
  const latestMsg = persona.messages && persona.messages.length > 0
    ? persona.messages[persona.messages.length - 1]
    : null
  const latestPost = latestMsg?.content || persona.post || persona.message || ''

  const stanceVal = persona.stance ?? persona.sentiment ?? 0
  let stanceText = 'Neutral'
  let stanceColor = '#ffaa00'
  if (typeof stanceVal === 'number') {
    if (stanceVal > 0.15) { stanceText = 'Positive'; stanceColor = '#00ff88' }
    else if (stanceVal < -0.15) { stanceText = 'Negative'; stanceColor = '#ff4444' }
  } else if (stanceVal === 'positive' || stanceVal === 'supporter') {
    stanceText = 'Positive'; stanceColor = '#00ff88'
  } else if (stanceVal === 'negative' || stanceVal === 'opponent') {
    stanceText = 'Negative'; stanceColor = '#ff4444'
  }

  const TOOLTIP_WIDTH = 220
  const TOOLTIP_OFFSET_X = 14
  const TOOLTIP_OFFSET_Y = -10

  // Clamp tooltip within viewport
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = screenPos.x + TOOLTIP_OFFSET_X
  let top = screenPos.y + TOOLTIP_OFFSET_Y

  if (left + TOOLTIP_WIDTH > vw - 10) left = screenPos.x - TOOLTIP_WIDTH - TOOLTIP_OFFSET_X
  if (top < 10) top = 10
  if (top + 120 > vh - 10) top = vh - 130

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        width: TOOLTIP_WIDTH,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <div style={{
        background: 'rgba(10, 10, 30, 0.95)',
        border: '1px solid rgba(99,102,241,0.4)',
        borderRadius: 10,
        padding: '10px 12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 16px rgba(99,102,241,0.15)',
        backdropFilter: 'blur(12px)',
      }}>
        {/* Name row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: colorForPersona(persona),
            display: 'inline-block', flexShrink: 0,
            boxShadow: `0 0 6px ${colorForPersona(persona)}`,
          }} />
          <span style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
            {persona.name || 'Unknown'}
          </span>
          {persona.archetype && (
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              color: ARCHETYPE_COLORS[persona.archetype] || '#6b7280',
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${ARCHETYPE_COLORS[persona.archetype] || '#6b7280'}30`,
              borderRadius: 4, padding: '1px 5px', marginLeft: 'auto',
            }}>
              {persona.archetype}
            </span>
          )}
        </div>

        {/* Company + stance */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: latestPost ? 7 : 0 }}>
          {persona.company && (
            <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>
              {persona.company}
            </span>
          )}
          <span style={{ fontSize: 10, color: stanceColor, fontFamily: 'monospace', marginLeft: 'auto' }}>
            {stanceText}
          </span>
        </div>

        {/* Latest post */}
        {latestPost && (
          <div style={{
            fontSize: 10, color: '#94a3b8', lineHeight: 1.5,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: 7, marginTop: 2,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            &ldquo;{latestPost}&rdquo;
          </div>
        )}

        {/* Hint */}
        <div style={{ fontSize: 9, color: '#475569', marginTop: 6, fontFamily: 'monospace' }}>
          Click for full profile
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Exported Globe component
// ---------------------------------------------------------------------------

export default function Globe({ personas = [], activePersona = null, arcs = [], onPersonaHover, onPersonaClick, selectedPersona = null }) {
  const [tooltip, setTooltip] = useState(null)

  const handleHover = useCallback((info) => {
    setTooltip(info)
    if (onPersonaHover) onPersonaHover(info ? info.persona : null)
  }, [onPersonaHover])

  const handleClick = useCallback((persona) => {
    if (onPersonaClick) onPersonaClick(persona)
  }, [onPersonaClick])

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', position: 'relative' }}>
      <Canvas
        camera={{ position: [0, 1.5, 6], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <GlobeScene
          personas={personas}
          activePersona={activePersona}
          arcs={arcs}
          onHover={handleHover}
          onClick={handleClick}
          selectedPersona={selectedPersona}
        />
      </Canvas>
      <TooltipOverlay tooltip={tooltip} />
    </div>
  )
}
