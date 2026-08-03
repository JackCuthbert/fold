import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        // http-proxy's own default would otherwise cut a slow CalDAV
        // request short in dev and surface it as `socket hang up`, hiding
        // the BFF's 502 — the whole point of the router's deadline. Kept
        // above the server's `idleTimeout` (apps/server/src/index.ts) so
        // the BFF is always the one that answers.
        timeout: 300_000,
        proxyTimeout: 300_000,
      },
    },
  },
})
