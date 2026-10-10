import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base: the static build works at a domain root or under a subpath (e.g. GitHub Pages).
// Routing is hash-based, so no server rewrites are needed.
export default defineConfig({
  base: './',
  plugins: [react()],
})
