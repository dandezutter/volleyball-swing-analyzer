const ALL_STEPS = [
  'Extracting key frames...',
  'Analyzing volleyball mechanics...',
  'Sending to AI coach...',
  'Building feedback report...',
]

const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

export default function AnalysisProgress({ steps }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-60px)] p-8 gap-8">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-bounce">🏐</div>
        <h2 className="text-xl font-bold mb-1">Analyzing Technique</h2>
        <p className="text-sm text-slate-400">
          {isMobile ? 'This takes about 30–60 seconds on mobile' : 'This takes about 10–15 seconds'}
        </p>
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
    </div>
  )
}
