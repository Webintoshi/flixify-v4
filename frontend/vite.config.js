import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

function resolveReleaseId() {
  const envReleaseId = String(process.env.RELEASE_ID || process.env.GIT_COMMIT_SHA || '').trim()
  if (envReleaseId) {
    return envReleaseId.slice(0, 12)
  }

  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig(() => {
  const releaseId = resolveReleaseId()

  return {
    define: {
      __APP_RELEASE_ID__: JSON.stringify(releaseId)
    },
    plugins: [
      react(),
      legacy({
        modernPolyfills: true,
        renderLegacyChunks: true,
        targets: [
          'Chrome >= 80',
          'Edge >= 79',
          'Firefox >= 78',
          'Safari >= 13',
          'iOS >= 13'
        ]
      }),
      {
        name: 'inject-release-meta',
        transformIndexHtml(html) {
          return html.replace('</head>', `    <meta name="x-release-id" content="${releaseId}" />\n  </head>`)
        }
      }
    ],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false
        }
      }
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true
    }
  }
})
