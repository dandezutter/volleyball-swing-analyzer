import { angleBetween } from './frameExtractor.js'

// Analyze extracted frames using volleyball biomechanics rules
// Returns scoredSegments (for canvas overlay) and a structured summary for Claude
export function analyzeFrames(frames) {
  const approachStart = frames.find(f => f.label === 'approach-start')
  const penultimate   = frames.find(f => f.label === 'penultimate-step')
  const approachDirection = (approachStart?.landmarks && penultimate?.landmarks)
    ? Math.sign((penultimate.landmarks[0]?.x ?? 0) - (approachStart.landmarks[0]?.x ?? 0)) || 1
    : 1

  // Determine net orientation: compare shoulder line angle to camera
  // If shoulders are mostly parallel to camera (small x-spread), player faces net
  const contactFrame = frames.find(f => f.label === 'contact')
  const netOrientation = detectNetOrientation(contactFrame?.landmarks)

  // Estimate vertical jump height using approach frames as standing baseline
  const standingFrames = frames.filter(f =>
    f.label === 'approach-start' || f.label === 'penultimate-step'
  )
  const peakFrame = frames.find(f => f.label === 'peak-jump')
  const jumpHeightEstimate = estimateJumpHeight(standingFrames, peakFrame)

  const frameResults = frames.map(f => analyzeFrame(f, approachDirection, netOrientation))

  // Attach jump height to peak-jump frame result
  const peakResult = frameResults.find(f => f.label === 'peak-jump')
  if (peakResult && jumpHeightEstimate !== null) {
    peakResult.metrics.estimatedJumpHeightNorm = jumpHeightEstimate
    peakResult.scores.jumpHeight = {
      status: jumpHeightEstimate > 0.12 ? 'good' : jumpHeightEstimate > 0.07 ? 'warn' : 'needs_work',
      color:  jumpHeightEstimate > 0.12 ? '#22c55e' : jumpHeightEstimate > 0.07 ? '#f59e0b' : '#ef4444',
    }
  }

  const scoredSegments = buildScoredSegments(frameResults)
  const summary = buildSummary(frameResults)
  return { scoredSegments, summary, frameResults, netOrientation }
}

// --- Metric helpers ---

function footForwardPosition(lm, approachDirection) {
  const la = lm[27], ra = lm[28]
  if (!la || !ra) return { forward: 'unknown' }
  const leftIsForward = approachDirection > 0 ? la.x > ra.x : la.x < ra.x
  return { forward: leftIsForward ? 'left' : 'right', deltaX: Math.abs(la.x - ra.x) }
}

function footOpenAngle(lm, ankleIdx, toeIdx) {
  // Near 0° = open/rotated (good), near 90° = closed/square (needs work)
  const ankle = lm[ankleIdx], toe = lm[toeIdx]
  if (!ankle || !toe || (ankle.visibility ?? 1) < 0.3 || (toe.visibility ?? 1) < 0.3) return null
  return Math.round(Math.atan2(Math.abs(toe.y - ankle.y), Math.abs(toe.x - ankle.x)) * 180 / Math.PI)
}

function stanceWidthRatio(lm) {
  const la = lm[27], ra = lm[28], ls = lm[11], rs = lm[12]
  if (!la || !ra || !ls || !rs) return null
  const shoulderW = Math.abs(ls.x - rs.x)
  return shoulderW < 0.01 ? null : parseFloat((Math.abs(la.x - ra.x) / shoulderW).toFixed(2))
}

function bodyLeanAngle(lm) {
  // Angle of shoulder-midpoint → hip-midpoint from vertical; 10-30° = good forward lean
  const ls = lm[11], rs = lm[12], lh = lm[23], rh = lm[24]
  if (!ls || !rs || !lh || !rh) return null
  const sMidX = (ls.x + rs.x) / 2, sMidY = (ls.y + rs.y) / 2
  const hMidX = (lh.x + rh.x) / 2, hMidY = (lh.y + rh.y) / 2
  return Math.round(Math.atan2(Math.abs(sMidX - hMidX), Math.abs(sMidY - hMidY)) * 180 / Math.PI)
}

function armDriveHeight(lm) {
  // Positive = wrists above hips (good arm drive)
  const lw = lm[15], rw = lm[16], lh = lm[23], rh = lm[24]
  if (!lw || !rw || !lh || !rh) return null
  return parseFloat(((lh.y + rh.y) / 2 - (lw.y + rw.y) / 2).toFixed(3))
}

function detectNetOrientation(lm) {
  // Determine if the player is facing the camera (facing net) or side-on.
  // "facing net" = shoulders are mostly perpendicular to camera (small x-spread relative to body)
  // Returns: 'facing_net' | 'side_on' | 'quarter_turn' | 'unknown'
  if (!lm) return 'unknown'
  const ls = lm[11], rs = lm[12], lh = lm[23], rh = lm[24]
  if (!ls || !rs || !lh || !rh) return 'unknown'
  const shoulderSpread = Math.abs(ls.x - rs.x)
  const hipSpread      = Math.abs(lh.x - rh.x)
  const bodyHeight     = Math.abs(((ls.y + rs.y) / 2) - ((lh.y + rh.y) / 2))
  if (bodyHeight < 0.01) return 'unknown'
  // Ratio of shoulder spread to estimated full-shoulder width
  // Side-on: shoulders appear very narrow; facing: they appear wide
  const spreadRatio = shoulderSpread / Math.max(hipSpread, 0.05)
  if (spreadRatio < 0.4)  return 'facing_net'
  if (spreadRatio < 0.75) return 'quarter_turn'
  return 'side_on'
}

function estimateJumpHeight(standingFrames, peakFrame) {
  if (!peakFrame?.landmarks || !standingFrames.length) return null
  const standingAnkleYs = standingFrames
    .map(f => f.landmarks ? (((f.landmarks[27]?.y ?? 0) + (f.landmarks[28]?.y ?? 0)) / 2) : null)
    .filter(v => v !== null && v > 0)
  if (!standingAnkleYs.length) return null
  const standingAvg = standingAnkleYs.reduce((a, b) => a + b, 0) / standingAnkleYs.length
  const peakAnkleY  = ((peakFrame.landmarks[27]?.y ?? 0) + (peakFrame.landmarks[28]?.y ?? 0)) / 2
  return parseFloat(Math.max(0, standingAvg - peakAnkleY).toFixed(3))
}

function shoulderRotationVsNet(lm, netOrientation) {
  // Measure shoulder rotation in the context of the player's orientation to the net.
  // For a side-on approach, we expect shoulder-to-hip rotation (axial twist).
  // For facing-net approach, we look at shoulder tilt angle.
  const ls = lm[11], rs = lm[12], lh = lm[23], rh = lm[24]
  if (!ls || !rs || !lh || !rh) return null

  const shoulderAngleRad = Math.atan2(rs.y - ls.y, rs.x - ls.x)
  const hipAngleRad      = Math.atan2(rh.y - lh.y, rh.x - lh.x)
  const rotationDeg      = Math.abs((shoulderAngleRad - hipAngleRad) * 180 / Math.PI)

  // For side-on approaches, threshold is higher (player winds up more visibly)
  const goodThreshold = netOrientation === 'side_on' ? 12 : 8
  const warnThreshold = netOrientation === 'side_on' ? 6  : 4

  return {
    degrees: Math.round(rotationDeg),
    status:  rotationDeg >= goodThreshold ? 'good' : rotationDeg >= warnThreshold ? 'warn' : 'needs_work',
    netOrientation,
  }
}

// --- Frame analysis ---

function analyzeFrame(frame, approachDirection = 1, netOrientation = 'unknown') {
  const lm = frame.landmarks
  if (!lm) return { label: frame.label, metrics: {}, scores: {} }

  const metrics = {}
  const scores = {}

  if (frame.label === 'contact' || frame.label === 'peak-jump') {
    const rightWrist    = lm[16], rightShoulder = lm[12]
    const leftWrist     = lm[15], leftShoulder  = lm[11]

    const hittingRight    = rightWrist && leftWrist ? rightWrist.y < leftWrist.y : true
    const hittingWrist    = hittingRight ? rightWrist    : leftWrist
    const hittingShoulder = hittingRight ? rightShoulder : leftShoulder
    const hittingElbow    = hittingRight ? lm[14]        : lm[13]

    if (hittingWrist && hittingShoulder) {
      const wristAboveShoulder = hittingWrist.y < hittingShoulder.y
      metrics.elbowHeight = wristAboveShoulder ? 'above_shoulder' : 'at_or_below_shoulder'
      scores.elbowHeight = {
        status: wristAboveShoulder ? 'good' : 'needs_work',
        color:  wristAboveShoulder ? '#22c55e' : '#ef4444',
      }
    }

    if (hittingWrist && hittingElbow && hittingShoulder) {
      const elbowAngle = angleBetween(hittingShoulder, hittingElbow, hittingWrist)
      metrics.armExtensionAngle = Math.round(elbowAngle)
      scores.armExtension = {
        status: elbowAngle > 155 ? 'good' : elbowAngle > 130 ? 'warn' : 'needs_work',
        color:  elbowAngle > 155 ? '#22c55e' : elbowAngle > 130 ? '#f59e0b' : '#ef4444',
      }
    }

    const nose = lm[0]
    if (hittingWrist && nose) {
      const inFront = hittingRight
        ? hittingWrist.x > nose.x - 0.05
        : hittingWrist.x < nose.x + 0.05
      metrics.contactPoint = inFront ? 'in_front' : 'behind_or_beside'
      scores.contactPoint = {
        status: inFront ? 'good' : 'needs_work',
        color:  inFront ? '#22c55e' : '#ef4444',
      }
    }

    const leftHip = lm[23], rightHip = lm[24]
    if (leftShoulder && rightShoulder && leftHip && rightHip) {
      const rotResult = shoulderRotationVsNet(lm, netOrientation)
      if (rotResult) {
        metrics.hipRotationDegrees = rotResult.degrees
        metrics.netOrientation     = rotResult.netOrientation
        scores.hipRotation = {
          status: rotResult.status,
          color:  rotResult.status === 'good' ? '#22c55e' : rotResult.status === 'warn' ? '#f59e0b' : '#ef4444',
        }
      }
    }
  }

  if (frame.label === 'penultimate-step') {
    const leftKnee  = angleBetween(lm[23] || {x:0,y:0}, lm[25] || {x:0,y:0.1}, lm[27] || {x:0,y:0.2})
    const rightKnee = angleBetween(lm[24] || {x:0,y:0}, lm[26] || {x:0,y:0.1}, lm[28] || {x:0,y:0.2})
    const deeperKnee = Math.min(leftKnee, rightKnee)
    metrics.kneeBendAngle = Math.round(deeperKnee)
    scores.penultimateStep = {
      status: deeperKnee < 120 ? 'good' : deeperKnee < 145 ? 'warn' : 'needs_work',
      color:  deeperKnee < 120 ? '#22c55e' : deeperKnee < 145 ? '#f59e0b' : '#ef4444',
    }

    // Foot forward position
    const footFwd = footForwardPosition(lm, approachDirection)
    metrics.footForward = footFwd.forward
    scores.footForward = { status: footFwd.forward !== 'unknown' ? 'good' : 'not_visible' }

    // Front foot open angle (ankle → toe tip)
    const leftAngle  = footOpenAngle(lm, 27, 31)
    const rightAngle = footOpenAngle(lm, 28, 32)
    if (leftAngle !== null || rightAngle !== null) {
      const frontAngle = footFwd.forward === 'left' ? leftAngle : rightAngle
      if (frontAngle !== null) {
        metrics.frontFootAngle = frontAngle
        scores.footAngle = {
          status: frontAngle < 50 ? 'good' : frontAngle < 65 ? 'warn' : 'needs_work',
          color:  frontAngle < 50 ? '#22c55e' : frontAngle < 65 ? '#f59e0b' : '#ef4444',
        }
      }
    }

    // Stance width relative to shoulder width
    const ratio = stanceWidthRatio(lm)
    if (ratio !== null) {
      metrics.stanceWidthRatio = ratio
      scores.stanceWidth = {
        status: ratio >= 0.8 && ratio <= 1.8 ? 'good' : ratio < 0.8 ? 'needs_work' : 'warn',
        color:  ratio >= 0.8 && ratio <= 1.8 ? '#22c55e' : ratio < 0.8 ? '#ef4444' : '#f59e0b',
      }
    }
  }

  if (frame.label === 'takeoff') {
    const lean = bodyLeanAngle(lm)
    if (lean !== null) {
      metrics.bodyLeanDegrees = lean
      scores.bodyAngle = {
        status: lean >= 10 && lean <= 30 ? 'good' : 'needs_work',
        color:  lean >= 10 && lean <= 30 ? '#22c55e' : '#ef4444',
      }
    }

    const drive = armDriveHeight(lm)
    if (drive !== null) {
      metrics.armDriveHeight = drive
      scores.armDrive = {
        status: drive > 0.08 ? 'good' : drive > 0.02 ? 'warn' : 'needs_work',
        color:  drive > 0.08 ? '#22c55e' : drive > 0.02 ? '#f59e0b' : '#ef4444',
      }
    }
  }

  if (frame.label === 'follow-through') {
    const rightWrist = lm[16], leftWrist = lm[15]
    const hittingRight = rightWrist && leftWrist ? rightWrist.y < leftWrist.y : true
    const hittingWrist = hittingRight ? rightWrist : leftWrist
    const hip = hittingRight ? lm[24] : lm[23]

    if (hittingWrist && hip) {
      const wrappedThrough = hittingWrist.y > hip.y
      metrics.followThrough = wrappedThrough ? 'wrapped' : 'incomplete'
      scores.followThrough = {
        status: wrappedThrough ? 'good' : 'needs_work',
        color:  wrappedThrough ? '#22c55e' : '#ef4444',
      }
    }
  }

  return { label: frame.label, metrics, scores }
}

function buildScoredSegments(frameResults) {
  const contactFrame     = frameResults.find(f => f.label === 'contact')
  const penultimateFrame = frameResults.find(f => f.label === 'penultimate-step')
  const segments = {}

  if (contactFrame?.scores) {
    if (contactFrame.scores.armExtension) {
      segments.rightUpperArm = contactFrame.scores.armExtension
      segments.rightForearm  = contactFrame.scores.armExtension
    }
    if (contactFrame.scores.hipRotation) {
      segments.hips      = contactFrame.scores.hipRotation
      segments.shoulders = contactFrame.scores.hipRotation
    }
  }

  if (penultimateFrame?.scores) {
    if (penultimateFrame.scores.penultimateStep) {
      segments.rightThigh = penultimateFrame.scores.penultimateStep
      segments.leftThigh  = penultimateFrame.scores.penultimateStep
      segments.rightShin  = penultimateFrame.scores.penultimateStep
      segments.leftShin   = penultimateFrame.scores.penultimateStep
    }
    if (penultimateFrame.scores.footAngle) {
      segments.leftAnkle  = penultimateFrame.scores.footAngle
      segments.rightAnkle = penultimateFrame.scores.footAngle
    }
  }

  return segments
}

function buildSummary(frameResults) {
  const lines = []
  for (const r of frameResults) {
    if (Object.keys(r.metrics).length === 0) continue
    lines.push(`Frame: ${r.label}`)
    for (const [k, v] of Object.entries(r.metrics)) lines.push(`  ${k}: ${v}`)
    for (const [k, v] of Object.entries(r.scores))  lines.push(`  ${k}_status: ${v.status}`)
  }
  return lines.join('\n')
}
