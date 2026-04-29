const POSE_CONNECTIONS = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15],
  [12, 14], [14, 16],
  [23, 25], [25, 27], [27, 29], [29, 31],
  [24, 26], [26, 28], [28, 30], [30, 32],
]

const SEGMENT_KEYS = {
  '11,13': 'leftUpperArm',  '13,15': 'leftForearm',
  '12,14': 'rightUpperArm', '14,16': 'rightForearm',
  '11,12': 'shoulders',     '23,24': 'hips',
  '23,25': 'leftThigh',     '25,27': 'leftShin',
  '24,26': 'rightThigh',    '26,28': 'rightShin',
  '27,29': 'leftAnkle',     '28,30': 'rightAnkle',
  '29,31': 'leftFoot',      '30,32': 'rightFoot',
  '11,23': 'leftTorso',     '12,24': 'rightTorso',
}

const STATUS_COLORS = {
  good: '#22c55e', warn: '#f59e0b', needs_work: '#ef4444',
  default: 'rgba(255,255,255,0.6)',
}

const METRIC_ANNOTATION_MAP = {
  footAngle:       { landmarks: [27,28,29,30,31,32], label: 'Foot not turned out'  },
  stanceWidth:     { landmarks: [27,28],             label: 'Widen stance'          },
  penultimateStep: { landmarks: [25,26,27,28],       label: 'Load deeper'           },
  armSwingBack:    { landmarks: [13,14,15,16],       label: 'Load arms back'        },
  bodyAngle:       { landmarks: [11,12,23,24],       label: 'Lean forward more'     },
  armDrive:        { landmarks: [13,14,15,16],       label: 'Drive arms up'         },
  jumpHeight:      { landmarks: [27,28],             label: 'Explode higher'        },
  elbowHeight:     { landmarks: [13,14],             label: 'Elbow too low'         },
  armExtension:    { landmarks: [14,16],             label: 'Extend arm fully'      },
  contactPoint:    { landmarks: [15,16],             label: 'Contact in front'      },
  nonHittingArm:   { landmarks: [13,15],             label: 'Pull down guide arm'   },
  hipRotation:     { landmarks: [23,24,11,12],       label: 'Rotate hips through'   },
  wrapAround:      { landmarks: [14,16],             label: 'Wrap arm around'       },
}

export const FRAME_TO_PHASE = {
  'approach-start':   'approach',
  'penultimate-step': 'approach',
  'takeoff':          'takeoff',
  'peak-jump':        'contact',
  'contact':          'contact',
  'follow-through':   'followThrough',
}

// Calculate the actual rendered area of the video inside the canvas.
// object-contain means the video may have black bars on sides or top/bottom.
export function getVideoRenderBounds(canvas, videoWidth, videoHeight) {
  if (!videoWidth || !videoHeight) {
    return { x: 0, y: 0, width: canvas.width, height: canvas.height }
  }
  const canvasAspect = canvas.width / canvas.height
  const videoAspect  = videoWidth / videoHeight

  if (videoAspect > canvasAspect) {
    // Wider than canvas — black bars on top and bottom
    const renderW = canvas.width
    const renderH = canvas.width / videoAspect
    return { x: 0, y: (canvas.height - renderH) / 2, width: renderW, height: renderH }
  } else {
    // Taller than canvas — black bars on left and right
    const renderH = canvas.height
    const renderW = canvas.height * videoAspect
    return { x: (canvas.width - renderW) / 2, y: 0, width: renderW, height: renderH }
  }
}

// Convert a normalized landmark (0-1) to canvas pixel coords, accounting for letterboxing
function landmarkToCanvas(landmark, bounds) {
  return {
    x: landmark.x * bounds.width  + bounds.x,
    y: landmark.y * bounds.height + bounds.y,
  }
}

function getSegmentColor(key, scoredSegments) {
  const score = scoredSegments?.[key]
  if (!score) return STATUS_COLORS.default
  return STATUS_COLORS[score.status] || STATUS_COLORS.default
}

// bounds = getVideoRenderBounds(canvas, videoWidth, videoHeight)
export function drawSkeleton(canvas, landmarks, scoredSegments = {}, bounds) {
  if (!canvas || !landmarks) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const b = bounds || { x: 0, y: 0, width: canvas.width, height: canvas.height }

  const dpr       = window.devicePixelRatio || 1
  const lineWidth = Math.max(2, 3 / dpr)
  const radius    = Math.max(4, 5 / dpr)

  for (const [a, b2] of POSE_CONNECTIONS) {
    const lmA = landmarks[a], lmB = landmarks[b2]
    if (!lmA || !lmB || (lmA.visibility ?? 1) < 0.3 || (lmB.visibility ?? 1) < 0.3) continue
    const key   = `${a},${b2}`
    const color = getSegmentColor(SEGMENT_KEYS[key], scoredSegments)
    const pA = landmarkToCanvas(lmA, b)
    const pB = landmarkToCanvas(lmB, b)
    ctx.beginPath()
    ctx.moveTo(pA.x, pA.y)
    ctx.lineTo(pB.x, pB.y)
    ctx.strokeStyle = color
    ctx.lineWidth   = lineWidth
    ctx.lineCap     = 'round'
    ctx.stroke()
  }

  const KEY_JOINTS = [11,12,13,14,15,16,23,24,25,26,27,28]
  for (const idx of KEY_JOINTS) {
    const lm = landmarks[idx]
    if (!lm || (lm.visibility ?? 1) < 0.3) continue
    const p = landmarkToCanvas(lm, b)
    ctx.beginPath()
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
    ctx.fillStyle   = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'
    ctx.lineWidth   = 1
    ctx.stroke()
  }
}

export function drawAnnotations(canvas, landmarks, phaseData, isPaused, pulsePhase = 0, bounds) {
  if (!canvas || !landmarks || !phaseData) return
  const ctx = canvas.getContext('2d')
  const b   = bounds || { x: 0, y: 0, width: canvas.width, height: canvas.height }
  const labeled = new Set()

  for (const [metricKey, mapping] of Object.entries(METRIC_ANNOTATION_MAP)) {
    if (phaseData[metricKey] !== 'needs_work') continue

    for (const lmIdx of mapping.landmarks) {
      const lm = landmarks[lmIdx]
      if (!lm || (lm.visibility ?? 1) < 0.25) continue
      const p = landmarkToCanvas(lm, b)

      const pulse  = Math.sin(pulsePhase * Math.PI * 2) * 3
      const r      = 11 + pulse

      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth   = 2.5
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(p.x, p.y, r * 0.5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(239,68,68,0.3)'
      ctx.fill()
    }

    if (isPaused && !labeled.has(metricKey)) {
      const anchorLm = mapping.landmarks.map(i => landmarks[i]).find(lm => lm && (lm.visibility ?? 1) >= 0.25)
      if (anchorLm) {
        labeled.add(metricKey)
        drawLabel(ctx, canvas, landmarkToCanvas(anchorLm, b), mapping.label)
      }
    }
  }
}

function drawLabel(ctx, canvas, p, text) {
  const fontSize = Math.max(11, Math.round(canvas.width / 52))
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`
  const tw   = ctx.measureText(text).width
  const padX = 7, padY = 4
  const boxW = tw + padX * 2
  const boxH = fontSize + padY * 2

  let lx = p.x - boxW / 2
  let ly = p.y - 24 - boxH
  lx = Math.max(4, Math.min(canvas.width - boxW - 4, lx))
  if (ly < 4) ly = p.y + 20

  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(lx, ly, boxW, boxH, 5)
  } else {
    ctx.rect(lx, ly, boxW, boxH)
  }
  ctx.fillStyle = 'rgba(239,68,68,0.92)'
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, lx + padX, ly + padY + fontSize * 0.85)

  ctx.beginPath()
  ctx.moveTo(p.x, p.y - 14)
  ctx.lineTo(lx + boxW / 2, ly + boxH)
  ctx.strokeStyle = 'rgba(239,68,68,0.55)'
  ctx.lineWidth   = 1.5
  ctx.stroke()
}
