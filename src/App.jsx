import { useState } from 'react'
import VideoUploader from './components/VideoUploader.jsx'
import VideoTrimmer from './components/VideoTrimmer.jsx'
import VideoPlayer from './components/VideoPlayer.jsx'
import FeedbackPanel from './components/FeedbackPanel.jsx'
import AnalysisProgress from './components/AnalysisProgress.jsx'
import { extractKeyFrames } from './lib/frameExtractor.js'
import { analyzeFrames } from './lib/volleyballAnalysis.js'
import { analyzeSwing } from './lib/claudeClient.js'

const SCREEN = {
  UPLOAD: 'upload',
  TRIM: 'trim',
  ANALYZING: 'analyzing',
  RESULTS: 'results',
}

const DEFAULT_PROFILE = { name: '', age: '', heightFt: '5', heightIn: '6', gender: 'female', netHeight: "7'4\"" }

function deriveNetHeight(gender, age) {
  if (gender === 'female') return "7'4\""
  if (Number(age) > 14) return "8'"
  return "7'4\""
}

export default function App() {
  const [screen, setScreen] = useState(SCREEN.UPLOAD)
  const [videoFile, setVideoFile] = useState(null)
  const [videoUrl, setVideoUrl] = useState(null)
  const [trimWindow, setTrimWindow] = useState({ start: 0, end: 0 })
  const [analysisProgress, setAnalysisProgress] = useState([])
  const [feedback, setFeedback] = useState(null)
  const [scoredSegments, setScoredSegments] = useState({})
  const [keyFrames, setKeyFrames] = useState([])
  const [error, setError] = useState(null)
  const [athleteProfile, setAthleteProfile] = useState(DEFAULT_PROFILE)

  function handleVideoSelected(file, profile) {
    const url = URL.createObjectURL(file)
    setVideoFile(file)
    setVideoUrl(url)
    if (profile) setAthleteProfile(profile)
    setError(null)
    setScreen(SCREEN.TRIM)
  }

  async function handleAnalyze(video, { start, end }) {
    setTrimWindow({ start, end })
    setScreen(SCREEN.ANALYZING)
    setAnalysisProgress([])
    setError(null)

    try {
      setAnalysisProgress(['Extracting key frames...'])
      const frames = await extractKeyFrames(video, start, end, (msg) => {
        setAnalysisProgress((p) => [...p, msg])
      })
      setKeyFrames(frames)

      setAnalysisProgress((p) => [...p, 'Analyzing volleyball mechanics...'])
      const ruleAnalysis = analyzeFrames(frames)
      setScoredSegments(ruleAnalysis.scoredSegments)

      setAnalysisProgress((p) => [...p, 'Sending to AI coach...'])
      const result = await analyzeSwing({
        frames: frames.map((f) => ({ label: f.label, base64: f.base64 })),
        analysis: ruleAnalysis,
        athleteInfo: {
          club: 'MOD Volleyball',
          name: athleteProfile.name || 'Player',
          age: athleteProfile.age,
          height: `${athleteProfile.heightFt}'${athleteProfile.heightIn}"`,
          gender: athleteProfile.gender,
          netHeight: athleteProfile.netHeight,
        },
      })

      setAnalysisProgress((p) => [...p, 'Building feedback report...'])
      setFeedback(result)
      setScreen(SCREEN.RESULTS)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Analysis failed. Please try again.')
      setScreen(SCREEN.TRIM)
    }
  }

  function handleReset() {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoFile(null)
    setVideoUrl(null)
    setFeedback(null)
    setScoredSegments({})
    setKeyFrames([])
    setError(null)
    setAthleteProfile(DEFAULT_PROFILE)
    setScreen(SCREEN.UPLOAD)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-blue-900 px-4 py-3 flex items-center gap-3 shadow-lg flex-shrink-0">
        <span className="text-2xl">🏐</span>
        <div>
          <h1 className="text-base font-bold leading-tight">MOD Swing Analyzer</h1>
          <p className="text-xs text-blue-300 leading-tight">AI-powered volleyball coaching</p>
        </div>
        {screen !== SCREEN.UPLOAD && (
          <button
            onClick={handleReset}
            className="ml-auto text-xs bg-blue-800 hover:bg-blue-700 px-3 py-1.5 rounded-full transition"
          >
            New Video
          </button>
        )}
      </header>

      <main className="flex-1">
        {screen === SCREEN.UPLOAD && (
          <VideoUploader
            onVideoSelected={handleVideoSelected}
            error={error}
            initialProfile={athleteProfile}
            deriveNetHeight={deriveNetHeight}
          />
        )}

        {screen === SCREEN.TRIM && videoUrl && (
          <VideoTrimmer
            videoUrl={videoUrl}
            videoFile={videoFile}
            onAnalyze={handleAnalyze}
            onBack={handleReset}
            error={error}
          />
        )}

        {screen === SCREEN.ANALYZING && (
          <AnalysisProgress steps={analysisProgress} />
        )}

        {screen === SCREEN.RESULTS && feedback && (
          <div className="flex flex-col gap-0">
            <VideoPlayer
              videoUrl={videoUrl}
              scoredSegments={scoredSegments}
              trimWindow={trimWindow}
              keyFrames={keyFrames}
              feedback={feedback}
            />
            <FeedbackPanel
              feedback={feedback}
              athleteProfile={athleteProfile}
              onReset={handleReset}
            />
          </div>
        )}
      </main>
    </div>
  )
}
