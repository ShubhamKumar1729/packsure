import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Backend rules, scoring, provider contract and serialization are pure
    // server-side modules — no DOM is needed. React components are covered by
    // typecheck + build + the documented manual/e2e checklist (see docs/TESTING.md).
  },
})
