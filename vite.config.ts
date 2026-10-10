import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Link previews (og:image) need an absolute URL. SITE_URL wins; on Vercel the build knows its
// production domain. Elsewhere the image path stays relative.
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL
const siteUrl = process.env.SITE_URL ?? (vercelHost ? `https://${vercelHost}/` : '')

// Relative base: the static build works at a domain root or under a subpath (e.g. GitHub Pages).
// Routing is hash-based, so no server rewrites are needed.
export default defineConfig({
  base: './',
  plugins: [react(), { name: 'site-url', transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl) }],
})
