import { useRef, useEffect } from 'react'

const ALL_STEPS = [
  'Extracting key frames...',
  'Analyzing volleyball mechanics...',
  'Sending to AI coach...',
  'Building feedback report...',
]

// ─── DEBUG ────────────────────────────────────────────────────────────────────
// Mirrors the DEBUG flag in frameExtractor.js — set both to false to hide panel.
const DEBUG = true
// ─────────────────────────────────────────────────────────────────────────────

export default function AnalysisProgress({ steps, debugLog = [] }) {
  const debugRef = useRef(null)

  // Auto-scroll debug panel to the latest message
  useEffect(() => {
    if (debugRef.current) {
      debugRef.current.scrollTop = debugRef.current.scrollHeight
    }
  }, [debugLog])

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-60px)] p-4 gap-6">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-bounce">🏐</div>
        <h2 className="text-xl font-bold mb-1">Analyzing Technique</h2>
        <p className="text-sm text-slate-400">This takes about 10-15 seconds</p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        {ALL_STEPS.map((step, i) => {
          const done = steps.includes(step)
          const active = !done && steps.length === i
          return (
            <div
              key={step}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                done ? 'bg-green-900/30 border border-green-800' :
                active ? 'bg-blue-900/30 border border-blue-700 animate-pulse' :
                'bg-slate-900 border border-slate-800 opacity-40'
              }`}
            >
              <span className="text-lg flex-shrink-0">
                {done ? '✅' : active ? '⏳' : '⬜'}
              </span>
              <span className={`text-sm ${done ? 'text-green-300' : active ? 'text-blue-200' : 'text-slate-500'}`}>
                {step}
              </span>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-slate-500 text-center max-w-xs">
        AI is reviewing approach footwork, arm mechanics, contact point, and follow-through.
      </p>

      {/* ── DEBUG PANEL ─────────────────────────────────────────────────────── */}
      {DEBUG && debugLog.length > 0 && (
        <div className="w-full max-w-sm">
          <p className="text-xs text-yellow-400 font-mono mb-1">
            DEBUG — {debugLog.length} events (remove when done)
          </p>
          <div
            ref={debugRef}
            className="bg-black border border-yellow-800 rounded-lg p-2 h-52 overflow-y-auto"
          >
            {debugLog.map((msg, i) => (
              <p key={i} className="font-mono text-xs text-green-400 leading-snug break-all">
                {msg}
              </p>
            ))}
          </div>
        </div>
      )}
      {/* ────────────────────────────────────────────────────────────────────── */}
    </div>
  )
}
