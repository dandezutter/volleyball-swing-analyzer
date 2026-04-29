// Pinned MediaPipe Pose CDN version — never use @latest (API can break across versions)
const MEDIAPIPE_VERSION = '0.5.1675469404'
const CDN_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/pose@${MEDIAPIPE_VERSION}`

let detectorPromise = null

export function getPoseDetector() {
  if (detectorPromise) return detectorPromise
  detectorPromise = initPoseDetector()
  return detectorPromise
}

async function injectScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.crossOrigin = 'anonymous'
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

async function initPoseDetector() {
  // Load the MediaPipe Pose CDN bundle
  await injectScript(`${CDN_BASE}/pose.js`)

  // Wait for window.Pose to be defined
  await new Promise((resolve) => {
    if (window.Pose) { resolve(); return }
    const interval = setInterval(() => {
      if (window.Pose) { clearInterval(interval); resolve() }
    }, 50)
  })

  const pose = new window.Pose({
    locateFile: (file) => `${CDN_BASE}/${file}`,
  })

  pose.setOptions({
    modelComplexity: 1,       // 0=fast, 1=balanced, 2=accurate — 1 is right for volleyball wrists/ankles
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })

  return pose
}
