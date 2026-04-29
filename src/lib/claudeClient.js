// Base URL is empty for Netlify (relative URL), overridden by env var for Capacitor/native apps
const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export async function analyzeSwing({ frames, analysis, athleteInfo }) {
  const response = await fetch(`${BASE_URL}/.netlify/functions/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frames, analysis: analysis.summary, frameResults: analysis.frameResults, netOrientation: analysis.netOrientation, athleteInfo }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`AI analysis failed (${response.status}): ${text || 'Unknown error'}`)
  }

  const data = await response.json()

  // Parse JSON string from Claude if needed
  if (typeof data.feedback === 'string') {
    try {
      return JSON.parse(data.feedback)
    } catch {
      return { shareableText: data.feedback }
    }
  }

  return data.feedback
}
