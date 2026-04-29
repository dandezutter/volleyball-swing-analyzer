import Anthropic from '@anthropic-ai/sdk'

const ANALYSIS_SCHEMA = `
{
  "topPriority": {
    "issue": "Specific problem observed — name the body part and moment",
    "cue": "Memorable coaching cue, 8 words max",
    "frame": "frame label where this is most visible"
  },
  "strengths": [
    { "observation": "What you actually saw done well — be specific", "frame": "frame label" }
  ],
  "phaseAnalysis": {
    "approach": {
      "stepPattern": "3-step | 4-step | unclear",
      "penultimateStep": "good | needs_work | not_visible",
      "armSwingBack": "good | needs_work | not_visible",
      "footForward": "left | right | not_visible",
      "footAngle": "open | square | closed | not_visible",
      "stanceWidth": "good | too_narrow | too_wide | not_visible",
      "notes": "3-5 sentences: (1) which foot is forward and whether it is open or closed, (2) stance width, (3) quality of penultimate step heel-to-toe push and body lean into the jump, (4) arm load position going into takeoff, (5) one specific correction the player can make today."
    },
    "takeoff": {
      "bodyAngle": "good | needs_work | not_visible",
      "jumpHeight": "good | needs_work | not_visible",
      "armDrive": "good | needs_work | not_visible",
      "notes": "3-5 sentences: (1) forward body lean at the moment of liftoff, (2) how high and explosively the arms drove upward, (3) hip extension at takeoff, (4) any timing issue between arm drive and leg push, (5) one concrete fix."
    },
    "contact": {
      "elbowHeight": "good | needs_work | not_visible",
      "armExtension": "good | needs_work | not_visible",
      "contactPoint": "good | needs_work | not_visible",
      "nonHittingArm": "good | needs_work | not_visible",
      "hipRotation": "good | needs_work | not_visible",
      "notes": "3-5 sentences: (1) where the contact point is relative to the body, (2) elbow height and arm extension at contact, (3) what the non-hitting arm is doing, (4) visible hip and shoulder rotation through the swing, (5) one specific fix."
    },
    "followThrough": {
      "wrapAround": "good | needs_work | not_visible",
      "notes": "2-3 sentences describing what the arm does after contact, whether the wrist snap and wrap-around are complete, and one fix if needed."
    }
  },
  "shareableText": "4-6 sentences a coach can text to a parent or player. Start with one genuine strength. Describe the top 1-2 issues with specific body-part and timing references (e.g. 'left foot was square rather than turned out at the penultimate step'). End with the coaching cue."
}
`

function buildSystemContext(athleteInfo, ruleAnalysis, frameResults) {
  const metricsBlock = frameResults ? JSON.stringify(
    frameResults.map(fr => ({
      label: fr.label,
      metrics: fr.metrics,
      scores: Object.fromEntries(Object.entries(fr.scores).map(([k, v]) => [k, v.status])),
    })),
    null, 2
  ) : '(none)'

  const name      = athleteInfo?.name || 'the player'
  const age       = athleteInfo?.age  ? `Age: ${athleteInfo.age}` : ''
  const height    = athleteInfo?.height ? `Height: ${athleteInfo.height}` : ''
  const gender    = athleteInfo?.gender ? `Gender: ${athleteInfo.gender}` : ''
  const netHeight = athleteInfo?.netHeight ? `Net height: ${athleteInfo.netHeight}` : ''
  const profileLine = [age, height, gender, netHeight].filter(Boolean).join(' | ')

  // Height-based jump context: estimate what a good jump looks like for this athlete
  let jumpContext = ''
  if (athleteInfo?.heightFt && athleteInfo?.heightIn !== undefined) {
    const totalIn = Number(athleteInfo.heightFt) * 12 + Number(athleteInfo.heightIn)
    const netIn   = athleteInfo.netHeight === "8'" ? 96 : 88  // 8' or 7'4"
    const reach   = Math.round(totalIn * 1.35)  // rough standing reach estimate
    const neededJump = Math.max(0, netIn + 6 - reach)  // need at least 6" above net
    jumpContext = `\nPlayer standing reach ≈ ${reach}" | Net height: ${netIn}" | Needs ~${neededJump}" of vertical to attack above the net.`
  }

  return `You are an expert volleyball biomechanics coach analyzing technique for youth players.
Club: ${athleteInfo?.club || 'Youth volleyball'}.
Player: ${name}. ${profileLine}${jumpContext}

Rule-based pose measurements (from MediaPipe):
${ruleAnalysis || '(none)'}

Detailed per-frame metrics:
${metricsBlock}

Your job:
1. FOOTWORK FIRST — In the approach-start and penultimate-step frames, examine both feet:
   a. Which foot is physically forward (closer to the net/target)?
   b. Is the front foot turned open (rotated outward ~30-50°) or closed/square to the sideline?
   c. Are the feet shoulder-width apart at the penultimate step?
   d. Is the back foot in a good push position?
2. JUMP MECHANICS — Analyze the takeoff and peak-jump frames:
   a. Is there sufficient forward body lean at takeoff?
   b. Do the arms drive explosively upward?
   c. Is there full hip extension at takeoff?
   d. Does the player reach maximum height before swinging — or do they swing too early?
   e. Comment on jump height relative to the player's height and net height if inferable.
3. SHOULDER ROTATION — The system detected the player's orientation to the net: ${athleteInfo?.netOrientation || 'unknown'}. Interpret shoulder-to-hip rotation accordingly:
   - Side-on: strong shoulder wind-up and explosive rotation through contact is expected.
   - Facing net: shoulder tilt and arm-lead into the ball matters more.
4. Identify the single highest-impact fix. For youth players, footwork errors are often the root cause of poor arm swing and low jumps.
5. Call out 2-3 genuine strengths — positive reinforcement matters for youth athletes.
6. Use age-appropriate, actionable language. No biomechanics jargon.
7. Coaching cues must be short and memorable (e.g. "step open, explode up", "elbow high, snap through").
8. Notes fields must be 3-5 complete sentences — not fragments.
9. If a metric is not visible due to camera angle, mark it "not_visible" rather than guessing.`
}

const ANALYSIS_PROMPT = `Analyze this player's volleyball approach and swing using the labeled frames above.

Respond with ONLY a valid JSON object matching this exact schema (no markdown, no explanation, just the JSON):
${ANALYSIS_SCHEMA}`

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: 'Method Not Allowed' }
  }

  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: 'CLAUDE_API_KEY not configured' }) }
  }

  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const { frames, analysis, athleteInfo, frameResults, netOrientation } = body

  if (!frames || !Array.isArray(frames) || frames.length === 0) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'No frames provided' }) }
  }

  const client = new Anthropic({ apiKey })

  // Merge net orientation into athleteInfo so context builder can reference it
  const enrichedAthleteInfo = { ...athleteInfo, netOrientation }

  const content = [
    { type: 'text', text: buildSystemContext(enrichedAthleteInfo, analysis, frameResults) },
    ...frames.flatMap((frame) => [
      { type: 'text', text: `\n--- Frame: ${frame.label} ---` },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: frame.base64 } },
    ]),
    { type: 'text', text: ANALYSIS_PROMPT },
  ]

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content }],
    })

    const rawText = message.content[0]?.text || ''
    const cleaned = rawText.replace(/^```json\n?/m, '').replace(/^```\n?/m, '').replace(/```$/m, '').trim()

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      body: JSON.stringify({ feedback: cleaned }),
    }
  } catch (err) {
    console.error('Claude API error:', err)
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: err.message || 'Claude API call failed' }),
    }
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
