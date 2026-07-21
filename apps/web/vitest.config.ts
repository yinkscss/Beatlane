import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Unit tests must not load local apps/web/.env secrets (CI has empty VITE_*).
  define: {
    'import.meta.env.VITE_SENTRY_DSN': JSON.stringify(''),
    'import.meta.env.VITE_POSTHOG_KEY': JSON.stringify(''),
    'import.meta.env.VITE_POSTHOG_HOST': JSON.stringify(''),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
