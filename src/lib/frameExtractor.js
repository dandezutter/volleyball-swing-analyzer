import { getPoseDetector } from './poseDetection.js'

const FRAME_WIDTH = 640
const FRAME_HEIGHT = 360
const MAX_SAMPLES = 60  // never process more than 60 poses per clip regardless of length

// Event labels in order of the volleyball approach + swing sequence
const EVENTS = ['approach-start', 'penultimate-step', 'takeoff', 'peak-jump', 'contact', 'follow-through']

export async function extractKeyFrames(video, startTime, endTime, onProgress) {
  const detector = await getPoseDetector()
  const duration = endTime - startTime

  // Adaptive sampling: at most MAX_SAMPLES across the window
  const sampleInterval = Math.max(0.05, duration / MAX_SAMPLES)

  onProgress?.('Sampling pose data across the clip...')

  // Pass 1: collect pose samples at regular intervals
  const samples = []
  let t = startTime
  while (t <= endTime) {
    const landmarks = await seekAndDetect(video, t, detector)
    if (landmarks) {
      samples.push({ time: t, landmarks })
    }
    t += sampleInterval
  }

  if (samples.length < 3) {
    throw new Error('Not enough pose data detected. Make sure the player is visible throughout the clip.')
  }

  onProgress?.(`Detected ${samples.length} pose frames — finding key moments...`)

  // Pass 2: identify key event timestamps from pose data
  const eventTimes = detectEvents(samples, duration)

  // Pass 3: extract JPEG frames for the detected events
  const frames = []
  for (const { label, time } of eventTimes) {
    const base64 = await extractFrame(video, time)
    if (base64) {
      const sample = findNearestSample(samples, time)
      frames.push({ label, time, base64, landmarks: sample?.landmarks || null })
    }
  }

  onProgress?.(`Extracted ${frames.length} key frames`)
  return frames
}

// Seek video to a timestamp and run pose detection
async function seekAndDetect(video, time, detector) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 5000)
    let settled = false

    function settle(value) {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(value)
    }

    detector.onResults((results) => {
      const landmarks = results.poseLandmarks || null
      setTimeout(() => settle(landmarks), 0)
    })

    function doSend() {
      detector.send({ image: video }).catch(() => settle(null))
      setTimeout(() => settle(null), 2500)
    }

    // iOS Safari: seeked fires before the decoded frame is available to WebGL.
    // Double-rAF lets the compositor flush the frame; readyState >= 2 confirms
    // the browser has data at the new position before we hand it to MediaPipe.
    function sendWhenReady() {
      if (video.readyState >= 2) {
        doSend()
      } else {
        setTimeout(sendWhenReady, 50)
      }
    }

    if (Math.abs(video.currentTime - time) < 0.05) {
      requestAnimationFrame(() => requestAnimationFrame(sendWhenReady))
    } else {
      video.currentTime = time
      video.addEventListener('seeked', () => {
        requestAnimationFrame(() => requestAnimationFrame(sendWhenReady))
      }, { once: true })
    }
  })
}

// Detect the 6 key volleyball events from pose sample array
function detectEvents(samples, duration) {
  const events = []

  // Compute per-sample features
  const features = samples.map((s, i) => ({
    time: s.time,
    landmarks: s.landmarks,
    ankleAvgY: avgY(s.landmarks, [27, 28]),
    wristMaxY: minY(s.landmarks, [15, 16]),  // smaller Y = higher in MediaPipe coords
    kneeMinAngle: minKneeAngle(s.landmarks),
    velocity: i > 0 ? Math.abs(s.landmarks[0]?.y - samples[i-1].landmarks[0]?.y) || 0 : 0,
  }))

  // Approach start: first frame where there's meaningful motion (nose/hip velocity)
  const motionStart = features.findIndex((f, i) => i > 0 && f.velocity > 0.003)
  events.push({ label: 'approach-start', time: features[Math.max(0, motionStart)].time })

  // Penultimate step: frame with deepest knee bend before max ankle height (takeoff)
  const takeoffIdx = features.reduce((best, f, i) =>
    f.ankleAvgY < features[best].ankleAvgY ? i : best, 0)
  const preJump = features.slice(0, takeoffIdx + 1)
  const deepKneeIdx = preJump.reduce((best, f, i) =>
    f.kneeMinAngle < preJump[best].kneeMinAngle ? i : best, 0)
  events.push({ label: 'penultimate-step', time: preJump[deepKneeIdx].time })

  // Takeoff: frame where ankles are lowest Y value (highest point = min Y in MediaPipe)
  events.push({ label: 'takeoff', time: features[takeoffIdx].time })

  // Peak jump: highest ankle position after takeoff
  const peakIdx = features.slice(takeoffIdx).reduce((best, f, i) =>
    f.ankleAvgY < features[takeoffIdx + best].ankleAvgY ? i : best, 0)
  events.push({ label: 'peak-jump', time: features[takeoffIdx + peakIdx].time })

  // Contact: frame where hitting wrist is at its highest (minimum Y)
  const contactIdx = features.reduce((best, f, i) =>
    f.wristMaxY < features[best].wristMaxY ? i : best, 0)
  events.push({ label: 'contact', time: features[contactIdx].time })

  // Follow-through: ~0.3s after contact, or last sample if video ends sooner
  const followTime = Math.min(features[contactIdx].time + 0.3, samples[samples.length - 1].time)
  events.push({ label: 'follow-through', time: followTime })

  // Deduplicate: ensure each event has a unique timestamp (no two events at same frame)
  const seen = new Set()
  return events.filter(({ time }) => {
    const key = time.toFixed(2)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Extract a single JPEG frame from the video at the given timestamp
async function extractFrame(video, time) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 5000)

    function capture() {
      clearTimeout(timeout)
      try {
        const canvas = document.createElement('canvas')
        canvas.width = FRAME_WIDTH
        canvas.height = FRAME_HEIGHT
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
        const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
        resolve(base64)
      } catch {
        resolve(null)
      }
    }

    // Same iOS timing fix as seekAndDetect — wait for frame to be compositor-ready
    function captureWhenReady() {
      if (video.readyState >= 2) {
        capture()
      } else {
        setTimeout(captureWhenReady, 50)
      }
    }

    video.currentTime = time
    video.addEventListener('seeked', () => {
      requestAnimationFrame(() => requestAnimationFrame(captureWhenReady))
    }, { once: true })
  })
}

function findNearestSample(samples, time) {
  return samples.reduce((closest, s) =>
    Math.abs(s.time - time) < Math.abs(closest.time - time) ? s : closest
  )
}

function avgY(landmarks, indices) {
  const valid = indices.map(i => landmarks?.[i]).filter(Boolean)
  if (!valid.length) return 0.5
  return valid.reduce((sum, lm) => sum + lm.y, 0) / valid.length
}

function minY(landmarks, indices) {
  const valid = indices.map(i => landmarks?.[i]).filter(Boolean)
  if (!valid.length) return 0.5
  return Math.min(...valid.map(lm => lm.y))
}

function minKneeAngle(landmarks) {
  const left = kneeAngle(landmarks, 23, 25, 27)
  const right = kneeAngle(landmarks, 24, 26, 28)
  return Math.min(left, right)
}

function kneeAngle(landmarks, hipIdx, kneeIdx, ankleIdx) {
  const hip = landmarks?.[hipIdx]
  const knee = landmarks?.[kneeIdx]
  const ankle = landmarks?.[ankleIdx]
  if (!hip || !knee || !ankle) return 180
  return angleBetween(hip, knee, ankle)
}

export function angleBetween(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y }
  const cb = { x: c.x - b.x, y: c.y - b.y }
  const dot = ab.x * cb.x + ab.y * cb.y
  const mag = Math.sqrt(ab.x ** 2 + ab.y ** 2) * Math.sqrt(cb.x ** 2 + cb.y ** 2)
  if (mag === 0) return 180
  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI)
}
