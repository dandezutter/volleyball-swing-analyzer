import { useRef, useEffect, useState, useCallback } from 'react'

const CONNECTIONS = [
  [11,12],[11,23],[12,24],[23,24],
  [11,13],[13,15],[12,14],[14,16],
  [23,25],[25,27],[27,29],[29,31],
  [24,26],[26,28],[28,30],[30,32],
  [0,11],[0,12],
]

const FRAME_LABELS = {
  'approach-start':   'Approach Start',
  'penultimate-step': 'Penultimate Step',
  'takeoff':          'Takeoff',
  'peak-jump':        'Peak Jump',
  'contact':          'Contact',
  'follow-through':   'Follow-Through',
}

// Perspective project a 3D point to 2D canvas coords
function project(x, y, z, rotY, rotX, canvas, zoom) {
  // Apply Y rotation (horizontal spin)
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY)
  const rx1 = x * cosY - z * sinY
  const ry1 = y
  const rz1 = x * sinY + z * cosY

  // Apply X rotation (tilt up/down)
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX)
  const rx2 = rx1
  const ry2 = ry1 * cosX - rz1 * sinX
  const rz2 = ry1 * sinX + rz1 * cosX

  const depth = 3.5 + rz2  // push back so we don't clip through origin
  const scale = (canvas.width * 0.38 * zoom) / depth

  return {
    x: canvas.width  / 2 + rx2 * scale,
    y: canvas.height / 2 + ry2 * scale,
    scale,
    depth,
  }
}

// Normalise landmarks to a centered, unit-height skeleton
function normaliseLandmarks(lms) {
  if (!lms || lms.length < 29) return null
  const visible = lms.filter(l => l && (l.visibility ?? 1) > 0.1)
  if (!visible.length) return null

  // Centre around hip midpoint
  const lh = lms[23], rh = lms[24]
  const cx = lh && rh ? (lh.x + rh.x) / 2 : 0.5
  const cy = lh && rh ? (lh.y + rh.y) / 2 : 0.5
  const cz = lh && rh ? ((lh.z ?? 0) + (rh.z ?? 0)) / 2 : 0

  // Scale so shoulder-to-hip distance ≈ 1 unit
  const ls = lms[11], rs = lms[12]
  const shoulderCy = ls && rs ? (ls.y + rs.y) / 2 : cy - 0.15
  const scale = Math.abs(shoulderCy - cy) > 0.01 ? 1 / Math.abs(shoulderCy - cy) : 5

  return lms.map(l => {
    if (!l) return null
    return {
      x: (l.x - cx) * scale,
      y: (l.y - cy) * scale,
      z: ((l.z ?? 0) - cz) * scale,
      visibility: l.visibility ?? 1,
    }
  })
}

function draw3D(canvas, landmarks, rotY, rotX, zoom) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Dark gradient background
  const bg = ctx.createRadialGradient(
    canvas.width/2, canvas.height/2, 0,
    canvas.width/2, canvas.height/2, canvas.width/2
  )
  bg.addColorStop(0, '#1e2a3a')
  bg.addColorStop(1, '#0a0f1a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const lms = normaliseLandmarks(landmarks)
  if (!lms) return

  // Project all landmarks
  const pts = lms.map(l => l ? project(l.x, l.y, l.z, rotY, rotX, canvas, zoom) : null)

  // Sort connections by avg depth (painter's algorithm — draw far ones first)
  const sortedConns = [...CONNECTIONS]
    .filter(([a,b]) => pts[a] && pts[b])
    .sort((connA, connB) => {
      const dA = (pts[connA[0]].depth + pts[connA[1]].depth) / 2
      const dB = (pts[connB[0]].depth + pts[connB[1]].depth) / 2
      return dB - dA
    })

  // Draw bones
  for (const [a, b] of sortedConns) {
    const pA = pts[a], pB = pts[b]
    const avgDepth = (pA.depth + pB.depth) / 2
    const alpha    = Math.max(0.3, Math.min(1, 1 - (avgDepth - 2) * 0.15))
    const lw       = Math.max(1.5, Math.min(5, pA.scale * 0.06))

    ctx.beginPath()
    ctx.moveTo(pA.x, pA.y)
    ctx.lineTo(pB.x, pB.y)

    // Colour by body region
    const isArm  = [11,12,13,14,15,16].some(i => i === a || i === b)
    const isLeg  = [23,24,25,26,27,28,29,30,31,32].some(i => i === a || i === b)
    const isTors = [11,12,23,24].includes(a) && [11,12,23,24].includes(b)

    if (isArm)       ctx.strokeStyle = `rgba(96,165,250,${alpha})`   // blue
    else if (isLeg)  ctx.strokeStyle = `rgba(74,222,128,${alpha})`   // green
    else if (isTors) ctx.strokeStyle = `rgba(251,191,36,${alpha})`   // yellow
    else             ctx.strokeStyle = `rgba(200,200,200,${alpha})`

    ctx.lineWidth = lw
    ctx.lineCap   = 'round'
    ctx.stroke()
  }

  // Draw joints
  const KEY_JOINTS = [0,11,12,13,14,15,16,23,24,25,26,27,28]
  for (const idx of KEY_JOINTS) {
    const p  = pts[idx]
    const lm = lms[idx]
    if (!p || !lm || lm.visibility < 0.2) continue

    const r     = Math.max(2, Math.min(7, p.scale * 0.04))
    const alpha = Math.max(0.4, Math.min(1, 1 - (p.depth - 2) * 0.12))

    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fillStyle   = `rgba(255,255,255,${alpha})`
    ctx.fill()
    ctx.strokeStyle = `rgba(0,0,0,${alpha * 0.5})`
    ctx.lineWidth   = 1
    ctx.stroke()
  }

  // Floor grid hint
  const gridY = Math.max(...KEY_JOINTS.map(i => pts[i]?.y ?? 0)) + 12
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth   = 1
  for (let i = -3; i <= 3; i++) {
    const gp1 = project(i * 0.5, 0, -3, rotY, rotX, canvas, zoom)
    const gp2 = project(i * 0.5, 0,  3, rotY, rotX, canvas, zoom)
    ctx.beginPath(); ctx.moveTo(gp1.x, gp1.y); ctx.lineTo(gp2.x, gp2.y); ctx.stroke()
    const gp3 = project(-3, 0, i * 0.5, rotY, rotX, canvas, zoom)
    const gp4 = project( 3, 0, i * 0.5, rotY, rotX, canvas, zoom)
    ctx.beginPath(); ctx.moveTo(gp3.x, gp3.y); ctx.lineTo(gp4.x, gp4.y); ctx.stroke()
  }
}

export default function Skeleton3DViewer({ keyFrames, initialFrame, onClose }) {
  const canvasRef   = useRef(null)
  const rotYRef     = useRef(Math.PI / 6)
  const rotXRef     = useRef(-0.15)
  const zoomRef     = useRef(1)
  const dragging    = useRef(false)
  const lastPos     = useRef({ x: 0, y: 0 })
  const rafRef      = useRef(null)

  const [activeFrame, setActiveFrame] = useState(initialFrame)
  const [autoRotate,  setAutoRotate]  = useState(true)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !activeFrame?.landmarks) return
    draw3D(canvas, activeFrame.landmarks, rotYRef.current, rotXRef.current, zoomRef.current)
  }, [activeFrame])

  // Animation loop
  useEffect(() => {
    let running = true
    function tick() {
      if (!running) return
      if (autoRotate) rotYRef.current += 0.008
      redraw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [autoRotate, redraw])

  // Resize canvas to container
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.clientWidth
      canvas.height = canvas.clientHeight
      redraw()
    })
    ro.observe(canvas)
    canvas.width  = canvas.clientWidth
    canvas.height = canvas.clientHeight
    return () => ro.disconnect()
  }, [redraw])

  // Mouse / touch drag
  function onPointerDown(e) {
    dragging.current = true
    setAutoRotate(false)
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    lastPos.current = { x: clientX, y: clientY }
  }
  function onPointerMove(e) {
    if (!dragging.current) return
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    rotYRef.current += (clientX - lastPos.current.x) * 0.01
    rotXRef.current += (clientY - lastPos.current.y) * 0.008
    rotXRef.current = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotXRef.current))
    lastPos.current = { x: clientX, y: clientY }
  }
  function onPointerUp() { dragging.current = false }
  function onWheel(e) {
    e.preventDefault()
    zoomRef.current = Math.max(0.4, Math.min(2.5, zoomRef.current - e.deltaY * 0.001))
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="flex flex-col flex-1 max-w-2xl w-full mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/80">
          <div>
            <h2 className="font-bold text-sm">3D Skeleton View</h2>
            <p className="text-xs text-slate-400">Drag to rotate · Scroll to zoom</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRotate(v => !v)}
              className={`text-xs px-3 py-1 rounded-full border transition ${
                autoRotate ? 'border-purple-500 text-purple-300' : 'border-slate-600 text-slate-400'
              }`}
            >
              {autoRotate ? '⟳ Auto' : '⟳ Off'}
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none px-2">✕</button>
          </div>
        </div>

        {/* 3D canvas */}
        <canvas
          ref={canvasRef}
          className="flex-1 w-full cursor-grab active:cursor-grabbing touch-none"
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onMouseLeave={onPointerUp}
          onTouchStart={onPointerDown}
          onTouchMove={onPointerMove}
          onTouchEnd={onPointerUp}
          onWheel={onWheel}
        />

        {/* Frame selector */}
        <div className="px-3 py-2 bg-slate-900/80 flex gap-2 overflow-x-auto">
          {keyFrames.map(kf => (
            <button
              key={kf.label}
              onClick={() => { setActiveFrame(kf); setAutoRotate(false) }}
              className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap border transition flex-shrink-0 ${
                activeFrame?.label === kf.label
                  ? 'border-purple-500 text-purple-300 bg-purple-900/30'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              {FRAME_LABELS[kf.label] || kf.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
