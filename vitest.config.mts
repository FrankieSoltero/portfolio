import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Test runner for the room planner under room-planner/. Next.js does not read this file;
// it exists only for `npm run test`.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirrors the `@/*` → `./*` path mapping in tsconfig.json.
    alias: { '@': dirname(fileURLToPath(import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['room-planner/test/setup.ts'],
    css: false,
    include: [
      'room-planner/**/*.test.{ts,tsx}',
      'app/room-planner/**/*.test.{ts,tsx}',
      'app/api/room-planner/**/*.test.ts',
      'drills/**/*.test.{ts,tsx}',
      'app/drills/**/*.test.{ts,tsx}',
      'lib/**/*.test.ts',
    ],
  },
})
