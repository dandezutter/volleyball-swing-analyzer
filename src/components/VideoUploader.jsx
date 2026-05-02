import { useRef, useState, useEffect } from 'react'

const ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/mov']
const MAX_SIZE_MB = 500

const FT_OPTIONS  = ['4','5','6','7']
const IN_OPTIONS  = ['0','1','2','3','4','5','6','7','8','9','10','11']

export default function VideoUploader({ onVideoSelected, error, initialProfile, deriveNetHeight }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [sizeError, setSizeError] = useState(null)

  const [name,      setName]      = useState(initialProfile?.name      ?? '')
  const [age,       setAge]       = useState(initialProfile?.age       ?? '')
  const [heightFt,  setHeightFt]  = useState(initialProfile?.heightFt  ?? '5')
  const [heightIn,  setHeightIn]  = useState(initialProfile?.heightIn  ?? '6')
  const [gender,    setGender]    = useState(initialProfile?.gender    ?? 'female')
  const [netHeight, setNetHeight] = useState(initialProfile?.netHeight ?? "7'4\"")
  const [netOverride, setNetOverride] = useState(false)

  // Auto-derive net height unless user has manually overridden
  useEffect(() => {
    if (!netOverride) {
      setNetHeight(deriveNetHeight(gender, age))
    }
  }, [gender, age, netOverride, deriveNetHeight])

  function buildProfile() {
    return { name, age, heightFt, heightIn, gender, netHeight }
  }

  function handleFile(file) {
    setSizeError(null)
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(mp4|mov|m4v)$/i)) {
      setSizeError('Unsupported file type. Please use MP4 or MOV.')
      return
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setSizeError(`File is ${Math.round(file.size / 1024 / 1024)}MB — max ${MAX_SIZE_MB}MB.`)
      return
    }
    onVideoSelected(file, buildProfile())
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  const displayError = sizeError || error

  return (
    <div className="flex flex-col items-center justify-start min-h-[calc(100vh-60px)] p-4 gap-5 max-w-md mx-auto">

      {/* Player info */}
      <div className="w-full bg-slate-900 rounded-2xl p-4 space-y-3">
        <h2 className="font-bold text-sm text-slate-300 uppercase tracking-wide">Player Info</h2>

        {/* Name */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">Name (optional)</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Alex"
            className="bg-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 border border-slate-700 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Age + Height row */}
        <div className="flex gap-3">
          <div className="flex flex-col gap-1 w-20">
            <label className="text-xs text-slate-400">Age</label>
            <input
              type="number"
              value={age}
              onChange={e => setAge(e.target.value)}
              min="8" max="25"
              placeholder="15"
              className="bg-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 border border-slate-700 focus:outline-none focus:border-blue-500 w-full"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-slate-400">Height</label>
            <div className="flex gap-2">
              <select
                value={heightFt}
                onChange={e => setHeightFt(e.target.value)}
                className="bg-slate-800 rounded-lg px-2 py-2 text-sm text-white border border-slate-700 focus:outline-none focus:border-blue-500 flex-1"
              >
                {FT_OPTIONS.map(ft => <option key={ft} value={ft}>{ft} ft</option>)}
              </select>
              <select
                value={heightIn}
                onChange={e => setHeightIn(e.target.value)}
                className="bg-slate-800 rounded-lg px-2 py-2 text-sm text-white border border-slate-700 focus:outline-none focus:border-blue-500 flex-1"
              >
                {IN_OPTIONS.map(i => <option key={i} value={i}>{i} in</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Gender */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">Gender</label>
          <div className="flex gap-3">
            {['female','male'].map(g => (
              <label key={g} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="gender"
                  value={g}
                  checked={gender === g}
                  onChange={() => { setGender(g); setNetOverride(false) }}
                  className="accent-blue-500"
                />
                <span className="text-sm capitalize">{g}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Net height */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">
            Net Height
            {!netOverride && <span className="ml-2 text-slate-500">(auto)</span>}
          </label>
          <div className="flex gap-3">
            {["7'4\"", "8'"].map(h => (
              <label key={h} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="netHeight"
                  value={h}
                  checked={netHeight === h}
                  onChange={() => { setNetHeight(h); setNetOverride(true) }}
                  className="accent-blue-500"
                />
                <span className="text-sm">{h}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <button
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`
          w-full border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3
          transition cursor-pointer select-none
          ${dragging
            ? 'border-blue-400 bg-blue-900/30'
            : 'border-slate-600 hover:border-blue-500 hover:bg-slate-900 active:bg-slate-800'
          }
        `}
      >
        <span className="text-4xl">📱</span>
        <span className="font-semibold text-lg">Select Video</span>
        <span className="text-xs text-slate-400 text-center">
          MP4 or MOV · Up to 500MB<br />Normal or slow-motion
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,.mov,.mp4,.m4v"
        className="hidden"
        onChange={e => handleFile(e.target.files?.[0])}
      />

      {displayError && (
        <div className="w-full bg-red-900/40 border border-red-700 rounded-xl p-3 text-sm text-red-300">
          {displayError}
        </div>
      )}

      <div className="w-full bg-slate-900 rounded-2xl p-4 space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">📹 Filming Tips</p>
        <ul className="text-xs text-slate-500 space-y-1">
          <li>• <span className="text-slate-400">Side angle</span> — film from the side so the full approach is visible</li>
          <li>• <span className="text-slate-400">Full body</span> — capture head to toe throughout the swing</li>
          <li>• <span className="text-slate-400">Good lighting</span> — avoid backlighting or deep shadows</li>
          <li>• <span className="text-slate-400">Steady camera</span> — keep the phone still or use a tripod</li>
          <li>• <span className="text-slate-400">Short clip</span> — just the approach + swing, under 30 seconds</li>
        </ul>
      </div>
    </div>
  )
}
