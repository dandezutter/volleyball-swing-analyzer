import { useRef, useEffect, useState, useCallback } from 'react'
import { getPoseDetector } from '../lib/poseDetection.js'
import { drawSkeleton, drawAnnotations, getVideoRenderBounds, FRAME_TO_PHASE } from './PoseOverlay.jsx'
import Skeleton3DViewer from './Skeleton3DViewer.jsx'

function findActiveKeyFrame(currentTime, keyFrames, threshold = 0.3) {
  let best = null, minDist = Infinity
  for (const kf of keyFrames) {
    const d = Math.abs(currentTime - kf.time)
    if (d < threshold && d < minDist) { minDist = d; best = kf }
  }
  return best
}

export default function VideoPlayer({ videoUrl, scoredSegments, trimWindow, keyFrames = [], feedback = null }) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const rAFRef    = useRef(null)
  const detectorRef = useRef(null)
  const latestLandmarksRef = useRef(null)
  const videoDimsRef = useRef({ width: 0, height: 0 })

  const [poseReady, setPoseReady] = useState(false)
  const [overlayEnabled, setOverlayEnabled] = useState(true)
  const [show3D, setShow3D] = useState(false)

  // Pick the best key frame for 3D display (contact or peak-jump)
  const best3DFrame = keyFrames.find(f => f.label === 'contact') ||
                      keyFrames.find(f => f.label === 'peak-jump') ||
                      keyFrames[0] || null

  useEffect(() => {
    getPoseDetector().then(d => {
      detectorRef.current = d
      setPoseReady(true)
    }).catch(err => console.warn('Pose detector failed:', err))
  }, [])

  function getBounds(canvas) {
    return getVideoRenderBounds(canvas, videoDimsRef.current.width, videoDimsRef.current.height)
  }

  function syncCanvasSize() {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const { clientWidth, clientHeight } = video
    if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
      canvas.width  = clientWidth
      canvas.height = clientHeight
    }
    // Track intrinsic video dimensions for letterbox correction
    if (video.videoWidth) {
      videoDimsRef.current = { width: video.videoWidth, height: video.videoHeight }
    }
  }

  const startLoop = useCallback(() => {
    const video    = videoRef.current
    const canvas   = canvasRef.current
    const detector = detectorRef.current

    async function loop() {
      if (video && !video.paused && !video.ended) {
        syncCanvasSize()
        if (detector && overlayEnabled) {
          try { await detector.send({ image: video }) } catch (_) {}
          if (latestLandmarksRef.current && canvas) {
            const bounds = getBounds(canvas)
            drawSkeleton(canvas, latestLandmarksRef.current, scoredSegments, bounds)

            const activeKF = findActiveKeyFrame(video.currentTime, keyFrames)
            if (activeKF && feedback?.phaseAnalysis) {
              const phaseData = feedback.phaseAnalysis[FRAME_TO_PHASE[activeKF.label]]
              const pulse = (Date.now() % 1000) / 1000
              drawAnnotations(canvas, latestLandmarksRef.current, phaseData, false, pulse, bounds)
            }
          }
        } else if (canvas) {
          canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
        }
      }
      rAFRef.current = requestAnimationFrame(loop)
    }
    rAFRef.current = requestAnimationFrame(loop)
  }, [overlayEnabled, scoredSegments, keyFrames, feedback])

  const stopLoop = useCallback(() => cancelAnimationFrame(rAFRef.current), [])

  useEffect(() => {
    const detector = detectorRef.current
    if (!detector) return
    detector.onResults(results => {
      latestLandmarksRef.current = results.poseLandmarks || null
    })
  }, [poseReady])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.addEventListener('play',  startLoop)
    video.addEventListener('pause', stopLoop)
    video.addEventListener('ended', stopLoop)
    return () => {
      stopLoop()
      video.removeEventListener('play',  startLoop)
      video.removeEventListener('pause', stopLoop)
      video.removeEventListener('ended', stopLoop)
    }
  }, [startLoop, stopLoop])

  // On pause near a key frame: draw annotated static frame with text labels
  useEffect(() => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    function onPause() {
      if (!overlayEnabled) return
      const activeKF = findActiveKeyFrame(video.currentTime, keyFrames)
      if (!activeKF?.landmarks || !feedback?.phaseAnalysis) return
      const phaseData = feedback.phaseAnalysis[FRAME_TO_PHASE[activeKF.label]]
      syncCanvasSize()
      const bounds = getBounds(canvas)
      drawSkeleton(canvas, activeKF.landmarks, scoredSegments, bounds)
      drawAnnotations(canvas, activeKF.landmarks, phaseData, true, 0.5, bounds)
    }
    video.addEventListener('pause', onPause)
    return () => video.removeEventListener('pause', onPause)
  }, [keyFrames, feedback, scoredSegments, overlayEnabled])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !trimWindow) return
    function clamp() {
      if (video.currentTime < trimWindow.start) video.currentTime = trimWindow.start
      if (video.currentTime > trimWindow.end)   video.currentTime = trimWindow.start
    }
    video.addEventListener('timeupdate', clamp)
    video.currentTime = trimWindow.start
    return () => video.removeEventListener('timeupdate', clamp)
  }, [trimWindow])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const ro = new ResizeObserver(syncCanvasSize)
    ro.observe(video)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="bg-black">
      <div className="relative">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full max-h-[50vh] object-contain"
          playsInline
          controls
          preload="auto"
          crossOrigin="anonymous"
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
        />
      </div>

      {/* Controls bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 flex-wrap">
        <button
          onClick={() => setOverlayEnabled(v => !v)}
          className={`text-xs px-3 py-1 rounded-full border transition ${
            overlayEnabled
              ? 'border-blue-500 text-blue-400 bg-blue-900/30'
              : 'border-slate-600 text-slate-400'
          }`}
        >
          {overlayEnabled ? '● Skeleton ON' : '○ Skeleton OFF'}
        </button>

        {best3DFrame && (
          <button
            onClick={() => setShow3D(true)}
            className="text-xs px-3 py-1 rounded-full border border-purple-600 text-purple-400 bg-purple-900/20 hover:bg-purple-900/40 transition"
          >
            ◈ 3D View
          </button>
        )}

        {!poseReady && (
          <span className="text-xs text-slate-500 animate-pulse">Loading pose model...</span>
        )}

        <div className="ml-auto flex gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Good</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Watch</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Fix</span>
        </div>
      </div>

      {/* 3D Skeleton modal */}
      {show3D && best3DFrame && (
        <Skeleton3DViewer
          keyFrames={keyFrames}
          initialFrame={best3DFrame}
          onClose={() => setShow3D(false)}
        />
      )}
    </div>
  )
}
