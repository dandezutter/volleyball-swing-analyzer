import { useState } from 'react'

const STATUS_STYLES = {
  good:        'text-green-400 bg-green-900/20',
  needs_work:  'text-red-400 bg-red-900/20',
  not_visible: 'text-slate-500 bg-slate-800/50',
  unclear:     'text-yellow-400 bg-yellow-900/20',
  too_narrow:  'text-red-400 bg-red-900/20',
  too_wide:    'text-yellow-400 bg-yellow-900/20',
  open:        'text-green-400 bg-green-900/20',
  square:      'text-yellow-400 bg-yellow-900/20',
  closed:      'text-red-400 bg-red-900/20',
  left:        'text-slate-300 bg-slate-800',
  right:       'text-slate-300 bg-slate-800',
}

const BADGE_LABELS = {
  good:        '✓ Good',
  needs_work:  '✗ Fix',
  not_visible: '— Not visible',
  too_narrow:  '⚠ Too narrow',
  too_wide:    '⚠ Too wide',
  open:        '✓ Open',
  square:      '⚠ Square',
  closed:      '✗ Closed',
  left:        'Left foot',
  right:       'Right foot',
}

const PHASE_LABELS = {
  approach:      { icon: '🏃', label: 'Approach' },
  takeoff:       { icon: '⬆️', label: 'Takeoff' },
  contact:       { icon: '💥', label: 'Contact' },
  followThrough: { icon: '🔄', label: 'Follow-Through' },
}

const METRIC_LABELS = {
  stepPattern:     'Step Pattern',
  penultimateStep: 'Penultimate Step',
  armSwingBack:    'Arm Load (Back-Swing)',
  footForward:     'Lead Foot Position',
  footAngle:       'Front Foot Angle',
  stanceWidth:     'Stance Width',
  bodyAngle:       'Body Angle at Takeoff',
  jumpHeight:      'Jump Height',
  armDrive:        'Arm Drive at Takeoff',
  elbowHeight:     'Elbow Height at Contact',
  armExtension:    'Arm Extension',
  contactPoint:    'Contact Point',
  nonHittingArm:   'Non-Hitting Arm Timing',
  hipRotation:     'Hip / Shoulder Rotation',
  wrapAround:      'Follow-Through Wrap',
}

function StatusBadge({ value }) {
  if (!value) return null
  const style = STATUS_STYLES[value] || 'text-slate-400 bg-slate-800'
  const label = BADGE_LABELS[value] || value
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style}`}>
      {label}
    </span>
  )
}

function PhaseCard({ phaseKey, data }) {
  const { icon, label } = PHASE_LABELS[phaseKey]
  const stepPattern = data.stepPattern
  const metrics = Object.entries(data).filter(([k]) => k !== 'notes' && k !== 'stepPattern')

  return (
    <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className="font-semibold text-base">{label}</h3>
        {stepPattern && (
          <span className="ml-auto text-xs bg-slate-800 px-2 py-0.5 rounded-full text-slate-300">
            {stepPattern}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {metrics.map(([key, val]) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <span className="text-sm text-slate-400 flex-1">{METRIC_LABELS[key] || key}</span>
            <StatusBadge value={val} />
          </div>
        ))}
      </div>

      {data.notes && (
        <p className="text-sm text-slate-300 border-t border-slate-800 pt-2 leading-relaxed">
          {data.notes}
        </p>
      )}
    </div>
  )
}

function DrillCard({ drill, index }) {
  return (
    <div className="bg-slate-900 rounded-2xl p-4 space-y-2">
      <div className="flex items-start gap-3">
        <span className="text-sm font-bold bg-blue-700 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-semibold text-white text-sm leading-snug">{drill.name}</h4>
            {drill.reps && (
              <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                {drill.reps}
              </span>
            )}
          </div>
          {drill.focus && (
            <p className="text-xs text-blue-400 mt-0.5">Targets: {drill.focus}</p>
          )}
        </div>
      </div>
      {drill.instructions && (
        <p className="text-sm text-slate-300 leading-relaxed pl-9">{drill.instructions}</p>
      )}
    </div>
  )
}

// ── Print-only report (white background, black text) ────────────────────────
function PrintReport({ structured, shareText, playerName, athleteProfile }) {
  const profileLine = [
    athleteProfile?.age ? `Age ${athleteProfile.age}` : null,
    athleteProfile?.heightFt ? `${athleteProfile.heightFt}'${athleteProfile.heightIn}"` : null,
    athleteProfile?.gender ? (athleteProfile.gender === 'female' ? 'Female' : 'Male') : null,
    athleteProfile?.netHeight ? `${athleteProfile.netHeight} net` : null,
  ].filter(Boolean).join(' · ')

  const s = { fontFamily: 'Arial, sans-serif', color: '#000', fontSize: '12pt', lineHeight: 1.5 }

  return (
    <div className="print-only" style={{ ...s, padding: '28px 36px', background: '#fff' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '18pt', fontWeight: 'bold', margin: 0 }}>MOD Volleyball — Swing Analysis</div>
          <div style={{ fontSize: '11pt', color: '#444', marginTop: '3px' }}>
            {playerName}{profileLine ? ` · ${profileLine}` : ''} · {new Date().toLocaleDateString()}
          </div>
        </div>
        <div style={{ fontSize: '26pt' }}>🏐</div>
      </div>

      {/* Top Priority */}
      {structured?.topPriority && (
        <div style={{ border: '2px solid #cc0000', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px' }}>
          <div style={{ fontWeight: 'bold', color: '#cc0000', fontSize: '11pt', marginBottom: '4px' }}>🎯 TOP PRIORITY FIX</div>
          <div style={{ marginBottom: '6px' }}>{structured.topPriority.issue}</div>
          {structured.topPriority.cue && (
            <div style={{ fontStyle: 'italic', color: '#333' }}>Coaching Cue: "{structured.topPriority.cue}"</div>
          )}
        </div>
      )}

      {/* Strengths */}
      {structured?.strengths?.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '11pt', marginBottom: '5px' }}>💪 STRENGTHS</div>
          {structured.strengths.map((s, i) => (
            <div key={i} style={{ marginBottom: '3px' }}>• {s.observation}</div>
          ))}
        </div>
      )}

      {/* Phase notes */}
      {structured?.phaseAnalysis && (
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '11pt', marginBottom: '6px' }}>📋 PHASE BREAKDOWN</div>
          {Object.entries(structured.phaseAnalysis).map(([key, data]) => {
            const labels = { approach: 'Approach', takeoff: 'Takeoff', contact: 'Contact', followThrough: 'Follow-Through' }
            if (!labels[key] || !data.notes) return null
            return (
              <div key={key} style={{ marginBottom: '7px' }}>
                <strong>{labels[key]}:</strong> {data.notes}
              </div>
            )
          })}
        </div>
      )}

      {/* Drills */}
      {structured?.drills?.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '11pt', marginBottom: '8px' }}>🏋️ PRACTICE DRILLS</div>
          {structured.drills.map((d, i) => (
            <div key={i} style={{ marginBottom: '10px', paddingLeft: '12px', borderLeft: '3px solid #0055cc' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                {i + 1}. {d.name}{d.reps ? <span style={{ fontWeight: 'normal', color: '#555' }}> — {d.reps}</span> : ''}
              </div>
              {d.focus && <div style={{ fontSize: '10pt', color: '#555', marginBottom: '2px' }}>Targets: {d.focus}</div>}
              <div style={{ fontSize: '11pt' }}>{d.instructions}</div>
            </div>
          ))}
        </div>
      )}

      {/* Coach summary */}
      {shareText && (
        <div style={{ borderTop: '1px solid #ccc', paddingTop: '10px', marginBottom: '14px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '11pt', marginBottom: '5px' }}>📝 COACH SUMMARY</div>
          <div>{shareText}</div>
        </div>
      )}

      <div style={{ borderTop: '1px solid #ddd', paddingTop: '8px', fontSize: '9pt', color: '#999', textAlign: 'center' }}>
        Generated by MOD Swing Analyzer · AI-powered volleyball coaching · dandezutter@gmail.com
      </div>
    </div>
  )
}
// ────────────────────────────────────────────────────────────────────────────

export default function FeedbackPanel({ feedback, athleteProfile, onReset }) {
  const [copied, setCopied] = useState(false)

  let structured = null
  if (typeof feedback === 'object' && feedback !== null) {
    structured = feedback
  } else {
    try { structured = JSON.parse(feedback) } catch (_) {}
  }

  const shareText = structured?.shareableText || (typeof feedback === 'string' ? feedback : '')
  const playerName = athleteProfile?.name || 'Player'

  function buildFullShareText() {
    let text = shareText
    if (structured?.drills?.length) {
      text += '\n\nPractice Drills:\n'
      structured.drills.forEach((d, i) => {
        text += `${i + 1}. ${d.name}${d.reps ? ` (${d.reps})` : ''}\n   ${d.instructions}\n`
      })
    }
    return text
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildFullShareText())
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (_) {}
  }

  async function handleShare() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${playerName} — Volleyball Swing Analysis`,
          text: buildFullShareText(),
        })
        return
      } catch (_) {}
    }
    handleCopy()
  }

  function handlePrint() {
    window.print()
  }

  if (!structured) {
    return (
      <div className="p-4 space-y-4">
        <div className="bg-slate-900 rounded-2xl p-4 text-sm text-slate-300 whitespace-pre-wrap">
          {feedback}
        </div>
        <ResetButton onReset={onReset} />
      </div>
    )
  }

  return (
    <>
      {/* ── Print report (hidden on screen, shown when printing) ── */}
      <PrintReport
        structured={structured}
        shareText={shareText}
        playerName={playerName}
        athleteProfile={athleteProfile}
      />

      {/* ── Main on-screen feedback ── */}
      <div className="no-print p-4 space-y-4 pb-6">
        {/* Player name header */}
        {athleteProfile?.name && (
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            Analysis for <span className="text-slate-300 font-medium">{athleteProfile.name}</span>
            {athleteProfile.age ? ` · Age ${athleteProfile.age}` : ''}
            {athleteProfile.heightFt ? ` · ${athleteProfile.heightFt}'${athleteProfile.heightIn}"` : ''}
            {athleteProfile.netHeight ? ` · ${athleteProfile.netHeight} net` : ''}
          </p>
        )}

        {/* Top priority fix */}
        {structured.topPriority && (
          <div className="bg-red-900/20 border border-red-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎯</span>
              <h3 className="font-bold text-base text-red-300">Top Priority Fix</h3>
            </div>
            <p className="text-sm text-white">{structured.topPriority.issue}</p>
            {structured.topPriority.cue && (
              <div className="bg-red-900/30 rounded-xl px-3 py-2">
                <p className="text-xs text-red-300 font-medium uppercase tracking-wide mb-0.5">Coaching Cue</p>
                <p className="text-sm font-semibold text-white">"{structured.topPriority.cue}"</p>
              </div>
            )}
          </div>
        )}

        {/* Strengths */}
        {structured.strengths?.length > 0 && (
          <div className="bg-green-900/20 border border-green-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">💪</span>
              <h3 className="font-bold text-base text-green-300">Strengths</h3>
            </div>
            <ul className="space-y-1.5">
              {structured.strengths.map((s, i) => (
                <li key={i} className="text-sm text-white flex items-start gap-2">
                  <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                  {s.observation}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Per-phase breakdown */}
        {structured.phaseAnalysis && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-slate-400 uppercase tracking-wide px-1">
              Phase Breakdown
            </h3>
            {Object.entries(structured.phaseAnalysis).map(([key, data]) =>
              PHASE_LABELS[key] ? <PhaseCard key={key} phaseKey={key} data={data} /> : null
            )}
          </div>
        )}

        {/* Practice drills */}
        {structured.drills?.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-slate-400 uppercase tracking-wide px-1">
              Practice Drills
            </h3>
            {structured.drills.map((drill, i) => (
              <DrillCard key={i} drill={drill} index={i} />
            ))}
          </div>
        )}

        {/* Coach summary + export buttons */}
        {shareText && (
          <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
            <h3 className="font-semibold text-sm text-slate-400 uppercase tracking-wide">Coach Summary</h3>
            <p className="text-sm text-slate-200 leading-relaxed">{shareText}</p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleShare}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-xl text-sm font-semibold transition min-w-[120px]"
              >
                📤 Share
              </button>
              <button
                onClick={handleCopy}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition min-w-[120px] ${
                  copied
                    ? 'border-green-600 text-green-400 bg-green-900/20'
                    : 'border-slate-600 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {copied ? '✓ Copied!' : '📋 Copy'}
              </button>
              <button
                onClick={handlePrint}
                className="flex-1 py-3 rounded-xl text-sm font-semibold border border-slate-600 text-slate-300 hover:bg-slate-800 transition min-w-[120px]"
              >
                🖨️ Print / PDF
              </button>
            </div>
          </div>
        )}

        <ResetButton onReset={onReset} />
      </div>
    </>
  )
}

function ResetButton({ onReset }) {
  return (
    <button
      onClick={onReset}
      className="w-full py-4 rounded-2xl border-2 border-blue-700 text-blue-400 hover:bg-blue-900/30 active:bg-blue-900/50 text-sm font-semibold transition"
    >
      🏐 Analyze Another Video
    </button>
  )
}
