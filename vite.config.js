import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only plugin: handles /.netlify/functions/analyze inside the Vite server
// so you only need one URL (localhost:5173) during development.
// In production, Netlify serves the real function.
function analyzeDevPlugin() {
  return {
    name: 'analyze-dev',
    apply: 'serve',
    configureServer(server) {
      // Vite doesn't expose non-VITE_ vars to process.env — load them explicitly
      const env = loadEnv('development', process.cwd(), '')
      if (env.CLAUDE_API_KEY) process.env.CLAUDE_API_KEY = env.CLAUDE_API_KEY

      server.middlewares.use('/.netlify/functions/analyze', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(200)
          res.end()
          return
        }
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }

        const chunks = []
        req.on('data', (c) => chunks.push(c))
        await new Promise((r) => req.on('end', r))

        try {
          const { handler } = await import('./netlify/functions/analyze.js')
          const result = await handler({
            httpMethod: 'POST',
            body: Buffer.concat(chunks).toString(),
            headers: req.headers,
          })
          res.writeHead(result.statusCode, {
            'Content-Type': 'application/json',
            ...(result.headers || {}),
          })
          res.end(result.body)
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), analyzeDevPlugin()],
  server: {
    open: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['@mediapipe/pose'],
  },
})
