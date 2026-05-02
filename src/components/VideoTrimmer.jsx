import { useRef, useState, useEffect, useCallback } from 'react'

const THUMB_COUNT = 8 // thumbnails along the trim bar

export default function VideoTrimmer({ videoUrl, videoFile, onAnalyze, onBack, error }) {
  const videoRef = useRef(null)
  const [duration, setDuration] = useState(0)
  const [startFrac, setStartFrac] = useState(0)
  const [endFrac, setEndFrac] = useState(1)
  const [thumbnails, setThumbnails] = useState([])
  const [currentTime, setCurrentTime] = useState(0)
  const [loading, setLoading] = useState(true)
  const [videoDims, setVideoDims] = useState(null)
  const thumbCanvasRef = useRef(null)

  function startTime() { return startFrac * duration }
  function endTime() { return endFrac * duration }
  function windowSecs() { return (endFrac - startFrac) * duration }

  function formatTime(secs) {
    if (!secs || isNaN(secs)) return '0:00'
    const m = Math.floor(secs / 60)
    const s = (secs % 60).toFixed(1).padStart(4, '0')
    return `${m}:${s}`
  }

  // Extract thumbnails from the video by seeking to evenly-spaced timestamps
  const extractThumbnails = useCallback(async (video) => {
    const dur = video.duration
    if (!dur || isNaN(dur)) return
    const canvas = document.createElement('canvas')
    canvas.width = 120
    canvas.height = 68
    const ctx = canvas.getContext('2d')
    const thumbs = []

    for (let i = 0; i < THUMB_COUNT; i++) {
      const t = (i / (THUMB_COUNT - 1)) * dur
      await new Promise((resolve) => {
        let done = false
        function grab() {
          if (done) return
          done = true
          ctx.drawImage(video, 0, 0, 120, 68)
          thumbs.push(canvas.toDataURL('image/jpeg', 0.6))
          resolve()
        }
        video.currentTime = t
        video.addEventListener('seeked', () => requestAnimationFrame(grab), { once: true })
        // iOS fallback — seeked event may never fire
        setTimeout(grab, 400)
      })
    }
    setThumbnails(thumbs)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    function onLoaded() {
      setDuration(video.duration)
      setVideoDims({ w: video.videoWidth, h: video.videoHeight })
      setLoading(false)
      extractThumbnails(video)
    }
    function onTimeUpdate() {
      setCurrentTime(video.currentTime)
    }

    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('timeupdate', onTimeUpdate)
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [extractThumbnails])

  // Clamp playback to trim window
  useEffect(() => {
    const video = videoRef.current
    if (!video || !duration) return
    function onTimeUpdate() {
      if (video.currentTime > endTime()) {
        video.currentTime = startTime()
      }
    }
    video.addEventListener('timeupdate', onTimeUpdate)
    return () => video.removeEventListener('timeupdate', onTimeUpdate)
  }, [startFrac, endFrac, duration])

  function handleStartChange(e) {
    const val = Math.min(parseFloat(e.target.value), endFrac - 0.05)
    setStartFrac(val)
    if (videoRef.current) videoRef.current.currentTime = val * duration
  }

  function handleEndChange(e) {
    const val = Math.max(parseFloat(e.target.value), startFrac + 0.05)
    setEndFrac(val)
    if (videoRef.current) videoRef.current.currentTime = val * duration
  }

  function handleAnalyze() {
    if (videoRef.current) {
      videoRef.current.pause()
    }
    onAnalyze(videoRef.current, { start: startTime(), end: endTime() })
  }

  const segmentPercent = (endFrac - startFrac) * 100
  const segmentLeft = startFrac * 100

  return (
    <div className="flex flex-col min-h-[calc(100vh-60px)]">
      {/* Video preview */}
      <div className="bg-black relative">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full max-h-[45vh] object-contain"
          playsInline
          controls
          preload="metadata"
        />
      </div>

      <div className="flex-1 p-4 flex flex-col gap-4">
        <div>
          <h2 className="font-bold text-base mb-0.5">Select the Approach & Swing</h2>
          <p className="text-xs text-slate-400">
            Drag the handles to bracket just the approach and contact.
            {duration > 10 && ' For slo-mo clips, this is usually 5–20 seconds of the file.'}
          </p>
          {/* Video file info */}
          {(videoDims || videoFile) && (
            <p className="text-xs text-slate-500 mt-1">
              {[
                videoFile?.name?.match(/\.(mov|mp4|m4v)$/i)?.[1]?.toUpperCase(),
                videoDims ? `${videoDims.w}×${videoDims.h}` : null,
                videoFile ? `${(videoFile.size / 1024 / 1024).toFixed(1)} MB` : null,
                duration ? `${duration.toFixed(1)}s total` : null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        {/* Thumbnail strip + range sliders */}
        <div className="relative">
          {/* Thumbnails */}
          <div className="flex rounded-lg overflow-hidden h-14 bg-slate-800">
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-500 animate-pulse">
                Loading video...
              </div>
            ) : thumbnails.length > 0 ? (
              thumbnails.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="flex-1 object-cover"
                  style={{ minWidth: 0 }}
                />
              ))
            ) : (
              <div className="flex-1 bg-slate-700" />
            )}
          </div>

          {/* Selected window highlight */}
          <div
            className="absolute top-0 bottom-0 border-2 border-blue-400 rounded pointer-events-none"
            style={{
              left: `${segmentLeft}%`,
              width: `${segmentPercent}%`,
            }}
          />

          {/* Darkened regions outside selection */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-black/60 rounded-l pointer-events-none"
            style={{ width: `${segmentLeft}%` }}
          />
          <div
            className="absolute top-0 bottom-0 right-0 bg-black/60 rounded-r pointer-events-none"
            style={{ width: `${100 - segmentLeft - segmentPercent}%` }}
          />

          {/* Dual-handle range inputs (overlaid) */}
          <div className="absolute inset-0">
            {/* Start handle */}
            <input
              type="range"
              min="0" max="1" step="0.001"
              value={startFrac}
              onChange={handleStartChange}
              className="absolute inset-0 w-full opacity-0 cursor-ew-resize h-full"
              style={{ zIndex: 10 }}
            />
            {/* End handle */}
            <input
              type="range"
              min="0" max="1" step="0.001"
              value={endFrac}
              onChange={handleEndChange}
              className="absolute inset-0 w-full opacity-0 cursor-ew-resize h-full"
              style={{ zIndex: 11 }}
            />
          </div>
        </div>

        {/* Time readout */}
        <div className="flex justify-between text-xs text-slate-400">
          <span>Start: <span className="text-white font-mono">{formatTime(startTime())}</span></span>
          <span className="text-blue-300 font-medium">{formatTime(windowSecs())} selected</span>
          <span>End: <span className="text-white font-mono">{formatTime(endTime())}</span></span>
        </div>

        {/* Clip length warning */}
        {windowSecs() > 30 && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-3 text-xs text-yellow-300">
            Selection is {Math.round(windowSecs())}s — analysis works best under 30s. Trim tighter to just the approach and swing for faster, more accurate results.
          </div>
        )}

        {/* Tips */}
        <div className="bg-slate-900 rounded-xl p-3 text-xs text-slate-400 space-y-1">
          <p>✓ Include the full approach — start from the first step</p>
          <p>✓ Include the follow-through after contact</p>
          <p>✓ Keep the selection under 30 seconds for fastest analysis</p>
        </div>

        {/* Error from analysis */}
        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-auto pb-4 safe-bottom">
          <button
            onClick={onBack}
            className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 text-sm font-medium active:bg-slate-800"
          >
            Back
          </button>
          <button
            onClick={handleAnalyze}
            disabled={loading || windowSecs() < 0.5}
            className="flex-2 flex-grow-[2] py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold transition active:bg-blue-700"
          >
            Analyze This Segment →
          </button>
        </div>
      </div>
    </div>
  )
}
