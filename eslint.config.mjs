import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Lints the room planner (`npm run lint` targets room-planner/ and app/room-planner/).
// No Next.js plugin and no react-refresh plugin: the latter is Vite-specific.
export default defineConfig([
  globalIgnores(['.next', 'node_modules', 'public', 'docs', 'papers-scaffold']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
